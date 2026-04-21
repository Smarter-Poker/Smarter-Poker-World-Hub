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
// Default to claude-3-7-sonnet-20250219 which balances speed and quality for build fixes.
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
  'pages/api/cron/deploy-error-poll.js',
  'pages/api/deploy-status.js',
  'scripts/git-safe-push.sh',
  'scripts/verify-deploy.js',
  'scripts/openclaw-cron-dispatcher.py',
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
    /((?:pages|src|lib|components|utils|hooks|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts)):\d+/g,
    /x\s+((?:pages|src|lib|components|utils|hooks|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/g,
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

// Extend function timeout so the Claude API call (up to 45s) + GitHub push
// can complete before Vercel kills the function. Default 10s is too short.
export const config = { maxDuration: 60 };

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

  const { commitSha, commitMessage, deploymentId, buildErrors, attempt, escalation } = req.body;

  if (!buildErrors) {
    return res.status(400).json({ error: 'Missing buildErrors in request body' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ghPat = process.env.GH_PAT;

  if (!anthropicKey && !process.env.XAI_API_KEY) {
    return res.status(500).json({ action: 'skipped', reason: 'Neither ANTHROPIC_API_KEY nor XAI_API_KEY configured' });
  }
  if (!ghPat) {
    return res.status(500).json({ action: 'skipped', reason: 'GH_PAT not configured' });
  }

  try {
    // ── Step 1: Parse error to find ALL broken files ──
    // Use extractAllErrorFiles to get every broken file in the build.
    // This prevents wasting circuit-breaker attempts fixing one file at a time.
    const allErrorFiles = extractAllErrorFiles(buildErrors);
    const errorFile = allErrorFiles.length > 0 ? allErrorFiles[0] : extractErrorFile(buildErrors);

    if (!errorFile) {
      console.log('[deploy-autofix] Could not identify broken file from build errors');
      return res.status(200).json({
        action: 'skipped',
        reason: 'Could not identify the broken file from build error output',
        buildErrorsPreview: buildErrors.substring(0, 500),
      });
    }

    // If multiple files are broken, fix them all in one pass
    const filesToFix = allErrorFiles.length > 1 ? allErrorFiles : [errorFile];
    console.log(`[deploy-autofix] Found ${filesToFix.length} broken file(s): ${filesToFix.join(', ')}`);

    const results = [];
    for (const currentFile of filesToFix) {
      const fileResult = await fixSingleFile({
        errorFile: currentFile,
        buildErrors,
        commitSha,
        attempt,
        escalation,
        anthropicKey,
        ghPat,
      });
      results.push(fileResult);
      // Stop on first real error (not skips)
      if (fileResult.action === 'error' || fileResult.action === 'timeout') break;
    }

    // Determine overall action from results
    const fixedResults = results.filter(r => r.action === 'fixed');
    const prResults = results.filter(r => r.action === 'pr_opened');
    const skippedResults = results.filter(r => r.action === 'skipped');

    if (fixedResults.length > 0) {
      const lastFixed = fixedResults[fixedResults.length - 1];
      return res.status(200).json({
        action: 'fixed',
        filePath: fixedResults.map(r => r.filePath).join(', '),
        newSha: lastFixed.newSha,
        file: lastFixed.filePath,
        newCommitSha: lastFixed.newCommitSha,
        attempt,
        filesFixed: fixedResults.length,
        totalFiles: filesToFix.length,
        message: `Fixed ${fixedResults.length} file(s) and pushed. Vercel will auto-rebuild.`,
      });
    } else if (prResults.length > 0) {
      return res.status(200).json({
        action: 'pr_opened',
        ...prResults[0],
        attempt,
        message: `Fix staged in PR for review (${prResults.length} file(s)).`,
      });
    } else {
      // All skipped or failed
      const primary = results[0] || { action: 'skipped', reason: 'No files to fix' };
      return res.status(200).json(primary);
    }

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
      error: 'Internal server error',
    });
  }
}

/**
 * Fix a single broken file. Extracted so the handler can loop over multiple files.
 */
async function fixSingleFile({ errorFile, buildErrors, commitSha, attempt, escalation, anthropicKey, ghPat }) {
  try {

    // Validate that the extracted path is a file (has extension), not a directory.
    if (!/\.(jsx|tsx|mjs|cjs|js|ts)$/.test(errorFile)) {
      console.log(`[deploy-autofix] Extracted path has no file extension (likely a directory): ${errorFile}`);
      return {
        action: 'skipped',
        reason: `Extracted path "${errorFile}" has no recognized file extension — cannot autofix a directory`,
      };
    }

    // Safety check: normalize path and reject traversal attempts.
    // The old check rejected any filename containing `..`, which false-positives
    // on legitimate names like `foo..bar.js`. Now only reject true traversal
    // segments: `/../`, `../` prefix, or any run of 2+ dots as a path segment.
    // Also strip any leading slashes so prefix matching works.
    const normalizedPath = errorFile.replace(/\\/g, '/').replace(/^\/+/, '');
    const hasTraversal =
      normalizedPath.startsWith('../') ||
      normalizedPath.startsWith('/') ||
      normalizedPath.includes('//') ||
      /(^|\/)\.\.(\/|$)/.test(normalizedPath);
    if (hasTraversal) {
      console.log(`[deploy-autofix] Path traversal attempt blocked: ${errorFile}`);
      return {
        action: 'skipped',
        reason: `Suspicious file path rejected: ${errorFile}`,
      };
    }

    // Safety check: is this file in an allowed directory?
    const isAllowed = ALLOWED_DIRS.some(dir => normalizedPath.startsWith(dir));
    const isProtected = PROTECTED_FILES.some(pf => normalizedPath.endsWith(pf));

    if (!isAllowed || isProtected) {
      console.log(`[deploy-autofix] File ${errorFile} is outside allowed directories or is protected`);
      return {
        action: 'skipped',
        reason: `File ${errorFile} is not in an allowed directory or is protected`,
      };
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
      return {
        action: 'skipped',
        reason: `Could not fetch ${normalizedPath} from GitHub (${fileRes.status})`,
      };
    }

    const fileData = await fileRes.json();
    if (Array.isArray(fileData)) {
      return {
        action: 'skipped',
        reason: `Path ${normalizedPath} is a directory, not a file — autofix cannot target directories`,
      };
    }
    if (fileData.type !== 'file' || typeof fileData.content !== 'string' || !fileData.content) {
      return {
        action: 'skipped',
        reason: `File ${normalizedPath} is not retrievable via Contents API (type=${fileData.type}, size=${fileData.size || '?'}). File may be >1MB or a symlink/submodule.`,
      };
    }
    const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const fileSha = fileData.sha;

    // ── Step 3: Ask AI to fix it (Anthropic with OpenAI fallback) ──
    // Sanitize build errors to prevent prompt injection via crafted error output.
    const sanitizedErrors = buildErrors
      .substring(0, 3000)
      .replace(/ignore (all |previous |above )?instructions/gi, '[REDACTED]')
      .replace(/you are now/gi, '[REDACTED]')
      .replace(/system prompt/gi, '[REDACTED]')
      .replace(/\bact as\b/gi, '[REDACTED]')
      .replace(/do not follow/gi, '[REDACTED]');

    const promptContent = `You are an expert Next.js/React developer fixing a Vercel build error.

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
${attempt >= 2 && escalation?.hint ? `
ESCALATION (attempt ${attempt}): ${escalation.hint}` : ''}
Return ONLY the complete fixed file content. No explanation, no markdown fences, no commentary. Just the raw file content that should replace the current file.`;

    console.log(`[deploy-autofix] Calling AI to fix ${normalizedPath} (${originalContent.length} chars)...`);
    let fixedContent = '';
    let apiError = '';

    const abortController = new AbortController();
    const apiTimeout = setTimeout(() => abortController.abort(), 45000);

    // ── Primary: Anthropic Claude ──
    if (anthropicKey) {
      try {
        console.log(`[deploy-autofix] Trying Anthropic (${CLAUDE_MODEL})...`);
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
            messages: [{ role: 'user', content: promptContent }],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const textBlocks = Array.isArray(claudeData.content)
            ? claudeData.content.filter((b) => b && b.type === 'text').map((b) => b.text || '')
            : [];
          fixedContent = textBlocks.join('\n').trim();
        } else {
          apiError = `Anthropic API returned ${claudeRes.status}: ${await claudeRes.text()}`;
          console.error(`[deploy-autofix] ${apiError}`);
        }
      } catch (e) {
        apiError = `Anthropic request failed: ${e.message}`;
        console.error(`[deploy-autofix] ${apiError}`);
      }
    }

    // ── Fallback: Grok (xAI) — OpenAI-compatible API ──
    if (!fixedContent && process.env.XAI_API_KEY) {
      // Reset the timeout for Grok — Claude may have consumed most of the 45s budget
      clearTimeout(apiTimeout);
      const grokAbort = new AbortController();
      const grokTimeout = setTimeout(() => grokAbort.abort(), 45000);
      console.log(`[deploy-autofix] Anthropic unavailable — falling back to Grok...`);
      try {
        const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          signal: grokAbort.signal,
          headers: {
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-3-latest',
            messages: [{ role: 'user', content: promptContent }],
          }),
        });

        if (grokRes.ok) {
          const grokData = await grokRes.json();
          fixedContent = (grokData.choices?.[0]?.message?.content || '').trim();
        } else {
          const errBody = await grokRes.text();
          apiError += ` | Grok error: ${grokRes.status}: ${errBody.substring(0, 200)}`;
          console.error(`[deploy-autofix] Grok API error: ${grokRes.status}`);
        }
      } catch (e) {
        apiError += ` | Grok request failed: ${e.message}`;
        console.error(`[deploy-autofix] Grok request failed: ${e.message}`);
      }
      clearTimeout(grokTimeout);
    }

    clearTimeout(apiTimeout);

    if (!fixedContent) {
      return {
        action: 'api_error',
        reason: `All AI autofix attempts failed. Errors: ${apiError.substring(0, 200)}`,
      };
    }

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
      return {
        action: 'skipped',
        reason: 'Claude returned empty or too-short fix',
      };
    }

    // Sanity check: did Claude actually change something?
    if (fixedContent.trim() === originalContent.trim()) {
      return {
        action: 'skipped',
        reason: 'Claude returned identical content — no fix identified',
      };
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
      return {
        action: 'skipped',
        reason: 'Original file is empty — nothing to fix; refusing to seed arbitrary content',
      };
    }
    const sizeRatio = fixedContent.length / originalContent.length;
    // Shrink guard: fixes that remove bad imports from small files legitimately shrink a lot.
    // Only enforce the 70% floor on files > 500 chars. Tiny stubs can shrink freely.
    if (originalContent.length >= 500 && sizeRatio < 0.7) {
      console.log(`[deploy-autofix] Size ratio guard (shrink): fix is ${Math.round(sizeRatio * 100)}% of original (${fixedContent.length} vs ${originalContent.length} chars)`);
      return {
        action: 'skipped',
        reason: `Fix is only ${Math.round(sizeRatio * 100)}% of original file size — too destructive, skipping`,
        originalSize: originalContent.length,
        fixSize: fixedContent.length,
      };
    }
    if (originalContent.length >= 100 && sizeRatio > 3.0) {
      console.log(`[deploy-autofix] Size ratio guard (expand): fix is ${Math.round(sizeRatio * 100)}% of original (${fixedContent.length} vs ${originalContent.length} chars)`);
      return {
        action: 'skipped',
        reason: `Fix is ${Math.round(sizeRatio * 100)}% of original file size — suspicious mass expansion (likely hallucination), skipping`,
        originalSize: originalContent.length,
        fixSize: fixedContent.length,
      };
    }

    // Content guard: reject fixes that contain merge conflict markers
    if (fixedContent.includes('<<<<<<<') || fixedContent.includes('>>>>>>>')) {
      return {
        action: 'skipped',
        reason: 'Fix contains merge conflict markers — rejecting',
      };
    }

    // AUTOPILOT MODE: Always push directly to main. The size guard,
    // content guard, and circuit breaker prevent destructive changes.
    // PR mode disabled to avoid requiring human merge intervention.
    const sensitive = isSensitivePath(normalizedPath);
    const hot = await wasRecentlyChanged(normalizedPath, ghPat, 24);
    const usePR = false; // Force direct-to-main for full autopilot

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
        return {
          action: 'push_failed',
          reason: `Could not read main ref (HTTP ${mainRefRes.status})`,
        };
      }
      const mainRef = await mainRefRes.json();
      const mainSha = mainRef.object?.sha;

      const branchName = `autofix/${commitSha.substring(0, 8)}-${Date.now()}`;
      const branchRes = await ensureBranch(branchName, mainSha, ghPat);
      if (!branchRes.ok) {
        return {
          action: 'push_failed',
          reason: `Branch create failed: ${branchRes.reason}`,
        };
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
        return {
          action: 'push_failed',
          reason: `Branch push failed (HTTP ${branchPushRes.status})`,
          error: pushErr.substring(0, 500),
        };
      }

      const prRes = await openAutofixPR({
        branch: branchName,
        baseBranch: 'main',
        title: `[autofix] Review needed: ${normalizedPath}`,
        body: `## Autofix proposed a repair for a sensitive file\n\n**File:** \`${normalizedPath}\`\n**Sensitive path:** ${sensitive}\n**Hot file (changed in last 24h):** ${hot}\n**Original broken commit:** \`${commitSha}\`\n**Attempt:** ${attempt}/3\n\n### Build error\n\`\`\`\n${buildErrors.substring(0, 800)}\n\`\`\`\n\nReview the diff and merge if correct. Close if wrong.`,
        ghPat,
      });

      if (!prRes.ok) {
        return {
          action: 'pr_failed',
          reason: prRes.reason,
          branch: branchName,
        };
      }

      console.log(`[deploy-autofix] PR opened: ${prRes.url}`);
      return {
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
      };
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
      return {
        action: 'push_failed',
        reason: `GitHub Contents API returned ${pushRes.status}`,
        error: pushErr.substring(0, 500),
      };
    }

    const pushData = await pushRes.json();
    const newSha = pushData.commit?.sha?.substring(0, 8) || 'unknown';
    const fullNewSha = pushData.commit?.sha || '';

    console.log(`[deploy-autofix] Fix pushed successfully. New commit: ${newSha}`);

    return {
      action: 'fixed',
      filePath: normalizedPath,
      newSha: fullNewSha,
      file: normalizedPath,
      newCommitSha: newSha,
      attempt,
      message: `Fixed ${normalizedPath} and pushed commit ${newSha}. Vercel will auto-rebuild.`,
    };

  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[deploy-autofix] Anthropic API call timed out (45s limit)');
      return {
        action: 'timeout',
        reason: 'Claude API call exceeded 45s timeout',
      };
    }
    console.error(`[deploy-autofix] Error fixing ${errorFile}:`, err);
    return {
      action: 'error',
      reason: err.message || 'Unknown error',
    };
  }
}

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
  // Only use the match if it looks like a file (has a recognized extension).
  // Without this guard, bare directory paths like 'src/components' would pass
  // through to fixSingleFile and fail with a 401/404 on the GitHub Contents API.
  const moduleMatch = buildErrors.match(/in '\/vercel\/path0\/([^']+)'/);
  if (moduleMatch && /\.(jsx?|tsx?|mjs|cjs|ts)$/.test(moduleMatch[1])) return moduleMatch[1];

  // Pattern 3: "Error: /vercel/path0/pages/xxx.js (line:col)"
  const vercelPathMatch = buildErrors.match(/\/vercel\/path0\/([\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/);
  if (vercelPathMatch) return vercelPathMatch[1];

  // Pattern 4: "pages/xxx.js:123:45" (file:line:col format)
  const fileLineMatch = buildErrors.match(/((?:pages|src|lib|components|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts)):\d+/);
  if (fileLineMatch) return fileLineMatch[1];

  // Pattern 5: SWC error format "x ${file}"
  const swcMatch = buildErrors.match(/x\s+((?:pages|src|lib|components|services|data)\/[\w./\-\[\]]+\.(?:jsx|tsx|mjs|cjs|js|ts))/);
  if (swcMatch) return swcMatch[1];

  return null;
}
