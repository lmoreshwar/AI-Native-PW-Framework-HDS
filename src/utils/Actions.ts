import { Locator, Page } from '@playwright/test';
import { TIMEOUTS } from './constants';
import { RecoveryConsole } from './RecoveryConsole';

export type ActionTarget = Locator | string;

export class Actions {
    constructor(private page: Page) {}

    private resolveTarget(target: ActionTarget): Locator {
        if (typeof target === 'string') {
            return this.page.locator(target).first();
        }
        return target;
    }

    private describeTarget(target: ActionTarget): string {
        return typeof target === 'string' ? target : String(target);
    }

    async waitForVisible(target: ActionTarget, timeout: number = TIMEOUTS.SHORT): Promise<Locator> {
        const locator = this.resolveTarget(target);
        try {
            await locator.waitFor({ state: 'visible', timeout });
            return locator;
        } catch (error) {
            if (!RecoveryConsole.isEnabled()) throw error;
            return this.recoverVisible(locator, target, error, timeout);
        }
    }

    /**
     * Live-recovery loop for a visibility failure: surface the failure, then apply the
     * human/agent resolution (retry, a replacement selector, pause, or abort) without
     * tearing down the browser session.
     */
    private async recoverVisible(
        original: Locator,
        target: ActionTarget,
        originalError: unknown,
        timeout: number,
    ): Promise<Locator> {
        const current = original;
        for (;;) {
            const resolution = await RecoveryConsole.request(this.page, {
                elementName: this.describeTarget(target),
                operation: 'locate',
                error: originalError instanceof Error ? originalError.message : String(originalError),
            });

            if (resolution.action === 'abort') throw originalError;
            if (resolution.action === 'pause') {
                await this.page.pause().catch(() => null);
                continue;
            }
            if (resolution.action === 'retry') {
                try {
                    await current.waitFor({ state: 'visible', timeout });
                    return current;
                } catch {
                    continue;
                }
            }
            if (resolution.action === 'selector' && resolution.selector) {
                const candidate = this.page.locator(resolution.selector).first();
                try {
                    await candidate.waitFor({ state: 'visible', timeout });
                    console.warn(`[live-recovery] resolved "${this.describeTarget(target)}" using: ${resolution.selector}`);
                    return candidate;
                } catch {
                    continue;
                }
            }
        }
    }

    async waitForHidden(target: ActionTarget, timeout: number = TIMEOUTS.SHORT): Promise<void> {
        const locator = this.resolveTarget(target);
        await locator.waitFor({ state: 'hidden', timeout });
    }

    async click(target: ActionTarget, options?: { timeout?: number; force?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.click({ force: options?.force });
    }

    async rightClick(target: ActionTarget, options?: { timeout?: number; force?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.click({ button: 'right', force: options?.force });
    }

    async doubleClick(target: ActionTarget, options?: { timeout?: number; force?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.dblclick({ force: options?.force });
    }

    async hover(target: ActionTarget, options?: { timeout?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.hover();
    }

    async type(target: ActionTarget, text: string, options?: { timeout?: number; delay?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.click();
        await locator.pressSequentially(text, { delay: options?.delay ?? 20 });
    }

    async pressOn(target: ActionTarget, key: string, options?: { timeout?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.press(key);
    }

    async fill(target: ActionTarget, value: string, options?: { timeout?: number; clearFirst?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        if (options?.clearFirst) {
            await locator.clear();
        }
        await locator.fill(value);
    }

    async clear(target: ActionTarget, options?: { timeout?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.clear();
    }

    async blur(target: ActionTarget, options?: { timeout?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.blur();
    }

    /**
     * Fill a native `<input type="date">` with a YYYY-MM-DD value, automatically clamped to
     * the field's own `min`/`max` bounds. Pass no `value` (or 'today') to use today's date.
     * Use this for any date input instead of opening Chromium's native picker (which
     * Playwright cannot interact with) and to avoid "Date must be on or before ..." errors.
     */
    async fillNativeDate(
        target: ActionTarget,
        value: 'today' | string = 'today',
        options?: { timeout?: number },
    ): Promise<string> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        const desiredIso = value === 'today' ? Actions.toIsoDate(new Date()) : value;
        // Clamp to the field's bounds using real date math (lexical compares on non-padded
        // attributes can yield a malformed value), and only honor bounds that parse cleanly.
        const min = Actions.parseIsoDate(await locator.getAttribute('min').catch(() => null));
        const max = Actions.parseIsoDate(await locator.getAttribute('max').catch(() => null));
        let desired = Actions.parseIsoDate(desiredIso) ?? new Date();
        if (max && desired > max) desired = max;
        if (min && desired < min) desired = min;
        const finalIso = Actions.toIsoDate(desired);
        await locator.fill(finalIso);
        await locator.blur();
        return finalIso;
    }

    /** Format a Date as a YYYY-MM-DD string suitable for native date inputs. */
    static toIsoDate(date: Date): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    /** Parse a YYYY-M-D / YYYY-MM-DD string into a Date, or null if it is not a valid date. */
    static parseIsoDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
        if (!match) return null;
        const [, year, month, day] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    async check(target: ActionTarget, options?: { timeout?: number; force?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.check({ force: options?.force });
    }

    async uncheck(target: ActionTarget, options?: { timeout?: number; force?: boolean }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.uncheck({ force: options?.force });
    }

    async selectOption(
        target: ActionTarget,
        value: string | string[],
        options?: { timeout?: number },
    ): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.selectOption(value);
    }

    async dragAndDrop(source: ActionTarget, destination: ActionTarget, options?: { timeout?: number }): Promise<void> {
        const timeout = options?.timeout ?? TIMEOUTS.SHORT;
        const sourceLocator = await this.waitForVisible(source, timeout);
        const destinationLocator = await this.waitForVisible(destination, timeout);
        await sourceLocator.dragTo(destinationLocator);
    }

    async uploadFiles(target: ActionTarget, files: string | string[], options?: { timeout?: number }): Promise<void> {
        const locator = await this.waitForVisible(target, options?.timeout ?? TIMEOUTS.SHORT);
        await locator.setInputFiles(files);
    }

    /**
     * Upload one or more files by clicking a trigger control (e.g. a "Browse" button) that
     * opens the OS file chooser. This is the robust path when the underlying
     * `<input type="file">` is hidden or re-created on click, so a direct `setInputFiles`
     * is ignored by the app. The click and the file-chooser wait are started together to
     * avoid a race.
     */
    async uploadViaFileChooser(
        trigger: ActionTarget,
        files: string | string[],
        options?: { timeout?: number },
    ): Promise<void> {
        const timeout = options?.timeout ?? TIMEOUTS.MEDIUM;
        const triggerLocator = await this.waitForVisible(trigger, timeout);
        const [chooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout }),
            triggerLocator.click({ timeout }),
        ]);
        await chooser.setFiles(files);
    }

    async scrollIntoView(target: ActionTarget, options?: { timeout?: number }): Promise<void> {
        const locator = this.resolveTarget(target);
        await locator.scrollIntoViewIfNeeded({ timeout: options?.timeout ?? TIMEOUTS.SHORT });
    }

    async press(key: string): Promise<void> {
        await this.page.keyboard.press(key);
    }
}