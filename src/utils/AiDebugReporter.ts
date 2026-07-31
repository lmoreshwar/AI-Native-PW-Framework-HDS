import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Failure categories for auto-classification
 */
type FailureCategory =
    | 'Locator Change'
    | 'Script Issue'
    | 'UI Bug'
    | 'Environment Issue'
    | 'Performance Issue'
    | 'Unknown';

/** Confidence banding for a triage decision. */
type ConfidenceLabel = 'High' | 'Medium' | 'Low';

/**
 * Result of the multi-signal triage engine: ONE primary category with a
 * confidence score and the concrete evidence signals that produced it.
 */
interface TriageResult {
    category: FailureCategory;
    confidence: number; // 0–100
    confidenceLabel: ConfidenceLabel;
    signals: string[]; // human-readable evidence for the chosen category
    secondaryCategory?: FailureCategory; // only set when confidence is low (< 60)
}

/** A single weighted piece of evidence pointing at a category. */
interface TriageSignal {
    category: FailureCategory;
    weight: number;
    label: string;
}

/** Context gathered at test end and fed to the triage engine. */
interface TriageContext {
    errorText: string; // combined, lower-cased error + step text
    healingEventCount: number;
    healingAttemptCount: number;
    hasScreenshot: boolean;
    durationMs: number;
    testTimeoutMs: number;
}

/**
 * Categorized failure entry
 */
interface FailureEntry {
    testTitle: string;
    fullTitle: string;
    specFile: string;
    project: string;
    errorMessage: string;
    errorLocation: string;
    category: FailureCategory;
    confidence: number;
    confidenceLabel: ConfidenceLabel;
    signals: string[];
    secondaryCategory?: FailureCategory;
    selfHealable: boolean;
    suggestion: string;
    screenshotPath?: string;
    tracePath?: string;
    selfHealingCount?: number;
    selfHealingSummary?: string;
}

interface SelfHealingAttachment {
    session: {
        testTitle: string;
        projectName: string;
        startedAt: string;
    } | null;
    events: Array<{
        timestamp: string;
        elementName: string;
        primaryStrategy: string;
        usedStrategy: string;
        fallbackIndex: number;
        durationMs: number;
        message: string;
    }>;
    attempts: Array<{
        timestamp: string;
        elementName: string;
        strategyName: string;
        strategyIndex: number;
        passed: boolean;
        durationMs: number;
        errorMessage?: string;
    }>;
}

/**
 * Custom TTA (Test-Time Analytics) Reporter
 *
 * Features:
 * - Real-time console output with pass/fail icons
 * - Auto-categorizes failures (Locator Change, Script Issue, UI Bug, Environment Issue, Performance Issue)
 * - Generates DEBUG_REPORT.md with categorized RCA for every failure
 * - Generates HTML test report with dark theme
 * - Generates JSON report for CI/CD integration
 * - Writes GitHub Actions step summary (if running in CI)
 */
class AiDebugReporter implements Reporter {
    private reportDir: string = 'ai-debug-report';
    private results: TestReportEntry[] = [];
    private failures: FailureEntry[] = [];
    private startTime: number = 0;
    private totalTests: number = 0;
    private passedTests: number = 0;
    private failedTests: number = 0;
    private skippedTests: number = 0;
    private selfHealingEntries: Array<{
        fullTitle: string;
        project: string;
        events: SelfHealingAttachment['events'];
        attempts: SelfHealingAttachment['attempts'];
    }> = [];

    onBegin(config: FullConfig, suite: Suite): void {
        this.startTime = Date.now();
        this.totalTests = suite.allTests().length;

        // Create report directory
        if (!fs.existsSync(this.reportDir)) {
            fs.mkdirSync(this.reportDir, { recursive: true });
        }

        console.log(`\n🚀 AI Debug Reporter — Running ${this.totalTests} tests\n`);
    }

    onTestBegin(test: TestCase): void {
        console.log(`  ▶ ${test.title}`);
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
        console.log(`  ${icon} ${test.title} (${result.duration}ms)`);

        if (result.status === 'passed') this.passedTests++;
        else if (result.status === 'failed') this.failedTests++;
        else this.skippedTests++;

        // Extract screenshot and trace paths from attachments
        let screenshotPath: string | undefined;
        let tracePath: string | undefined;
        let healingAttachment: SelfHealingAttachment | undefined;
        let healingMarkdownSummary: string | undefined;
        for (const attachment of result.attachments) {
            if (attachment.name === 'screenshot' && attachment.path) {
                screenshotPath = attachment.path;
            }
            if (attachment.name === 'trace' && attachment.path) {
                tracePath = attachment.path;
            }
            if (attachment.name === 'self-healing-events' && attachment.body) {
                try {
                    healingAttachment = JSON.parse(attachment.body.toString('utf-8')) as SelfHealingAttachment;
                } catch {
                    // Ignore malformed attachment payload
                }
            }
            if (attachment.name === 'self-healing-summary' && attachment.body) {
                healingMarkdownSummary = attachment.body.toString('utf-8');
            }
        }

        const selfHealingCount = healingAttachment?.events.length || 0;
        const selfHealingAttemptCount = healingAttachment?.attempts.length || 0;

        if (healingAttachment && (selfHealingCount > 0 || selfHealingAttemptCount > 0)) {
            this.selfHealingEntries.push({
                fullTitle: test.titlePath().join(' > '),
                project: test.parent?.project()?.name || 'default',
                events: healingAttachment.events,
                attempts: healingAttachment.attempts,
            });
        }

        this.results.push({
            title: test.title,
            fullTitle: test.titlePath().join(' > '),
            status: result.status || 'unknown',
            duration: result.duration,
            project: test.parent?.project()?.name || 'default',
            errors: result.errors.map((e) => e.message || '').filter(Boolean),
            steps: result.steps.map((s) => ({
                title: s.title,
                duration: s.duration,
                error: s.error?.message,
            })),
            screenshotPath,
            tracePath,
            selfHealingCount,
            selfHealingAttemptCount,
        });

        // If the test failed, categorize and track the failure
        if (result.status === 'failed' && result.errors.length > 0) {
            const errorMsg = result.errors[0].message || '';
            const errorLocation = this.extractErrorLocation(result.errors[0]);

            // Build a rich evidence context from every available signal — not just the
            // top error line — so the triage engine can commit to ONE category.
            const combinedErrorText = [
                ...result.errors.map((e) => e.message || ''),
                ...result.steps.map((s) => s.error?.message || ''),
            ]
                .filter(Boolean)
                .join('\n');

            const triage = this.triageFailure({
                errorText: this.cleanAnsiCodes(combinedErrorText).toLowerCase(),
                healingEventCount: selfHealingCount,
                healingAttemptCount: selfHealingAttemptCount,
                hasScreenshot: Boolean(screenshotPath),
                durationMs: result.duration,
                testTimeoutMs: test.timeout || 0,
            });
            const { selfHealable, suggestion } = this.getSelfHealingInfo(triage.category, errorMsg);

            this.failures.push({
                testTitle: test.title,
                fullTitle: test.titlePath().join(' > '),
                specFile: test.location?.file ? path.basename(test.location.file) : 'unknown.spec.ts',
                project: test.parent?.project()?.name || 'default',
                errorMessage: this.cleanAnsiCodes(errorMsg),
                errorLocation,
                category: triage.category,
                confidence: triage.confidence,
                confidenceLabel: triage.confidenceLabel,
                signals: triage.signals,
                secondaryCategory: triage.secondaryCategory,
                selfHealable,
                suggestion,
                screenshotPath,
                tracePath,
                selfHealingCount,
                selfHealingSummary: healingMarkdownSummary,
            });
        }
    }

    onEnd(result: FullResult): void {
        const totalTime = Date.now() - this.startTime;

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 AI Debug Report Summary`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`  Total:   ${this.totalTests}`);
        console.log(`  Passed:  ${this.passedTests} ✅`);
        console.log(`  Failed:  ${this.failedTests} ❌`);
        console.log(`  Skipped: ${this.skippedTests} ⏭️`);
        console.log(`  Time:    ${(totalTime / 1000).toFixed(2)}s`);
        console.log(`  Status:  ${result.status.toUpperCase()}`);
        console.log(`${'═'.repeat(60)}\n`);

        this.generateHtmlReport(totalTime);
        this.generateJsonReport(totalTime);

        // Generate Debug Report if there are failures
        if (this.failures.length > 0) {
            this.generateDebugReport(totalTime);
            console.log(`🔍 Debug Report generated with ${this.failures.length} failure(s)`);
        }

        this.generateSelfHealingRunReport(totalTime);

        // Write GitHub Actions step summary if in CI
        this.writeGitHubSummary(totalTime);
    }

    // ═══════════════════════════════════════
    // FAILURE CATEGORIZATION ENGINE
    // ═══════════════════════════════════════

    /**
     * Multi-signal triage engine.
     *
     * Instead of returning on the FIRST matching string, it collects EVERY weighted
     * signal from all available evidence (error text, self-healing telemetry, screenshot
     * presence, timing) and commits to the single highest-scoring category with a
     * confidence score and the human-readable signals that produced it. This removes the
     * "could be A or B" bias: a clear winner reads High confidence; a genuine 50/50 reads
     * Low confidence and names the runner-up so a human knows exactly what to check.
     */
    private triageFailure(ctx: TriageContext): TriageResult {
        const signals = this.detectSignals(ctx);

        if (signals.length === 0) {
            return {
                category: 'Unknown',
                confidence: 30,
                confidenceLabel: 'Low',
                signals: ['No known error pattern matched — open the trace/screenshot to classify.'],
            };
        }

        // Sum weights per category.
        const scores = new Map<FailureCategory, number>();
        const reasons = new Map<FailureCategory, string[]>();
        for (const s of signals) {
            scores.set(s.category, (scores.get(s.category) || 0) + s.weight);
            const list = reasons.get(s.category) || [];
            list.push(s.label);
            reasons.set(s.category, list);
        }

        const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        const [topCategory, topScore] = ranked[0];
        const totalScore = ranked.reduce((sum, [, score]) => sum + score, 0);
        const runnerUp = ranked[1];

        const confidence = this.computeConfidence(topScore, totalScore);
        const confidenceLabel: ConfidenceLabel = confidence >= 80 ? 'High' : confidence >= 55 ? 'Medium' : 'Low';

        return {
            category: topCategory,
            confidence,
            confidenceLabel,
            signals: reasons.get(topCategory) || [],
            secondaryCategory: confidence < 60 && runnerUp && runnerUp[1] > 0 ? runnerUp[0] : undefined,
        };
    }

    /**
     * Collect every weighted signal from the failure evidence.
     * Higher weight = stronger, more specific evidence for that category.
     */
    private detectSignals(ctx: TriageContext): TriageSignal[] {
        const msg = ctx.errorText;
        const out: TriageSignal[] = [];
        const has = (...terms: string[]): boolean => terms.some((t) => msg.includes(t));

        const locatorNotFound =
            has('element(s) not found', 'waiting for locator', 'waiting for getby') ||
            has('not found', 'no element', 'could not find');

        // ── Locator Change ─────────────────────────────────────────────
        if (msg.includes('smartlocator') && msg.includes('strategies failed')) {
            out.push({ category: 'Locator Change', weight: 4, label: 'SmartLocator exhausted all strategies' });
        }
        if (
            has('element(s) not found', 'waiting for locator', 'waiting for getby') &&
            has('tobevisible', 'timeout', 'exceeded')
        ) {
            out.push({ category: 'Locator Change', weight: 3, label: 'Timed out waiting for a locator to appear' });
        } else if (locatorNotFound) {
            out.push({ category: 'Locator Change', weight: 2, label: 'Target element could not be found in the DOM' });
        }
        if (ctx.healingEventCount > 0 && locatorNotFound) {
            out.push({
                category: 'Locator Change',
                weight: 2,
                label: `Self-healing fired ${ctx.healingEventCount}x but still could not resolve the element`,
            });
        }
        if (ctx.hasScreenshot && locatorNotFound) {
            out.push({ category: 'Locator Change', weight: 1, label: 'Page rendered (screenshot exists) but element was missing' });
        }

        // ── Script Issue ───────────────────────────────────────────────
        if (has('strict mode violation') || (msg.includes('resolved to') && msg.includes('elements'))) {
            out.push({ category: 'Script Issue', weight: 4, label: 'Strict-mode violation — selector matched multiple elements' });
        }
        if (has('is not a function', 'cannot read properties', 'cannot read property', 'is not defined', 'referenceerror', 'typeerror:')) {
            out.push({ category: 'Script Issue', weight: 4, label: 'JavaScript runtime error in the test/module code' });
        }

        // ── Environment Issue ──────────────────────────────────────────
        if (
            has('net::err_', 'econnrefused', 'econnreset', 'socket hang up', 'enotfound', 'getaddrinfo') ||
            has('navigation timeout', 'target closed', 'browsercontext.close') ||
            (has('page.goto') && has('timeout')) ||
            has(' 502 ', ' 503 ', ' 504 ', 'bad gateway', 'service unavailable', 'gateway timeout')
        ) {
            out.push({ category: 'Environment Issue', weight: 4, label: 'Network / navigation / infrastructure error' });
        }

        // ── UI Bug (application behaviour changed) ─────────────────────
        if (msg.includes('expected:') && msg.includes('received:') && !locatorNotFound) {
            out.push({ category: 'UI Bug', weight: 3, label: 'Assertion mismatch — expected value differs from what the app rendered' });
        }
        if (has('tohavetext', 'tohavevalue', 'tohavecount', 'tohaveattribute') && !locatorNotFound) {
            out.push({ category: 'UI Bug', weight: 2, label: 'Content/state assertion failed on an element that was present' });
        }

        // ── Actionability: element WAS found but the app would not let us act on it ──
        if (has('intercepts pointer events', 'subtree intercepts pointer')) {
            out.push({ category: 'UI Bug', weight: 3, label: 'Click blocked — another element (overlay/modal) intercepted it' });
        }
        if (has('element is not enabled', 'element is disabled')) {
            out.push({ category: 'UI Bug', weight: 3, label: 'Element was present but disabled — app did not enable it' });
        }
        if (has('element is not stable', 'not stable - waiting')) {
            out.push({ category: 'UI Bug', weight: 2, label: 'Element kept animating/moving (not stable) — UI timing issue' });
        }
        if (has('element is not visible', 'not visible') && !locatorNotFound) {
            out.push({ category: 'UI Bug', weight: 2, label: 'Element exists in the DOM but stayed hidden' });
        }
        if (has('tobeenabled', 'tobechecked', 'tobeeditable', 'tobehidden') && !locatorNotFound) {
            out.push({ category: 'UI Bug', weight: 2, label: 'State assertion (enabled/checked/hidden) failed on a present element' });
        }

        // ── Performance Issue ──────────────────────────────────────────
        // Only when the whole test blew its budget WITHOUT a missing-element cause.
        if (has('test timeout of', 'exceeded') && !locatorNotFound) {
            out.push({ category: 'Performance Issue', weight: 3, label: 'Whole-test time budget exceeded (no missing element)' });
        }
        if (has('waiting for load state', 'waitforloadstate', 'networkidle')) {
            out.push({ category: 'Performance Issue', weight: 2, label: 'Blocked waiting on page load-state / network to settle' });
        }
        if (ctx.testTimeoutMs > 0 && ctx.durationMs >= ctx.testTimeoutMs * 0.9 && !locatorNotFound) {
            out.push({ category: 'Performance Issue', weight: 2, label: 'Ran to ~90%+ of the test time budget' });
        }

        // ── Last-resort hints — so a real error rarely lands as bare "Unknown" ──
        if (out.length === 0) {
            if (has('timeout') && has('exceeded', 'waiting for')) {
                out.push({ category: 'Locator Change', weight: 1, label: 'Timed out waiting on an element/condition (see error line)' });
            } else if (has('expect(') || has('assertion')) {
                out.push({ category: 'UI Bug', weight: 1, label: 'An assertion failed — check the expected vs actual in the error line' });
            }
        }

        return out;
    }

    /**
     * Turn the winning score and total evidence into a 0–100 confidence value.
     * Dominance (top ÷ total) drives the base; absolute strength of the top signal
     * caps it so a single weak match never reads as High confidence.
     */
    private computeConfidence(topScore: number, totalScore: number): number {
        const dominance = totalScore === 0 ? 0 : topScore / totalScore;
        let confidence = Math.round(dominance * 100);

        if (topScore <= 1) confidence = Math.min(confidence, 45);
        else if (topScore <= 2) confidence = Math.min(confidence, 65);
        else if (topScore <= 3) confidence = Math.min(confidence, 82);
        else confidence = Math.min(confidence, 95);

        return Math.max(confidence, 30);
    }

    /**
     * One concise line explaining why the test failed — the first meaningful line of the
     * error, trimmed. Falls back to the top triage signal when the error text is empty.
     */
    private shortReason(f: FailureEntry): string {
        const firstLine = f.errorMessage
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.length > 0);
        const reason = firstLine || f.signals[0] || 'See trace for details.';
        const max = 160;
        return reason.length > max ? `${reason.slice(0, max - 1)}…` : reason;
    }

    /** Escape markdown table-breaking characters so a cell stays on one row. */
    private escapeCell(text: string): string {
        return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
    }

    /** Count failures per category. */
    private countByCategory(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const f of this.failures) counts[f.category] = (counts[f.category] || 0) + 1;
        return counts;
    }

    /**
     * Cluster failures that share the SAME root cause. On a big run (e.g. 50/500) this is
     * the difference between "50 things to read" and "6 problems to fix" — tests are grouped
     * by category + a normalised error signature (dynamic IDs/numbers stripped), so one fix
     * that clears a whole group is obvious. Sorted by blast radius (most tests first).
     */
    private clusterFailures(): Array<{
        category: FailureCategory;
        confidence: number;
        count: number;
        reason: string;
        exampleSpec: string;
    }> {
        const map = new Map<
            string,
            { category: FailureCategory; confidence: number; count: number; reason: string; specs: Set<string> }
        >();
        for (const f of this.failures) {
            const key = `${f.category}::${this.errorSignature(f)}`;
            const existing = map.get(key);
            if (existing) {
                existing.count += 1;
                existing.confidence = Math.max(existing.confidence, f.confidence);
                existing.specs.add(f.specFile);
            } else {
                map.set(key, {
                    category: f.category,
                    confidence: f.confidence,
                    count: 1,
                    reason: this.shortReason(f),
                    specs: new Set([f.specFile]),
                });
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

    /** Normalise an error line so failures with the same cause but different data cluster together. */
    private errorSignature(f: FailureEntry): string {
        return this.shortReason(f)
            .toLowerCase()
            .replace(/\b[0-9a-f]{16,}\b/g, '#') // long hex ids
            .replace(/\b(ftr|pqr|ta|dpr)\d+\b/g, '$1#') // case ids (FTR123 → ftr#)
            .replace(/\d+/g, '#') // any remaining numbers
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Human-friendly run duration (seconds under 90s, else m s). */
    private formatDuration(ms: number): string {
        const s = ms / 1000;
        if (s < 90) return `${s.toFixed(1)}s`;
        const m = Math.floor(s / 60);
        const rem = Math.round(s % 60);
        return `${m}m ${rem}s`;
    }

    /**
     * Get self-healing metadata for a given failure category
     */
    private getSelfHealingInfo(
        category: FailureCategory,
        _errorMsg: string,
    ): { selfHealable: boolean; suggestion: string } {
        switch (category) {
            case 'Locator Change':
                return {
                    selfHealable: true,
                    suggestion:
                        'Use SmartLocator with fallback strategies or update the locator to match the current DOM.',
                };
            case 'Script Issue':
                return {
                    selfHealable: true,
                    suggestion:
                        'Fix the script logic (e.g., add .first() for strict mode, increase timeout, fix assertion).',
                };
            case 'Environment Issue':
                return {
                    selfHealable: false,
                    suggestion: 'Retry the test or check network/server health. Not a code issue.',
                };
            case 'UI Bug':
                return {
                    selfHealable: false,
                    suggestion: '⚠️ Possible application bug — the UI behavior has changed. File a bug report.',
                };
            case 'Performance Issue':
                return {
                    selfHealable: false,
                    suggestion:
                        '🐢 Slow page load or the test exceeded its time budget. Investigate app/network performance; do NOT mask it with a longer hardcoded timeout.',
                };
            default:
                return {
                    selfHealable: false,
                    suggestion: 'Manual investigation required. Check the error details and screenshot.',
                };
        }
    }

    // ═══════════════════════════════════════
    // DEBUG REPORT GENERATION
    // ═══════════════════════════════════════

    /**
     * Generate the DEBUG_REPORT.md with categorized failures
     */
    private generateDebugReport(totalTime: number): void {
        const categoryEmoji: Record<FailureCategory, string> = {
            'Locator Change': '🔗',
            'Script Issue': '📝',
            'UI Bug': '🐛',
            'Environment Issue': '🌐',
            'Performance Issue': '🐢',
            Unknown: '❓',
        };

        let md = `# 🔍 Debug Report\n\n`;
        md += `❌ ${this.failedTests} failed / ${this.totalTests} total · ${this.formatDuration(totalTime)}\n\n`;

        // ── 1. Where to look first: category distribution + who fixes what ──
        const counts = this.countByCategory();
        const distribution = (Object.keys(categoryEmoji) as FailureCategory[])
            .filter((c) => counts[c])
            .map((c) => `${categoryEmoji[c]} ${c} ${counts[c]}`)
            .join(' · ');
        const autoFixable = (counts['Locator Change'] || 0) + (counts['Script Issue'] || 0);
        const appInfra = (counts['UI Bug'] || 0) + (counts['Environment Issue'] || 0);
        const manual = (counts['Performance Issue'] || 0) + (counts['Unknown'] || 0);

        md += `## 🧭 Where to look first\n\n`;
        md += `${distribution}\n\n`;
        md += `- ✅ **Test-side, likely auto-fixable** (Locator + Script): **${autoFixable}**\n`;
        md += `- ⚠️ **App / infra team** (UI Bug + Environment): **${appInfra}**\n`;
        md += `- 🔍 **Needs a manual look** (Performance + Unknown): **${manual}**\n\n`;

        // ── 2. Root-cause clustering: collapse N failures into distinct problems ──
        const groups = this.clusterFailures();
        if (groups.length && this.failures.length > 1) {
            md += `## 🧩 Root Causes — ${this.failures.length} failures grouped into ${groups.length} problem(s)\n\n`;
            md += `| Group | Diagnosis | Tests | Why (shared cause) | Example spec |\n`;
            md += `|---|---|---|---|---|\n`;
            groups.forEach((g, i) => {
                md += `| G${i + 1} | ${categoryEmoji[g.category]} ${g.category} · ${g.confidence}% | **${g.count}** | ${this.escapeCell(
                    g.reason,
                )} | \`${g.exampleSpec}\` |\n`;
            });
            const topGroup = groups[0];
            if (topGroup.count > 1) {
                md += `\n> 💡 Fixing **G1** (${topGroup.category}) likely clears **${topGroup.count}** tests at once — start there.\n`;
            }
            md += `\n`;
        }

        // ── 3. Every failure, one lean row ──
        md += `## 📋 All Failures\n\n`;
        md += `| # | Spec | Test | Diagnosis | Why it failed |\n`;
        md += `|---|---|---|---|---|\n`;
        for (let i = 0; i < this.failures.length; i++) {
            const f = this.failures[i];
            const diagnosis = `${categoryEmoji[f.category]} ${f.category} · ${f.confidence}%${
                f.secondaryCategory ? ` (or ${f.secondaryCategory}?)` : ''
            }`;
            md += `| ${i + 1} | \`${f.specFile}\` | ${this.escapeCell(f.testTitle)} | ${diagnosis} | ${this.escapeCell(
                this.shortReason(f),
            )} |\n`;
        }
        md += `\n> Paste this file into Copilot chat and ask **"debug these failures"** for concrete fixes.\n`;

        // Write to ai-debug-report directory (gitignored locally; uploaded as a CI artifact)
        const reportPath = path.join(this.reportDir, 'DEBUG_REPORT.md');
        fs.writeFileSync(reportPath, md, 'utf-8');
        console.log(`📄 Debug Report: ${path.resolve(reportPath)}`);
    }

    // ═══════════════════════════════════════
    // GITHUB ACTIONS STEP SUMMARY
    // ═══════════════════════════════════════

    /**
     * Write a GitHub Actions step summary if running in CI
     */
    private writeGitHubSummary(totalTime: number): void {
        const summaryPath = process.env.GITHUB_STEP_SUMMARY;
        if (!summaryPath) return; // Not in GitHub Actions

        let summary = `## 📊 Test Results\n\n`;
        summary += `| Metric | Value |\n|---|---|\n`;
        summary += `| Total | ${this.totalTests} |\n`;
        summary += `| ✅ Passed | ${this.passedTests} |\n`;
        summary += `| ❌ Failed | ${this.failedTests} |\n`;
        summary += `| ⏭️ Skipped | ${this.skippedTests} |\n`;
        summary += `| ⏱️ Duration | ${(totalTime / 1000).toFixed(1)}s |\n\n`;

        if (this.failures.length > 0) {
            summary += `### ❌ Failed Tests\n\n`;
            summary += `| Test | Category | Confidence | AI Healable |\n|---|---|---|---|\n`;
            for (const f of this.failures) {
                const healIcon = f.selfHealable ? '✅' : '❌';
                const dot = f.confidenceLabel === 'High' ? '🟢' : f.confidenceLabel === 'Medium' ? '🟡' : '🔴';
                summary += `| ${f.testTitle} | ${f.category} | ${dot} ${f.confidence}% | ${healIcon} |\n`;
            }
            summary += `\n> 📄 Download the **Debug Report** from the artifacts for detailed RCA.\n`;
        } else {
            summary += `### ✅ All tests passed!\n`;
        }

        try {
            fs.appendFileSync(summaryPath, summary, 'utf-8');
        } catch {
            // Silently skip if summary file is not writable
        }
    }

    /**
     * Generate self-healing runtime report for trend analysis
     */
    private generateSelfHealingRunReport(totalTime: number): void {
        const totalHealedEvents = this.selfHealingEntries.reduce((sum, entry) => sum + entry.events.length, 0);
        const totalAttempts = this.selfHealingEntries.reduce((sum, entry) => sum + entry.attempts.length, 0);
        const selfHealRate = totalAttempts === 0 ? 0 : (totalHealedEvents / totalAttempts) * 100;

        let md = `# 🤖 Self-Healing Run Report\n\n`;
        md += `- Generated: ${new Date().toLocaleString()}\n`;
        md += `- Duration: ${(totalTime / 1000).toFixed(1)}s\n`;
        md += `- Total Tests: ${this.totalTests}\n`;
        md += `- Tests With Healing Telemetry: ${this.selfHealingEntries.length}\n`;
        md += `- Total Strategy Attempts: ${totalAttempts}\n`;
        md += `- Total Self-Healed Events: ${totalHealedEvents}\n`;
        md += `- Healing Ratio: ${selfHealRate.toFixed(1)}%\n\n`;

        if (this.selfHealingEntries.length === 0) {
            md += `No self-healing telemetry was captured in this run.\n`;
        } else {
            md += `## Per-Test Events\n\n`;
            for (const entry of this.selfHealingEntries) {
                md += `### ${entry.fullTitle} (${entry.project})\n`;
                md += `- Attempts: ${entry.attempts.length}\n`;
                md += `- Healed: ${entry.events.length}\n`;
                for (const event of entry.events) {
                    md += `  - ${event.elementName}: ${event.primaryStrategy} → ${event.usedStrategy} (${event.durationMs}ms)\n`;
                }
                md += `\n`;
            }
        }

        const mdPath = path.join(this.reportDir, 'SELF_HEALING_REPORT.md');
        fs.writeFileSync(mdPath, md, 'utf-8');

        const jsonPath = path.join(this.reportDir, 'self-healing.json');
        fs.writeFileSync(
            jsonPath,
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    durationMs: totalTime,
                    totalTests: this.totalTests,
                    testsWithHealingTelemetry: this.selfHealingEntries.length,
                    totalAttempts,
                    totalHealedEvents,
                    healingRatioPercent: Number(selfHealRate.toFixed(2)),
                    tests: this.selfHealingEntries,
                },
                null,
                2,
            ),
            'utf-8',
        );

        console.log(`📄 Self-Healing Report: ${path.resolve(mdPath)}`);
    }

    // ═══════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════

    /**
     * Remove ANSI color codes from error messages for clean markdown
     */
    private cleanAnsiCodes(text: string): string {
        // eslint-disable-next-line no-control-regex
        return text.replace(/\u001b\[\d+(;\d+)*m/g, '').trim();
    }

    /**
     * Extract file:line from error stack
     */
    private extractErrorLocation(error: {
        message?: string;
        stack?: string;
        location?: { file: string; line: number; column: number };
    }): string {
        if (error.location) {
            return `${path.basename(error.location.file)}:${error.location.line}`;
        }
        // Try to parse from stack trace
        const stack = error.stack || error.message || '';
        const match = stack.match(/at\s+.*?\(?([\w\\/.-]+\.ts):(\d+):\d+\)?/);
        if (match) {
            return `${path.basename(match[1])}:${match[2]}`;
        }
        return 'Unknown location';
    }

    // ═══════════════════════════════════════
    // REPORT GENERATORS
    // ═══════════════════════════════════════

    private generateHtmlReport(totalTime: number): void {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0a0e1a; color: #e4e4e7; padding: 2rem; }
        .header { text-align: center; margin-bottom: 2rem; }
        .header h1 { font-size: 1.8rem; color: #fff; margin-bottom: .5rem; }
        .summary { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem; }
        .summary-card { background: #1a1f2e; border-radius: 12px; padding: 1.5rem 2rem; min-width: 150px; text-align: center; }
        .summary-card .value { font-size: 2rem; font-weight: 700; }
        .summary-card .label { font-size: 0.85rem; color: #888; margin-top: .25rem; }
        .passed .value { color: #22c55e; }
        .failed .value { color: #ef4444; }
        .skipped .value { color: #eab308; }
        .total .value { color: #3b82f6; }
        .test-list { max-width: 900px; margin: 0 auto; }
        .test-item { background: #1a1f2e; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: .5rem; display: flex; align-items: center; gap: 1rem; }
        .test-item.passed { border-left: 4px solid #22c55e; }
        .test-item.failed { border-left: 4px solid #ef4444; }
        .test-item.skipped { border-left: 4px solid #eab308; }
        .test-item .title { flex: 1; }
        .test-item .duration { color: #888; font-size: 0.85rem; }
        .test-item .project { background: #2d3348; border-radius: 4px; padding: 2px 8px; font-size: 0.75rem; }
        .test-item .category { border-radius: 4px; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; }
        .cat-locator { background: #422006; color: #fb923c; }
        .cat-script { background: #1e1b4b; color: #a5b4fc; }
        .cat-uibug { background: #4c0519; color: #fda4af; }
        .cat-env { background: #052e16; color: #86efac; }
        .error { background: #1c1012; border: 1px solid #ef4444; border-radius: 6px; padding: .75rem; margin-top: .5rem; font-size: 0.85rem; color: #fca5a5; white-space: pre-wrap; word-break: break-word; }
        .timestamp { text-align: center; color: #555; font-size: 0.8rem; margin-top: 2rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Test Report</h1>
        <p style="color:#888">${new Date().toLocaleString()}</p>
    </div>
    <div class="summary">
        <div class="summary-card total"><div class="value">${this.totalTests}</div><div class="label">Total</div></div>
        <div class="summary-card passed"><div class="value">${this.passedTests}</div><div class="label">Passed</div></div>
        <div class="summary-card failed"><div class="value">${this.failedTests}</div><div class="label">Failed</div></div>
        <div class="summary-card skipped"><div class="value">${this.skippedTests}</div><div class="label">Skipped</div></div>
        <div class="summary-card"><div class="value">${(totalTime / 1000).toFixed(1)}s</div><div class="label">Duration</div></div>
    </div>
    <div class="test-list">
        ${this.results
            .map((r) => {
                const failure = this.failures.find((f) => f.fullTitle === r.fullTitle);
                const catClass = failure ? this.getCategoryClass(failure.category) : '';
                const catLabel = failure ? `<span class="category ${catClass}">${failure.category}</span>` : '';
                return `
        <div class="test-item ${r.status}">
            <span>${r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⏭️'}</span>
            <div class="title">
                ${r.fullTitle}
                ${r.errors.length > 0 ? `<div class="error">${this.cleanAnsiCodes(r.errors[0]).substring(0, 300)}</div>` : ''}
            </div>
            ${catLabel}
            <span class="project">${r.project}</span>
            <span class="duration">${r.duration}ms</span>
        </div>`;
            })
            .join('')}
    </div>
    <div class="timestamp">Generated by AI Debug Reporter — AI Self-Healing Framework</div>
</body>
</html>`;

        const reportPath = path.join(this.reportDir, 'index.html');
        fs.writeFileSync(reportPath, html, 'utf-8');
        console.log(`📄 TTA HTML Report: ${path.resolve(reportPath)}`);
    }

    private getCategoryClass(category: FailureCategory): string {
        switch (category) {
            case 'Locator Change':
                return 'cat-locator';
            case 'Script Issue':
                return 'cat-script';
            case 'UI Bug':
                return 'cat-uibug';
            case 'Environment Issue':
                return 'cat-env';
            default:
                return '';
        }
    }

    private generateJsonReport(totalTime: number): void {
        const reportPath = path.join(this.reportDir, 'results.json');
        fs.writeFileSync(
            reportPath,
            JSON.stringify(
                {
                    summary: {
                        total: this.totalTests,
                        passed: this.passedTests,
                        failed: this.failedTests,
                        skipped: this.skippedTests,
                        duration: totalTime,
                        timestamp: new Date().toISOString(),
                    },
                    failures: this.failures.map((f) => ({
                        test: f.testTitle,
                        category: f.category,
                        confidence: f.confidence,
                        confidenceLabel: f.confidenceLabel,
                        signals: f.signals,
                        secondaryCategory: f.secondaryCategory,
                        selfHealable: f.selfHealable,
                        suggestion: f.suggestion,
                        error: f.errorMessage.substring(0, 500),
                        location: f.errorLocation,
                    })),
                    tests: this.results,
                },
                null,
                2,
            ),
            'utf-8',
        );
        console.log(`📄 TTA JSON Report: ${path.resolve(reportPath)}`);
    }
}

interface TestReportEntry {
    title: string;
    fullTitle: string;
    status: string;
    duration: number;
    project: string;
    errors: string[];
    steps: { title: string; duration: number; error?: string }[];
    screenshotPath?: string;
    tracePath?: string;
    selfHealingCount?: number;
    selfHealingAttemptCount?: number;
}

export default AiDebugReporter;
