import { reportApiError } from '../../src/lib/sentryWrap';
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

// Configurable via env var so model deprecation doesn't silently break autofix.
// Default to claude-sonnet-4-20250514 which balances speed and quality for build fixes.
const CLAUDE_MODEL = process.env.AUTOFIX_CLAUDE_MODEL || 'claude-3-7-sonnet-20250219';

// Files that autofix is NEVER allowed to touch
const PROTECTED_FILES = [
  '.env', '.env.local', '.env.production',
  'package.json', 'package-lock.json',
  'next.config.js', 'next.config.mjs',
  'vercel.json', '.gitignore',
  'CLAUDE.md',
  // Pipeline self-protection: autofix must never modify its own code
  'pages/api/deploy-monitor.js',
  'pages/api/deploy-autofix.js',
  'scripts/git-safe-push.sh',
  'scripts/verify-deploy.js',
];

// Directories autofix is allowed to modify
const ALLOWED_DIRS = ['src/', 'pages/', 'lib/', 'components/', 'services/', 'data/'];

// Paths where fixes should be routed through a PR instead of pushed to main.
// Rationale: these areas are security/correctness-critical — human review required.
const SENSITIVE_PATHS = [
  'pages/api/auth/',
  'pages/api/stripe',
  'pages/api/webhooks/',
  'src/engine/',
  'src/lib/authUtils',
  'src/lib/supabase',
  'src/services/payment',
  'src/services/billing',
  'src/services/auth',
  'middleware.',
];

function isSensitivePath(path) {
  if (!path) return false;
  return SENSITIVE_PATHS.some((p) => path.includes(p));
}

// Check if a file was changed in the last N hours (git history query).
// A "hot" file is risky to auto-modify because it's probably in an active conflict zone.
async function wasRecentlyChanged(path, ghPat, hours = 24) {
  if (!path || !ghPat) return false;
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?path=${encodeURIComponent(path)}&since=${since}&per_page=5`,
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return false;
    const commits = await res.json();
    return Array.isArray(commits) && commits.length > 0;
  } catch {
    return false;
  }
}

// Multi-file error extraction — scan the full build output for all referenced files.
// Returns de-duplicated list, preserving order of first appearance.
// Char class matches extractErrorFile: dots for multi-dot filenames, brackets for
// Next.js dynamic routes, plus the data/ directory.
function extractAllErrorFiles(buildErrors) {
  if (!buildErrors || typeof buildErrors !== 'string') return [];
  const patterns = [
    /\.\/([\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/g,
    /\/vercel\/path0\/([\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/g,
    /((?:pages|src|lib|components|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts)):\d+/g,
    /x\s+((?:pages|src)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/g,
  ];
  const seen = new Set();
  const out = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(buildErrors)) !== null) {
      const path = m[1];
      if (!seen.has(path)) {
        seen.add(path);
        out.push(path);
      }
    }
  }
  return out;
}

// Open a pull request from a branch for sensitive/risky fixes.
async function openAutofixPR({ branch, baseBranch, title, body, ghPat }) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${ghPat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, head: branch, base: baseBranch }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, reason: `GitHub PR create ${res.status}: ${errText.substring(0, 300)}` };
    }
    const pr = await res.json();
    return { ok: true, url: pr.html_url, number: pr.number };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Create or update a branch at a specific commit SHA.
async function ensureBranch(branchName, fromSha, ghPat) {
  try {
    // Try to create
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${ghPat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
      }
    );
    if (res.ok) return { ok: true, created: true };
    // No 422-as-success fallback: branchName embeds Date.now() so collisions
    // are impossible within the same millisecond. A 422 here means validation
    // error (invalid ref name, rule violation, etc.) and must be surfaced.
    const errText = await res.text();
    return { ok: false, reason: `GitHub branch create ${res.status}: ${errText.substring(0, 300)}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Authentication: only accept calls from deploy-monitor (same origin) ──
  // Verify the request comes from our own server, not an external attacker.
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

    // Validate that the extracted path is a file (has extension), not a directory.
    // Pattern 2 in extractErrorFile can return directory paths from "Module not found"
    // errors, which would cause GitHub Contents API to return a directory listing
    // instead of file content, breaking Buffer.from(data.content, 'base64').
    if (!/\.(jsx|tsx|mjs|cjs|js|ts)$/.test(errorFile)) {
      console.log(`[deploy-autofix] Extracted path has no file extension (likely a directory): ${errorFile}`);
      return res.status(200).json({
        action: 'skipped',
        reason: `Extracted path "${errorFile}" has no recognized file extension — cannot autofix a directory`,
      });
    }

    // Safety check: normalize path and reject traversal attempts.
    // The old check rejected any filename containing `..`, which false-positives
    // on legitimate names like `foo..bar.js`. Now only reject true traversal
    // segments: `/../`, `../` prefix, or any run of 2+ dots as a path segment.
    const normalizedPath = errorFile.replace(/\\/g, '/');
    const hasTraversal =
      normalizedPath.startsWith('../') ||
      normalizedPath.startsWith('/') ||
      normalizedPath.includes('//') ||
      /(^|\/)\.\.(\/|$)/.test(normalizedPath);
    if (hasTraversal) {
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
    console.log(`[deploy-autofix] Fetching ${normalizedPath} from GitHub...`);
    // URL-encode each path segment individually (preserves / as separator, escapes
    // spaces, #, ?, %, etc). Raw template interpolation here was a real bug:
    // a filename with `#` turns the URL into contents/path#fragment, stripping
    // the ?ref= and any path after #.
    const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
    const fileRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodedPath}?ref=${GITHUB_BRANCH}`,
      { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
    );

    if (!fileRes.ok) {
      return res.status(200).json({
        action: 'skipped',
        reason: `Could not fetch ${normalizedPath} from GitHub (${fileRes.status})`,
      });
    }

    const fileData = await fileRes.json();
    // Defensive: Contents API returns an ARRAY when the path is a directory
    // (fileData.content is then undefined). It also returns empty content
    // for files >1MB. Either would crash Buffer.from(undefined, 'base64').
    if (Array.isArray(fileData)) {
      return res.status(200).json({
        action: 'skipped',
        reason: `Path ${normalizedPath} is a directory, not a file — autofix cannot target directories`,
      });
    }
    if (fileData.type !== 'file' || typeof fileData.content !== 'string' || !fileData.content) {
      return res.status(200).json({
        action: 'skipped',
        reason: `File ${normalizedPath} is not retrievable via Contents API (type=${fileData.type}, size=${fileData.size || '?'}). File may be >1MB or a symlink/submodule.`,
      });
    }
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

    // Timeout guard: Vercel functions have a 60s limit (Pro plan).
    // The Claude API call is the slowest part of the chain. Cap it at 45s
    // to leave headroom for the GitHub push that follows.
    const abortController = new AbortController();
    const apiTimeout = setTimeout(() => abortController.abort(), 45000);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
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

    clearTimeout(apiTimeout);

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error(`[deploy-autofix] Anthropic API error: ${claudeRes.status} ${errBody}`);
      return res.status(200).json({
        action: 'api_error',
        reason: `Anthropic API returned ${claudeRes.status}`,
      });
    }

    const claudeData = await claudeRes.json();
    // Extract text from all content blocks typed 'text' (defensive against
    // future Claude responses that return thinking/tool_use blocks first).
    const textBlocks = Array.isArray(claudeData.content)
      ? claudeData.content.filter((b) => b && b.type === 'text').map((b) => b.text || '')
      : [];
    let fixedContent = textBlocks.join('\n').trim();

    // Strip markdown fences — robust to Claude wrapping output in prose or using
    // multiple fences. Approach: if there's a fenced block anywhere, extract its
    // INNER content (between the first ``` and the next ```). Otherwise leave
    // the text as-is and let the size / identical-content guards catch garbage.
    const fenceMatch = fixedContent.match(/```[\w]*\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      fixedContent = fenceMatch[1].trim();
    }
    // Belt-and-braces: strip any remaining bare fences at the very ends.
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

    // Size ratio guard: prevent Claude from gutting a file or returning truncated content.
    // Build fixes (missing import, syntax error, unused var) should never shrink a file
    // by more than 30%. This also catches the truncation bug: files >15KB are truncated
    // in the Claude prompt, so Claude may return only ~15KB of a 30KB file.
    // At 0.7 threshold, a 30KB file truncated to 15KB (ratio 0.5) is correctly rejected.
    // Upper bound 3.0 catches hallucinated mass additions (Claude fabricating large
    // amounts of unrelated code). A legitimate fix for a typical source file should
    // not triple its size. Tiny files (<100 chars) are exempt because adding a normal
    // import statement to a 20-char stub legitimately multiplies size.
    if (originalContent.length === 0) {
      return res.status(200).json({
        action: 'skipped',
        reason: 'Original file is empty — nothing to fix; refusing to seed arbitrary content',
      });
    }
    const sizeRatio = fixedContent.length / originalContent.length;
    if (sizeRatio < 0.7) {
      console.log(`[deploy-autofix] Size ratio guard (shrink): fix is ${Math.round(sizeRatio * 100)}% of original (${fixedContent.length} vs ${originalContent.length} chars)`);
      return res.status(200).json({
        action: 'skipped',
        reason: `Fix is only ${Math.round(sizeRatio * 100)}% of original file size — too destructive, skipping`,
        originalSize: originalContent.length,
        fixSize: fixedContent.length,
      });
    }
    if (originalContent.length >= 100 && sizeRatio > 3.0) {
      console.log(`[deploy-autofix] Size ratio guard (expand): fix is ${Math.round(sizeRatio * 100)}% of original (${fixedContent.length} vs ${originalContent.length} chars)`);
      return res.status(200).json({
        action: 'skipped',
        reason: `Fix is ${Math.round(sizeRatio * 100)}% of original file size — suspicious mass expansion (likely hallucination), skipping`,
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

    // ── Step 4: Push the fix — either directly to main, or via PR for sensitive files ──
    const sensitive = isSensitivePath(normalizedPath);
    const hot = await wasRecentlyChanged(normalizedPath, ghPat, 24);
    const usePR = sensitive || hot;

    const commitMsg = `[autofix] fix build error in ${normalizedPath} (attempt ${attempt})\n\nAuto-generated by deploy-monitor. Original error:\n${buildErrors.substring(0, 200)}`;

    if (usePR) {
      // ── PR MODE ──
      console.log(`[deploy-autofix] Routing through PR (sensitive=${sensitive}, hot=${hot}): ${normalizedPath}`);

      // Get current main HEAD sha to branch from
      const mainRefRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/main`,
        { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github+json' } }
      );
      if (!mainRefRes.ok) {
        return res.status(200).json({
          action: 'push_failed',
          reason: `Could not read main ref (HTTP ${mainRefRes.status})`,
        });
      }
      const mainRef = await mainRefRes.json();
      const mainSha = mainRef.object?.sha;

      const branchName = `autofix/${commitSha.substring(0, 8)}-${Date.now()}`;
      const branchRes = await ensureBranch(branchName, mainSha, ghPat);
      if (!branchRes.ok) {
        return res.status(200).json({
          action: 'push_failed',
          reason: `Branch create failed: ${branchRes.reason}`,
        });
      }

      // Re-fetch file SHA from the branch we just created. If main advanced
      // between our earlier fetch (on ref=main) and branch creation, the
      // fileSha we have may be stale. Using a stale SHA in the PUT below
      // produces HTTP 409. Fetching from ref=branchName guarantees the SHA
      // matches what's actually on the branch we're about to push to.
      let branchFileSha = fileSha;
      try {
        const branchFileRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${normalizedPath}?ref=${branchName}`,
          { headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (branchFileRes.ok) {
          const branchFileData = await branchFileRes.json();
          if (!Array.isArray(branchFileData) && branchFileData.sha) {
            branchFileSha = branchFileData.sha;
          }
        }
      } catch {
        // Fall through with original fileSha — PUT will return 409 if stale,
        // which the caller sees as push_failed with explicit HTTP status.
      }

      // Push file to the new branch
      const branchPushRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${normalizedPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${ghPat}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: commitMsg,
            content: Buffer.from(fixedContent).toString('base64'),
            sha: branchFileSha,
            branch: branchName,
          }),
        }
      );
      if (!branchPushRes.ok) {
        const pushErr = await branchPushRes.text();
        return res.status(200).json({
          action: 'push_failed',
          reason: `Branch push failed (HTTP ${branchPushRes.status})`,
          error: pushErr.substring(0, 500),
        });
      }

      const prRes = await openAutofixPR({
        branch: branchName,
        baseBranch: 'main',
        title: `[autofix] Review needed: ${normalizedPath}`,
        body: `## Autofix proposed a repair for a sensitive file\n\n**File:** \`${normalizedPath}\`\n**Sensitive path:** ${sensitive}\n**Hot file (changed in last 24h):** ${hot}\n**Original broken commit:** \`${commitSha}\`\n**Attempt:** ${attempt}/3\n\n### Build error\n\`\`\`\n${buildErrors.substring(0, 800)}\n\`\`\`\n\nReview the diff and merge if correct. Close if wrong.`,
        ghPat,
      });

      if (!prRes.ok) {
        return res.status(200).json({
          action: 'pr_failed',
          reason: prRes.reason,
          branch: branchName,
        });
      }

      console.log(`[deploy-autofix] PR opened: ${prRes.url}`);
      return res.status(200).json({
        action: 'pr_opened',
        filePath: normalizedPath,
        file: normalizedPath,
        branch: branchName,
        prNumber: prRes.number,
        prUrl: prRes.url,
        sensitive,
        hot,
        attempt,
        message: `Fix staged in PR #${prRes.number} for review (file is ${sensitive ? 'sensitive' : 'recently-changed'}). Vercel will NOT rebuild until the PR is merged.`,
      });
    }

    // ── DIRECT-TO-MAIN MODE (existing behavior) ──
    console.log(`[deploy-autofix] Pushing fix for ${normalizedPath} to main...`);

    const pushRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${normalizedPath}`,
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
    const fullNewSha = pushData.commit?.sha || '';

    console.log(`[deploy-autofix] Fix pushed successfully. New commit: ${newSha}`);

    return res.status(200).json({
      action: 'fixed',
      // Monitor reads autofixResult.filePath and autofixResult.newSha for
      // telemetry + success email. Use those exact names (with legacy aliases
      // for any external consumer that reads `file`/`newCommitSha`).
      filePath: normalizedPath,
      newSha: fullNewSha,
      file: normalizedPath,
      newCommitSha: newSha,
      attempt,
      message: `Fixed ${normalizedPath} and pushed commit ${newSha}. Vercel will auto-rebuild.`,
    });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    // Handle AbortController timeout specifically
    if (err.name === 'AbortError') {
      console.error('[deploy-autofix] Anthropic API call timed out (45s limit)');
      return res.status(200).json({
        action: 'timeout',
        reason: 'Claude API call exceeded 45s timeout — Vercel function would have timed out',
      });
    }
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
/**
 * Extract the file path that caused the build error from Vercel build output.
 * Handles common Next.js/SWC error patterns.
 *
 * Character class `[\w./\-\[\]]` covers:
 *   - \w  = [A-Za-z0-9_]  (standard identifier chars)
 *   - .   = dots in filenames like `button.test.js`, `types.d.ts`, `util.spec.ts`
 *   - /   = path separators
 *   - \-  = hyphens in filenames like `my-component.jsx`
 *   - \[\] = brackets for Next.js dynamic routes like `[id].js`, `[...slug].tsx`
 *
 * Extensions: jsx|tsx|mjs|cjs|js|ts  (kept in sync with extractAllErrorFiles).
 *
 * Historical note: earlier versions used `[a-zA-Z0-9_\-\/]` which excluded
 * dots and brackets. That's why the original PNM failure (`[pnmTab].js`)
 * was NEVER matched by the extractor — autofix had no chance to fire.
 */
function extractErrorFile(buildErrors) {
  if (!buildErrors || typeof buildErrors !== 'string') return null;

  // Pattern 1: "./pages/xxx.js" or "./src/hub/[id].test.jsx"
  const nextjsMatch = buildErrors.match(/\.\/([\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/);
  if (nextjsMatch) return nextjsMatch[1];

  // Pattern 2: "Module not found: Can't resolve 'xxx' in '/vercel/path0/src/xxx'"
  const moduleMatch = buildErrors.match(/in '\/vercel\/path0\/([^']+)'/);
  if (moduleMatch) return moduleMatch[1];

  // Pattern 3: "Error: /vercel/path0/pages/xxx.js (line:col)"
  const vercelPathMatch = buildErrors.match(/\/vercel\/path0\/([\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/);
  if (vercelPathMatch) return vercelPathMatch[1];

  // Pattern 4: "pages/xxx.js:123:45" (file:line:col format)
  const fileLineMatch = buildErrors.match(/((?:pages|src|lib|components|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts)):\d+/);
  if (fileLineMatch) return fileLineMatch[1];

  // Pattern 5: SWC error format "x ${file}"
  const swcMatch = buildErrors.match(/x\s+((?:pages|src)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/);
  if (swcMatch) return swcMatch[1];

  return null;
}
