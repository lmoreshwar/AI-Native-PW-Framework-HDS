#!/usr/bin/env node
/**
 * Combined Sauce Debug Report aggregator.
 *
 * On Sauce, every test runs as its own job on its own VM, so the local
 * ai-debug-report/ only ever reflects a single (local) run — never the whole
 * cloud run. This script closes that gap: after `saucectl run`, saucectl writes
 * ONE combined JUnit file (saucectl-report.xml, enabled in saucectl.yml). We
 * parse it and regenerate ai-debug-report/DEBUG_REPORT.md so it covers EVERY
 * test/job from the Sauce run, using the same failure categories as the local
 * AiDebugReporter.
 *
 * Pure Node, no dependencies. Safe to run even if no report exists (it no-ops).
 */
import fs from 'fs';
import path from 'path';

const CATEGORY_EMOJI = {
    'Locator Change': '🔗',
    'Script Issue': '📝',
    'UI Bug': '🐛',
    'Environment Issue': '🌐',
    'Performance Issue': '🐢',
    Unknown: '❓',
};

const cwd = process.cwd();
const reportDir = path.resolve(cwd, 'ai-debug-report');
const sauceRoot = path.resolve(cwd, 'test-results', 'sauce');
const reportJsonPath = path.resolve(cwd, 'saucectl-report.json');
const reportXmlPath = path.resolve(cwd, 'saucectl-report.xml');

// Prefer the RICH per-job artifacts saucectl downloads into test-results/sauce/<job>/
// (error-context.md + junit.xml + trace/screenshot). The combined saucectl-report.xml
// is lossy — multi-test specs can show tests="0" there and drop real failures — so we
// only fall back to it when no per-job artifacts / saucectl-report.json are present.
const jobs = loadJobs();

if (jobs.length === 0) {
    console.log('[aggregate-debug-report] No Sauce jobs found (no saucectl-report.json / per-job artifacts / saucectl-report.xml) — skipping.');
    process.exit(0);
}

const failures = jobs
    .filter((j) => j.status === 'failed' || j.status === 'no-tests')
    .map((j) => {
        const triage = j.status === 'no-tests'
            ? { category: 'Environment Issue', confidence: 60, signals: ['Job ran but executed 0 tests — grep/selection or spec-load problem on the Sauce VM.'] }
            : triage_(j.errorText || '');
        const fixable = j.status === 'no-tests'
            ? { fixable: false, owner: 'infra', action: 'This Sauce job executed 0 tests. Check the suite `grep` in saucectl.yml vs the test title, and confirm the spec loads on the VM. No product fix — a selection/config problem.' }
            : classifyFixable(triage.category);
        return { ...j, ...triage, ...fixable };
    });

const totalTime = jobs.reduce((sum, j) => sum + (j.durationMs || 0), 0);
const summary = {
    total: jobs.length,
    passed: jobs.filter((j) => j.status === 'passed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    notRun: jobs.filter((j) => j.status === 'no-tests').length,
    skipped: jobs.filter((j) => j.status === 'skipped').length,
};

writeMarkdown(summary, jobs, failures, totalTime);
writeJson(summary, failures, totalTime);

console.log(
    `[aggregate-debug-report] Combined report written for ${summary.total} job(s): ` +
        `${summary.passed} passed / ${summary.failed} failed` +
        (summary.notRun ? ` / ${summary.notRun} ran-no-tests` : '') +
        (summary.skipped ? ` / ${summary.skipped} skipped` : '') + '.',
);

// ────────────────────────────────────────────────────────────────────
// Job loading — rich per-job artifacts first, combined JUnit as fallback
// ────────────────────────────────────────────────────────────────────
function loadJobs() {
    // Primary source: saucectl-report.json — authoritative per-job status,
    // Sauce URL and artifacts directory for EVERY job in the cloud run.
    if (fs.existsSync(reportJsonPath)) {
        try {
            const arr = JSON.parse(fs.readFileSync(reportJsonPath, 'utf-8'));
            if (Array.isArray(arr) && arr.length) return arr.map(enrichJob).filter(Boolean);
        } catch (e) {
            console.log('[aggregate-debug-report] Could not parse saucectl-report.json:', e.message);
        }
    }
    // Fallback: combined JUnit (lossy — may miss multi-test failures).
    if (fs.existsSync(reportXmlPath)) return parseCombinedXml(fs.readFileSync(reportXmlPath, 'utf-8'));
    return [];
}

function enrichJob(j) {
    const name = j.name || 'unknown job';
    const durationMs = typeof j.duration === 'number' ? j.duration / 1e6 : 0; // ns → ms
    let dir = '';
    const art = Array.isArray(j.artifacts) ? j.artifacts.find((a) => a && a.filePath) : null;
    if (art) dir = path.resolve(cwd, path.dirname(art.filePath));
    else {
        const guess = path.join(sauceRoot, name.replace(/[^A-Za-z0-9@_-]+/g, '_'));
        if (fs.existsSync(guess)) dir = guess;
    }

    const job = {
        name,
        status: normalizeStatus(j.status),
        sauceUrl: j.url || '',
        durationMs,
        specFile: deriveSpecFromName(name),
        testTitle: name,
        errorText: '',
        location: '',
        logsTail: [],
        snapshotExcerpt: '',
        smartLocatorElement: '',
        smartLocatorTried: '',
        evidenceDir: dir ? path.relative(cwd, dir) : '',
        evidence: [],
    };

    if (dir && fs.existsSync(dir)) readPerJobArtifacts(job, dir);
    return job;
}

function readPerJobArtifacts(job, dir) {
    for (const f of ['test-failed-1.png', 'trace.zip', 'video.mp4', 'error-context.md', 'console.log']) {
        if (fs.existsSync(path.join(dir, f))) job.evidence.push(f);
    }

    // error-context.md — Playwright writes the real error, exact spec:line and a
    // page (aria) snapshot on every failure. This is the best evidence for fixes.
    const ec = path.join(dir, 'error-context.md');
    if (fs.existsSync(ec)) {
        const md = fs.readFileSync(ec, 'utf-8');
        const loc = md.match(/- Location:\s*(.+)/);
        if (loc) job.location = loc[1].trim();
        const nameM = md.match(/- Name:\s*(.+)/);
        if (nameM) job.testTitle = nameM[1].trim();
        const errBlock = md.match(/# Error details\s*```[a-z]*\n([\s\S]*?)```/i);
        if (errBlock) job.errorText = errBlock[1].trim();
        const snap = md.match(/# Page snapshot\s*```[a-z]*\n([\s\S]*?)```/i);
        if (snap) job.snapshotExcerpt = snap[1].split('\n').slice(0, 14).join('\n').trimEnd();
    }

    // junit.xml — exact spec file + system-out (the log of what the test was doing
    // right before it failed) + a fallback error source.
    const jx = path.join(dir, 'junit.xml');
    if (fs.existsSync(jx)) {
        const xml = fs.readFileSync(jx, 'utf-8');
        const specM = xml.match(/<testsuite\b[^>]*\bname="([^"]*\.spec\.ts)"/);
        if (specM) job.specFile = specM[1];
        const so = xml.match(/<system-out><!\[CDATA\[([\s\S]*?)\]\]><\/system-out>/);
        if (so) {
            job.logsTail = so[1]
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l && !l.startsWith('[[ATTACHMENT'))
                .slice(-6);
        }
        if (!job.errorText) {
            const fe = xml.match(/<(failure|error)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/);
            if (fe) job.errorText = decode([parseAttrs(fe[2]).message || '', stripCdata(fe[3] || '')].filter(Boolean).join('\n')).trim();
        }
        if (!job.errorText) {
            const se = xml.match(/<system-err><!\[CDATA\[([\s\S]*?)\]\]><\/system-err>/);
            if (se) job.errorText = se[1].trim().split('\n').slice(0, 8).join('\n');
        }
        // A job that loaded but ran 0 tests → selection/config problem, not a real failure.
        const suite = xml.match(/<testsuite\b([^>]*)>/);
        if (job.status !== 'failed' && suite && Number(parseAttrs(suite[1]).tests || '0') === 0) job.status = 'no-tests';
    }

    // Pull the SmartLocator element + tried strategies for precise locator diagnosis.
    const sl = job.errorText.match(/strategies failed for "([^"]+)"\.\s*Tried:\s*\[([^\]]*)\]/i);
    if (sl) {
        job.smartLocatorElement = sl[1];
        job.smartLocatorTried = sl[2];
    }
}

function parseCombinedXml(content) {
    const out = [];
    const caseRe = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
    let m;
    while ((m = caseRe.exec(content)) !== null) {
        const attrs = parseAttrs(m[1]);
        const inner = m[3] || '';
        const name = decode(attrs.name || 'unknown test');
        let status = 'passed';
        let errorText = '';
        const fe = inner.match(/<(failure|error)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/);
        if (/<skipped\b/.test(inner)) status = 'skipped';
        else if (fe) {
            status = 'failed';
            errorText = decode([parseAttrs(fe[2]).message || '', stripCdata(fe[3] || '')].filter(Boolean).join('\n')).trim();
        }
        out.push({
            name,
            testTitle: name,
            specFile: deriveSpecFromName(name),
            status,
            errorText,
            sauceUrl: '',
            durationMs: (Number.parseFloat(attrs.time || '0') || 0) * 1000,
            location: '',
            logsTail: [],
            snapshotExcerpt: '',
            smartLocatorElement: '',
            smartLocatorTried: '',
            evidenceDir: '',
            evidence: [],
        });
    }
    return out;
}

function normalizeStatus(s) {
    s = (s || '').toLowerCase();
    if (s === 'passed' || s === 'complete' || s === 'success') return 'passed';
    if (s === 'skipped') return 'skipped';
    return 'failed';
}

function deriveSpecFromName(name) {
    const base = String(name).split(' - ')[0].trim();
    const m = base.match(/([\w-]+\.spec\.ts)/);
    if (m) return m[1];
    return base ? `${base}.spec.ts` : 'unknown.spec.ts';
}

function classifyFixable(category) {
    switch (category) {
        case 'Locator Change':
            return {
                fixable: true,
                owner: 'copilot',
                action: 'Repair the locator in the Page Object and add SmartLocator fallback strategies (use the page snapshot in error-context.md as evidence for the new selector).',
            };
        case 'Script Issue':
            return {
                fixable: true,
                owner: 'copilot',
                action: 'Fix the test/module logic — e.g. add `.first()`, await the action, or correct the selector/assertion.',
            };
        case 'UI Bug':
            return {
                fixable: false,
                owner: 'human',
                action: 'App behaviour changed — verify manually. **This could be a product bug; manual intervention likely needed.** Attach the screenshot + trace to the defect.',
            };
        case 'Environment Issue':
            return {
                fixable: false,
                owner: 'infra',
                action: 'Network / navigation / infrastructure error — re-run the job. Not a code fix.',
            };
        case 'Performance Issue':
            return {
                fixable: false,
                owner: 'human',
                action: 'Slow load / timeout — investigate the app or infra. Do **not** mask with longer timeouts. Manual review.',
            };
        default:
            return {
                fixable: false,
                owner: 'human',
                action: 'No known pattern matched — open the Sauce trace/video to classify. Manual review needed.',
            };
    }
}

function parseAttrs(str) {
    const attrs = {};
    const re = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(str)) !== null) attrs[m[1]] = m[2];
    return attrs;
}

function stripCdata(text) {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decode(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#10;/g, '\n')
        .replace(/&#9;/g, '\t')
        .replace(/&amp;/g, '&');
}

// ────────────────────────────────────────────────────────────────────
// Compact failure triage — mirrors src/utils/AiDebugReporter.ts categories.
// Kept intentionally lightweight (keyword-only) since JUnit gives us error
// text but none of the runtime telemetry the live reporter has.
// ────────────────────────────────────────────────────────────────────
function triage_(rawError) {
    const msg = rawError.toLowerCase();
    const has = (...terms) => terms.some((t) => msg.includes(t));
    const signals = [];

    const locatorNotFound = has('element(s) not found', 'waiting for locator', 'waiting for getby', 'no element', 'could not find');

    if (msg.includes('smartlocator') && msg.includes('strategies failed')) {
        signals.push({ category: 'Locator Change', weight: 4, label: 'SmartLocator exhausted all strategies' });
    }
    if (locatorNotFound && has('timeout', 'exceeded', 'tobevisible')) {
        signals.push({ category: 'Locator Change', weight: 3, label: 'Timed out waiting for a locator to appear' });
    } else if (locatorNotFound) {
        signals.push({ category: 'Locator Change', weight: 2, label: 'Target element could not be found in the DOM' });
    }
    if (has('strict mode violation') || (msg.includes('resolved to') && msg.includes('elements'))) {
        signals.push({ category: 'Script Issue', weight: 4, label: 'Strict-mode violation — selector matched multiple elements' });
    }
    if (has('is not a function', 'cannot read properties', 'cannot read property', 'is not defined', 'referenceerror', 'typeerror:')) {
        signals.push({ category: 'Script Issue', weight: 4, label: 'JavaScript runtime error in the test/module code' });
    }
    if (
        has('net::err_', 'econnrefused', 'econnreset', 'socket hang up', 'enotfound', 'getaddrinfo') ||
        has('navigation timeout', 'target closed') ||
        has(' 502 ', ' 503 ', ' 504 ', 'bad gateway', 'service unavailable', 'gateway timeout') ||
        msg.includes("executable doesn't exist")
    ) {
        signals.push({ category: 'Environment Issue', weight: 4, label: 'Network / navigation / infrastructure error' });
    }
    if (msg.includes('expected:') && msg.includes('received:') && !locatorNotFound) {
        // A bare boolean assertion (`Expected: true / Received: false`) is NOT a reliable
        // UI-Bug signal — it just means a module/helper returned a boolean, which is most
        // often a fragile matcher (e.g. exact-text vs combined string), changed test data,
        // or a timing gap. Only a mismatch of CONCRETE values (e.g. "ES 250" vs "ES 350")
        // is real UI-Bug evidence. Route booleans to Unknown so they get investigated, not
        // confidently labelled a product bug.
        const booleanAssertion = /expected:\s*(true|false)\b/.test(msg) && /received:\s*(true|false)\b/.test(msg);
        if (booleanAssertion) {
            signals.push({
                category: 'Unknown',
                weight: 2,
                label: 'Boolean assertion (toBe true/false) from a helper — open error-context/trace to classify; often a fragile matcher or changed data, not a product bug',
            });
        } else {
            signals.push({ category: 'UI Bug', weight: 3, label: 'Assertion mismatch — expected value differs from the app' });
        }
    }
    if (has('intercepts pointer events', 'element is not enabled', 'element is disabled', 'element is not visible') && !locatorNotFound) {
        signals.push({ category: 'UI Bug', weight: 2, label: 'Element present but not actionable (blocked/disabled/hidden)' });
    }
    if (has('test timeout of', 'waiting for load state', 'networkidle') && !locatorNotFound) {
        signals.push({ category: 'Performance Issue', weight: 2, label: 'Time budget exceeded / blocked on load-state' });
    }

    if (signals.length === 0) {
        return {
            category: 'Unknown',
            confidence: 30,
            signals: ['No known error pattern matched — open the Sauce job trace/video to classify.'],
        };
    }

    const scores = new Map();
    const reasons = new Map();
    for (const s of signals) {
        scores.set(s.category, (scores.get(s.category) || 0) + s.weight);
        reasons.set(s.category, [...(reasons.get(s.category) || []), s.label]);
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [topCategory, topScore] = ranked[0];
    const total = ranked.reduce((sum, [, v]) => sum + v, 0);
    let confidence = Math.round((topScore / total) * 100);
    if (topScore <= 1) confidence = Math.min(confidence, 45);
    else if (topScore <= 2) confidence = Math.min(confidence, 65);
    else if (topScore <= 3) confidence = Math.min(confidence, 82);
    else confidence = Math.min(confidence, 95);
    confidence = Math.max(confidence, 30);

    return { category: topCategory, confidence, signals: reasons.get(topCategory) || [] };
}

// ────────────────────────────────────────────────────────────────────
// Report rendering
// ────────────────────────────────────────────────────────────────────
function shortReason(f) {
    const firstLine = String(f.errorText || '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0);
    let reason = firstLine || (f.signals && f.signals[0]) || 'See Sauce job for details.';
    reason = reason.replace(/^Error:\s*/i, '');
    return reason.length > 200 ? `${reason.slice(0, 199)}…` : reason;
}

function escapeCell(text) {
    return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function escapeInline(text) {
    return String(text).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function shortTitle(t) {
    const parts = String(t).split(/\s>>\s|\s›\s/);
    return parts[parts.length - 1].trim();
}

function errorSignature(f) {
    return shortReason(f)
        .toLowerCase()
        .replace(/\b[0-9a-f]{16,}\b/g, '#')
        .replace(/\b(ftr|pqr|ta|dpr)\d+\b/g, '$1#')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .trim();
}

function clusterFailures(failures) {
    const map = new Map();
    for (const f of failures) {
        const key = `${f.category}::${errorSignature(f)}`;
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            existing.confidence = Math.max(existing.confidence, f.confidence);
            existing.specs.add(f.specFile);
        } else {
            map.set(key, { category: f.category, confidence: f.confidence, count: 1, reason: shortReason(f), specs: new Set([f.specFile]) });
        }
    }
    return [...map.values()]
        .map((g) => {
            const example = [...g.specs][0];
            return {
                category: g.category,
                confidence: g.confidence,
                count: g.count,
                reason: g.reason,
                exampleSpec: g.specs.size > 1 ? `${example} +${g.specs.size - 1} more` : example,
            };
        })
        .sort((a, b) => b.count - a.count);
}

function formatDuration(ms) {
    const s = ms / 1000;
    if (s < 90) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function renderFailureLite(f, i) {
    const where = f.location || f.specFile;
    let s = `**${i}. ${escapeInline(shortTitle(f.testTitle))}** — \`${where}\`\n`;
    s += `- ${CATEGORY_EMOJI[f.category]} ${f.category} · ${f.confidence}%`;
    if (f.smartLocatorElement) s += ` · element \`${f.smartLocatorElement}\` (tried: ${f.smartLocatorTried || 'n/a'})`;
    s += `\n`;
    s += `- Error: ${escapeInline(shortReason(f))}\n`;
    s += `- Fix: ${escapeInline(f.action)}\n`;
    const ev = f.evidenceDir ? `\`${f.evidenceDir.replace(/\\/g, '/')}/error-context.md\`` : '';
    if (ev || f.sauceUrl) {
        s += `- Evidence:${ev ? ` ${ev}` : ''}${f.sauceUrl ? `${ev ? ' · ' : ' '}[Sauce](${f.sauceUrl})` : ''}\n`;
    }
    return s + `\n`;
}

function writeMarkdown(summary, jobs, failures, totalTime) {
    fs.mkdirSync(reportDir, { recursive: true });

    let md = `# 🔍 Sauce Failures — ${summary.failed} of ${summary.total}\n\n`;

    if (failures.length === 0) {
        md += `✅ All ${summary.total} jobs passed.\n`;
        fs.writeFileSync(path.join(reportDir, 'DEBUG_REPORT.md'), md, 'utf-8');
        return;
    }

    const auto = failures.filter((f) => f.fixable);
    const manual = failures.filter((f) => !f.fixable);
    md += `🤖 ${auto.length} Copilot-fixable · 🧑 ${manual.length} needs human · ⏱️ ${formatDuration(totalTime)}\n`;
    md += `> Snapshot + full error per test = the linked \`error-context.md\`. Machine-readable: \`sauce-results.json\`.\n\n`;

    const groups = clusterFailures(failures);
    if (groups.length && failures.length > 1) {
        md += `## 🧩 Root causes (${failures.length} → ${groups.length})\n`;
        groups.forEach((g, i) => {
            md += `- **G${i + 1}** ${CATEGORY_EMOJI[g.category]} ${g.category} ×${g.count} — ${escapeInline(g.reason)}\n`;
        });
        md += `\n`;
    }

    if (auto.length) {
        md += `## 🤖 Copilot-fixable (locator / script)\n\n`;
        auto.forEach((f, i) => (md += renderFailureLite(f, i + 1)));
    }
    if (manual.length) {
        md += `## 🧑 Needs human — likely product bug / infra\n\n`;
        manual.forEach((f, i) => (md += renderFailureLite(f, i + 1)));
    }

    fs.writeFileSync(path.join(reportDir, 'DEBUG_REPORT.md'), md, 'utf-8');
}

function writeJson(summary, failures, totalTime) {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
        path.join(reportDir, 'sauce-results.json'),
        JSON.stringify(
            {
                source: 'test-results/sauce/<job> per-job artifacts (fallback: saucectl-report.xml)',
                summary: { ...summary, duration: totalTime, timestamp: new Date().toISOString() },
                failures: failures.map((f) => ({
                    test: f.testTitle,
                    spec: f.specFile,
                    location: f.location || null,
                    status: f.status,
                    category: f.category,
                    confidence: f.confidence,
                    fixable: !!f.fixable,
                    owner: f.owner || null,
                    recommendedAction: f.action || null,
                    smartLocatorElement: f.smartLocatorElement || null,
                    smartLocatorTried: f.smartLocatorTried || null,
                    lastActions: f.logsTail || [],
                    evidence: f.evidence || [],
                    evidenceDir: f.evidenceDir || null,
                    sauceUrl: f.sauceUrl || null,
                    signals: f.signals || [],
                    error: String(f.errorText || '').substring(0, 800),
                })),
            },
            null,
            2,
        ),
        'utf-8',
    );
}
