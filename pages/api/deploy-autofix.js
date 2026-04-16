/**
 * /api/deploy-autofix — AI-Powered Auto-Fix for Failed Deployments
 *
 * Called by /api/deploy-monitor when a Vercel deployment fails.
 *
 * FLOW:
 *   1. Parse the build error to identify the broken file(s) and error type
 *   2. Fetch the broken file's source from GitHub
 *   3. Send the error + source to Anthropic API (Claude) for a fix
 *   4. Push the fixed file back to GitHub via Contents API
 *   5. Vercel auto-rebuilds from the new commit
 *
 * ENV VARS REQUIRED:
 *   ANTHROPIC_API_KEY — Claude API key
 *   GH_PAT            — GitHub PAT with repo write access
 *
 * SAFETY:
 *   - Only fixes files in src/ and pages/ directories
 *   - Will not modify .env, config, or package files
 *   - Circuit breaker in deploy-monitor limits to 3 attempts per SHA
 *   - All fixes are committed with clear "[autofix]" prefix
 */

const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO = 'Smarter-Poker-World-Hub';
const GITHUB_BRANCH = 'main';

// Files that autofix is NEVER allowed to touch
const PROTECTED_FILES = [
  '.env', '.env.local', '.env.production',
  'package.json', 'package-lock.json',
  'next.config.js', 'next.config.mjs',
  'vercel.json', '.gitignore',
  'CLAUDE.md',
];

// Directories autofix is allowed to modify
const ALLOWED_DIRS = ['src/', 'pages/', 'lib/', 'components/', 'services/', 'data/'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Authentication: only accept calls from deploy-monitor (same origin) ──
  // Verify the request comes from our own server, not an external attacker.
  const referer = req.headers.referer || req.headers.origin || '';
  const host = req.headers.host || '';
  const internalSecret = process.env.DEPLOY_INTERNAL_SECRET;
  const providedSecret = req.headers['x-internal-secret'];

  // If DEPLOY_INTERNAL_SECRET is set, require it. Otherwise, verify same-origin.
  if (internalSecret) {
    if (providedSecret !== internalSecret) {
      return res.status(401).json({ error: 'Unauthorized — invalid internal secret' });
    }
  } else {
    // Fallback: only accept requests where the host header matches expected domains
    const allowedHosts = ['smarter.poker', 'localhost:3000', 'localhost:3001'];
    const isFromSelf = allowedHosts.some(h => host.includes(h));
    if (!isFromSelf) {
      return res.status(401).json({ error: 'Unauthorized — external requests not allowed' });
    }
  }

  const { commitSha, commitMessage, deploymentId, buildErrors, attempt } = req.body;

  if (!buildErrors) {
    return res.status(400).json({ error: 'Missing buildErrors in request body' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ghPat = process.env.GH_PAT;

  if (!anthropicKey) {
    return res.status(500).json({ action: 'skipped', reason: 'ANTHROPIC_API_KEY not configured' });
  }
  if (!ghPat) {
    return res.status(500).json({ action: 'skipped', reason: 'GH_PAT not configured' });
  }

  try {
    // ── Step 1: Parse error to find the broken file ──
    const errorFile = extractErrorFile(buildErrors);

    if (!errorFile) {
      console.log('[deploy-autofix] Could not identify broken file from build errors');
      return res.status(200).json({
        action: 'skipped',
        reason: 'Could not identify the broken file from build error output',
        buildErrorsPreview: buildErrors.substring(0, 500),
      });
    }

    // Safety check: normalize path and reject traversal attempts
    const normalizedPath = errorFile.replace(/\\/g, '/');
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || normalizedPath.includes('//')) {
      console.log(`[deploy-autofix] Path traversal attempt blocked: ${errorFile}`);
      return res.status(200).json({
        action: 'skipped',
        reason: `Suspicious file path rejected: ${errorFile}`,
      });
    }

    // Safety check: is this file in an allowed directory?
    const isAllowed = ALLOWED_DIRS.some(dir => normalizedPath.startsWith(dir));
    const isProtected = PROTECTED_FILES.some(pf => normalizedPath.endsWith(pf));

    if (!isAllowed || isProtected) {
      console.log(`[deploy-autofix] File ${errorFile} is outside allowed directories or is protected`);
      return res.status(200).json({
        action: 'skipped',
        reason: `File ${errorFile} is not in an allowed directory or is protected`,
      });
    }

    // ── Step 2: Fetch the broken file from GitHub ──
    console.log(`[deploy-autofix] Fetching ${errorFile} from GitHub...`);
    const fileRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${errorFile}?ref=${GITHUB_BRANCH}`,
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
    );

    if (!fileRes.ok) {
      return res.status(200).json({
        action: 'skipped',
        reason: `Could not fetch ${errorFile} from GitHub (${fileRes.status})`,
      });
    }

    const fileData = await fileRes.json();
    const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const fileSha = fileData.sha;

    // ── Step 3: Ask Claude to fix it ──
    console.log(`[deploy-autofix] Calling Anthropic API to fix ${normalizedPath} (${originalContent.length} chars)...`);

    // Sanitize build errors to prevent prompt injection via crafted error output.
    // Remove any text that looks like it's trying to override Claude's instructions.
    const sanitizedErrors = buildErrors
      .substring(0, 3000)
      .replace(/ignore (all |previous |above )?instructions/gi, '[REDACTED]')
      .replace(/you are now/gi, '[REDACTED]')
      .replace(/system prompt/gi, '[REDACTED]')
      .replace(/\bact as\b/gi, '[REDACTED]')
      .replace(/do not follow/gi, '[REDACTED]');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `You are an expert Next.js/React developer fixing a Vercel build error.

THE BUILD ERROR:
\`\`\`
${sanitizedErrors}
\`\`\`

THE FILE THAT NEEDS FIXING (${normalizedPath}):
\`\`\`
${originalContent.substring(0, 15000)}
\`\`\`

RULES:
- Fix ONLY the specific error shown in the build output
- Do NOT rewrite the entire file — make the MINIMUM change needed
- Do NOT add emoji characters anywhere (they break the SWC compiler)
- Do NOT change .single() to .maybeSingle() unless that is the actual error
- Do NOT remove functionality — only fix the compilation/build error
- If the error is a missing import, add the import
- If the error is a syntax error, fix the syntax
- If the error is an unused variable/import, remove it
- If the error is a merge conflict marker, resolve it keeping the newer code

Return ONLY the complete fixed file content. No explanation, no markdown fences, no commentary. Just the raw file content that should replace the current file.`
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error(`[deploy-autofix] Anthropic API error: ${claudeRes.status} ${errBody}`);
      return res.status(200).json({
        action: 'api_error',
        reason: `Anthropic API returned ${claudeRes.status}`,
      });
    }

    const claudeData = await claudeRes.json();
    let fixedContent = claudeData.content?.[0]?.text || '';

    // Strip markdown fences if Claude included them despite instructions
    fixedContent = fixedContent.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    if (!fixedContent || fixedContent.length < 10) {
      return res.status(200).json({
        action: 'skipped',
        reason: 'Claude returned empty or too-short fix',
      });
    }

    // Sanity check: did Claude actually change something?
    if (fixedContent.trim() === originalContent.trim()) {
      return res.status(200).json({
        action: 'skipped',
        reason: 'Claude returned identical content — no fix identified',
      });
    }

    // Size ratio guard: prevent Claude from gutting a file
    // If the fix is less than 50% of the original size, something went wrong
    const sizeRatio = fixedContent.length / originalContent.length;
    if (sizeRatio < 0.5) {
      console.log(`[deploy-autofix] Size ratio guard: fix is ${Math.round(sizeRatio * 100)}% of original (${fixedContent.length} vs ${originalContent.length} chars)`);
      return res.status(200).json({
        action: 'skipped',
        reason: `Fix is only ${Math.round(sizeRatio * 100)}% of original file size — too destructive, skipping`,
        originalSize: originalContent.length,
        fixSize: fixedContent.length,
      });
    }

    // Content guard: reject fixes that contain merge conflict markers
    if (fixedContent.includes('<<<<<<<') || fixedContent.includes('>>>>>>>')) {
      return res.status(200).json({
        action: 'skipped',
        reason: 'Fix contains merge conflict markers — rejecting',
      });
    }

    // ── Step 4: Push the fix via GitHub Contents API ──
    console.log(`[deploy-autofix] Pushing fix for ${errorFile} to GitHub...`);

    const commitMsg = `[autofix] fix build error in ${errorFile} (attempt ${attempt})\n\nAuto-generated by deploy-monitor. Original error:\n${buildErrors.substring(0, 200)}`;

    const pushRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${errorFile}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${ghPat}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMsg,
          content: Buffer.from(fixedContent).toString('base64'),
          sha: fileSha,
          branch: GITHUB_BRANCH,
        }),
      }
    );

    if (!pushRes.ok) {
      const pushErr = await pushRes.text();
      console.error(`[deploy-autofix] GitHub push failed: ${pushRes.status} ${pushErr}`);
      return res.status(200).json({
        action: 'push_failed',
        reason: `GitHub Contents API returned ${pushRes.status}`,
        error: pushErr.substring(0, 500),
      });
    }

    const pushData = await pushRes.json();
    const newSha = pushData.commit?.sha?.substring(0, 8) || 'unknown';

    console.log(`[deploy-autofix] Fix pushed successfully. New commit: ${newSha}`);

    return res.status(200).json({
      action: 'fixed',
      file: errorFile,
      newCommitSha: newSha,
      attempt,
      message: `Fixed ${errorFile} and pushed commit ${newSha}. Vercel will auto-rebuild.`,
    });

  } catch (err) {
    console.error('[deploy-autofix] Error:', err);
    return res.status(500).json({
      action: 'error',
      error: err.message || 'Internal server error',
    });
  }
}

/**
 * Extract the file path that caused the build error from Vercel build output.
 * Handles common Next.js/SWC error patterns.
 */
function extractErrorFile(buildErrors) {
  // Pattern 1: "./pages/xxx.js" or "./src/xxx.tsx" (most common Next.js pattern)
  const nextjsMatch = buildErrors.match(/\.\/([a-zA-Z0-9_\-\/]+\.(js|jsx|ts|tsx))/);
  if (nextjsMatch) return nextjsMatch[1];

  // Pattern 2: "Module not found: Can't resolve 'xxx' in '/vercel/path0/src/xxx'"
  const moduleMatch = buildErrors.match(/in '\/vercel\/path0\/([^']+)'/);
  if (moduleMatch) return moduleMatch[1];

  // Pattern 3: "Error: /vercel/path0/pages/xxx.js (line:col)"
  const vercelPathMatch = buildErrors.match(/\/vercel\/path0\/([a-zA-Z0-9_\-\/]+\.(js|jsx|ts|tsx))/);
  if (vercelPathMatch) return vercelPathMatch[1];

  // Pattern 4: "pages/xxx.js:123:45" (file:line:col format)
  const fileLineMatch = buildErrors.match(/((?:pages|src|lib|components|services)\/[a-zA-Z0-9_\-\/]+\.(js|jsx|ts|tsx)):\d+/);
  if (fileLineMatch) return fileLineMatch[1];

  // Pattern 5: SWC error format "x ${file}"
  const swcMatch = buildErrors.match(/x\s+((?:pages|src)\/[a-zA-Z0-9_\-\/]+\.(js|jsx|ts|tsx))/);
  if (swcMatch) return swcMatch[1];

  return null;
}
