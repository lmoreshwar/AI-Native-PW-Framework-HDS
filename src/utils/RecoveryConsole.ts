import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * RecoveryConsole — Live, interactive recovery for failed element interactions.
 *
 * When enabled (env `LIVE_RECOVERY=1`, non-CI), a failing `Actions` step does NOT die.
 * Instead it captures the live page state (ARIA snapshot + screenshot), describes the
 * failure, and waits for a human/agent to supply a fix through a file "mailbox"
 * (`.recovery/response.txt`) — or typed input when a TTY is attached. The same browser
 * session stays alive and the test continues once a resolution arrives.
 *
 * Supported responses:
 *   - `retry`            → re-attempt the original locator (page may have caught up)
 *   - `pause`            → drop into the Playwright Inspector, then ask again
 *   - `abort`            → give up and let the original error fail the test
 *   - <any selector>     → use this locator instead (CSS, `text=`, `role=button[name="X"]`,
 *                          `xpath=//...`, `#id`, etc.) and continue
 */
export type RecoveryAction = 'retry' | 'selector' | 'pause' | 'abort';

export interface RecoveryResolution {
    action: RecoveryAction;
    selector?: string;
}

export interface RecoveryContext {
    /** Human-readable element name or selector that was attempted. */
    elementName: string;
    /** The operation that failed (e.g. 'locate', 'click', 'fill'). */
    operation: string;
    /** The underlying error message. */
    error: string;
}

const RECOVERY_DIR = path.resolve(process.cwd(), '.recovery');
const REQUEST_FILE = path.join(RECOVERY_DIR, 'REQUEST.json');
const RESPONSE_TXT = path.join(RECOVERY_DIR, 'response.txt');
const RESPONSE_JSON = path.join(RECOVERY_DIR, 'response.json');
const SNAPSHOT_FILE = path.join(RECOVERY_DIR, 'snapshot.yml');
const SCREENSHOT_FILE = path.join(RECOVERY_DIR, 'screenshot.png');

const KEYWORDS: RecoveryAction[] = ['retry', 'pause', 'abort'];
const REMINDER_INTERVAL_MS = 20_000;
const POLL_INTERVAL_MS = 750;

export class RecoveryConsole {
    /** True when live recovery is explicitly enabled and not running in CI. */
    static isEnabled(): boolean {
        if (process.env.CI) return false;
        const flag = (process.env.LIVE_RECOVERY ?? '').toLowerCase();
        return flag === '1' || flag === 'true' || flag === 'yes';
    }

    /**
     * Surface a failure and block until a human/agent supplies a resolution.
     * Keeps the browser session alive the entire time.
     */
    static async request(page: Page, ctx: RecoveryContext): Promise<RecoveryResolution> {
        this.prepareDir();
        await this.captureEvidence(page, ctx);
        this.printBanner(ctx);

        const raw = await this.waitForResponse();
        return this.parse(raw);
    }

    private static prepareDir(): void {
        fs.mkdirSync(RECOVERY_DIR, { recursive: true });
        for (const file of [RESPONSE_TXT, RESPONSE_JSON]) {
            if (fs.existsSync(file)) fs.rmSync(file, { force: true });
        }
    }

    private static async captureEvidence(page: Page, ctx: RecoveryContext): Promise<void> {
        const request = {
            timestamp: new Date().toISOString(),
            element: ctx.elementName,
            operation: ctx.operation,
            error: ctx.error,
            url: page.url(),
            title: await page.title().catch(() => ''),
            respondVia: RESPONSE_TXT,
            responseFormat: 'A single line: retry | pause | abort | <selector e.g. role=button[name="Submit"]>',
        };
        fs.writeFileSync(REQUEST_FILE, JSON.stringify(request, null, 2), 'utf-8');

        await page
            .locator('body')
            .ariaSnapshot()
            .then((snap) => fs.writeFileSync(SNAPSHOT_FILE, snap, 'utf-8'))
            .catch(() => null);
        await page.screenshot({ path: SCREENSHOT_FILE, fullPage: false }).catch(() => null);
    }

    private static printBanner(ctx: RecoveryContext): void {
        console.warn('\n========================= LIVE RECOVERY =========================');
        console.warn(`  Failed ${ctx.operation} on: ${ctx.elementName}`);
        console.warn(`  Error:    ${ctx.error}`);
        console.warn(`  Snapshot: ${SNAPSHOT_FILE}`);
        console.warn(`  Screen:   ${SCREENSHOT_FILE}`);
        console.warn('  Respond by writing ONE line to:');
        console.warn(`     ${RESPONSE_TXT}`);
        console.warn('  Options: retry | pause | abort | <selector>');
        console.warn('  Selector examples: role=button[name="Submit"]  |  #submit  |  text=Submit  |  xpath=//button');
        if (process.stdin.isTTY) console.warn('  (You may also type the response here and press Enter.)');
        console.warn('=================================================================\n');
    }

    /** Race a file mailbox against optional TTY stdin; resolve with the first response. */
    private static waitForResponse(): Promise<string> {
        return new Promise<string>((resolve) => {
            let settled = false;
            let rl: readline.Interface | undefined;
            const startedAt = Date.now();
            let lastReminder = startedAt;

            const finish = (value: string): void => {
                if (settled) return;
                settled = true;
                clearInterval(timer);
                rl?.close();
                resolve(value);
            };

            const timer = setInterval(() => {
                const fromFile = this.readResponseFile();
                if (fromFile !== null) {
                    finish(fromFile);
                    return;
                }
                if (Date.now() - lastReminder >= REMINDER_INTERVAL_MS) {
                    lastReminder = Date.now();
                    console.warn(`  [live-recovery] still waiting for ${RESPONSE_TXT} ...`);
                }
            }, POLL_INTERVAL_MS);

            if (process.stdin.isTTY) {
                rl = readline.createInterface({ input: process.stdin });
                rl.on('line', (line) => finish(line.trim()));
            }
        });
    }

    /** Read + consume a mailbox response file if present; otherwise null. */
    private static readResponseFile(): string | null {
        if (fs.existsSync(RESPONSE_TXT)) {
            const content = fs.readFileSync(RESPONSE_TXT, 'utf-8').trim();
            fs.rmSync(RESPONSE_TXT, { force: true });
            if (content) return content;
        }
        if (fs.existsSync(RESPONSE_JSON)) {
            const content = fs.readFileSync(RESPONSE_JSON, 'utf-8').trim();
            fs.rmSync(RESPONSE_JSON, { force: true });
            if (content) {
                try {
                    const parsed = JSON.parse(content) as { action?: string; selector?: string };
                    if (parsed.action === 'selector' && parsed.selector) return parsed.selector;
                    if (parsed.action) return parsed.action;
                } catch {
                    return content;
                }
            }
        }
        return null;
    }

    private static parse(input: string): RecoveryResolution {
        const cmd = input.trim();
        const lower = cmd.toLowerCase();
        if ((KEYWORDS as string[]).includes(lower)) {
            return { action: lower as RecoveryAction };
        }
        const match = /^(?:use|selector:?)\s+(.+)$/i.exec(cmd);
        const selector = (match ? match[1] : cmd).trim();
        return { action: 'selector', selector };
    }
}
