import { Locator } from '@playwright/test';

/**
 * LocatorStrategy — Defines a single locator approach with metadata
 */
export interface LocatorStrategy {
    /** Human-readable name for this strategy (e.g. 'role', 'testid', 'css') */
    name: string;
    /** The Playwright locator to attempt */
    locator: Locator;
}

/**
 * SelfHealingEvent — Logged when a fallback locator is used
 */
export interface SelfHealingEvent {
    timestamp: string;
    elementName: string;
    primaryStrategy: string;
    usedStrategy: string;
    fallbackIndex: number;
    durationMs: number;
    testTitle?: string;
    projectName?: string;
    message: string;
}

/**
 * SelfHealingAttempt — Telemetry for every strategy attempt
 */
export interface SelfHealingAttempt {
    timestamp: string;
    elementName: string;
    strategyName: string;
    strategyIndex: number;
    passed: boolean;
    durationMs: number;
    errorMessage?: string;
}

/**
 * SelfHealingSession — Current test execution context for self-healing telemetry
 */
export interface SelfHealingSession {
    testTitle: string;
    projectName: string;
    startedAt: string;
}

/**
 * SmartLocator — Self-healing locator utility for Playwright
 *
 * Wraps multiple locator strategies with automatic fallback.
 * When the primary locator fails, it tries fallbacks in order
 * and logs a warning for later analysis.
 *
 * @example
 * ```ts
 * const accountMenu = await SmartLocator.resolve('Account Menu', [
 *     { name: 'role', locator: page.getByRole('button', { name: /Account/i }).first() },
 *     { name: 'testid', locator: page.getByTestId('account-menu') },
 *     { name: 'css', locator: page.locator('header button.account').first() },
 * ]);
 * await expect(logo).toBeVisible();
 * ```
 */
export class SmartLocator {
    /** Global registry of all self-healing events during the test run */
    private static healingEvents: SelfHealingEvent[] = [];
    /** Strategy-level telemetry for diagnostics */
    private static healingAttempts: SelfHealingAttempt[] = [];
    /** Current test context for attribution */
    private static currentSession: SelfHealingSession | null = null;

    /**
     * Start a self-healing session for a specific test.
     */
    static startSession(session: SelfHealingSession): void {
        SmartLocator.currentSession = session;
        SmartLocator.reset();
    }

    /**
     * End the current self-healing session.
     */
    static endSession(): void {
        SmartLocator.currentSession = null;
    }

    /**
     * Resolve the first working locator from a list of strategies.
     * Tries each strategy in order; logs a warning if a fallback is used.
     *
     * @param elementName - Human-readable name for logging (e.g. "Logo", "Search Icon")
     * @param strategies - Ordered list of locator strategies (primary first)
     * @param options - Optional configuration
     * @returns The first locator that resolves to a visible/attached element
     */
    static async resolve(
        elementName: string,
        strategies: LocatorStrategy[],
        options: { timeout?: number; state?: 'visible' | 'attached' } = {},
    ): Promise<Locator> {
        const { timeout = 5000, state = 'visible' } = options;

        if (strategies.length === 0) {
            throw new Error(`[SmartLocator] No strategies provided for "${elementName}"`);
        }

        // Try each strategy in order
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            const attemptStartedAt = Date.now();
            try {
                const waitState = state === 'visible' ? 'visible' : 'attached';
                await strategy.locator.waitFor({ state: waitState, timeout });

                const attemptDuration = Date.now() - attemptStartedAt;
                SmartLocator.healingAttempts.push({
                    timestamp: new Date().toISOString(),
                    elementName,
                    strategyName: strategy.name,
                    strategyIndex: i,
                    passed: true,
                    durationMs: attemptDuration,
                });

                // If this is NOT the primary (index > 0), log a self-healing event
                if (i > 0) {
                    const event: SelfHealingEvent = {
                        timestamp: new Date().toISOString(),
                        elementName,
                        primaryStrategy: strategies[0].name,
                        usedStrategy: strategy.name,
                        fallbackIndex: i,
                        durationMs: attemptDuration,
                        testTitle: SmartLocator.currentSession?.testTitle,
                        projectName: SmartLocator.currentSession?.projectName,
                        message: `⚠️ Self-healed "${elementName}": primary "${strategies[0].name}" failed → used fallback "${strategy.name}" (index ${i})`,
                    };
                    SmartLocator.healingEvents.push(event);
                    console.warn(`[SmartLocator] ${event.message}`);
                }

                return strategy.locator;
            } catch (error) {
                SmartLocator.healingAttempts.push({
                    timestamp: new Date().toISOString(),
                    elementName,
                    strategyName: strategy.name,
                    strategyIndex: i,
                    passed: false,
                    durationMs: Date.now() - attemptStartedAt,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });

                // This strategy failed, try next
                if (i < strategies.length - 1) {
                    console.debug(
                        `[SmartLocator] Strategy "${strategy.name}" failed for "${elementName}", trying next...`,
                    );
                }
            }
        }

        // All strategies failed — throw with detailed info
        const tried = strategies.map((s) => s.name).join(', ');
        throw new Error(
            `[SmartLocator] All ${strategies.length} strategies failed for "${elementName}". Tried: [${tried}]. This is likely a Locator Change or UI Bug.`,
        );
    }

    /**
     * Build a combined Playwright locator using .or() chains from strategies.
     * This is a simpler approach that doesn't track self-healing but provides fallback.
     *
     * @param elementName - Human-readable name for error messages
     * @param strategies - Ordered list of locator strategies
     * @returns A single combined locator with .or() chains and .first()
     */
    static combine(elementName: string, strategies: LocatorStrategy[]): Locator {
        if (strategies.length === 0) {
            throw new Error(`[SmartLocator] No strategies provided for "${elementName}"`);
        }

        let combined = strategies[0].locator;
        for (let i = 1; i < strategies.length; i++) {
            combined = combined.or(strategies[i].locator);
        }
        return combined.first();
    }

    /**
     * Get all self-healing events from the current test run
     */
    static getHealingEvents(): SelfHealingEvent[] {
        return [...SmartLocator.healingEvents];
    }

    /**
     * Get all strategy attempts from the current test run.
     */
    static getHealingAttempts(): SelfHealingAttempt[] {
        return [...SmartLocator.healingAttempts];
    }

    /**
     * Check if any self-healing occurred during the run
     */
    static hasSelfHealed(): boolean {
        return SmartLocator.healingEvents.length > 0;
    }

    /**
     * Get a summary string of all self-healing events
     */
    static getSummary(): string {
        if (SmartLocator.healingEvents.length === 0) {
            return '✅ No self-healing events — all primary locators worked.';
        }

        const lines = [
            `⚠️ ${SmartLocator.healingEvents.length} self-healing event(s) detected:`,
            '',
            ...SmartLocator.healingEvents.map(
                (e, i) =>
                    `  ${i + 1}. "${e.elementName}" — primary "${e.primaryStrategy}" → fallback "${e.usedStrategy}"`,
            ),
        ];
        return lines.join('\n');
    }

    /**
     * Build a markdown summary suitable for test attachments and reports.
     */
    static toMarkdownSummary(): string {
        const session = SmartLocator.currentSession;
        const events = SmartLocator.getHealingEvents();
        const attempts = SmartLocator.getHealingAttempts();

        let md = `# Self-Healing Runtime Summary\n\n`;
        md += `- Generated: ${new Date().toISOString()}\n`;
        if (session) {
            md += `- Test: ${session.testTitle}\n`;
            md += `- Project: ${session.projectName}\n`;
            md += `- Session Start: ${session.startedAt}\n`;
        }
        md += `- Total Strategy Attempts: ${attempts.length}\n`;
        md += `- Self-Healed Events: ${events.length}\n\n`;

        if (events.length === 0) {
            md += `✅ No fallback strategy was required in this test run.\n`;
            return md;
        }

        md += `## Events\n\n`;
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            md += `${i + 1}. ${event.elementName}: ${event.primaryStrategy} → ${event.usedStrategy} (${event.durationMs}ms)\n`;
        }

        return md;
    }

    /**
     * Build a structured payload for attachments/reporter parsing.
     */
    static toPayload(): {
        session: SelfHealingSession | null;
        events: SelfHealingEvent[];
        attempts: SelfHealingAttempt[];
    } {
        return {
            session: SmartLocator.currentSession,
            events: SmartLocator.getHealingEvents(),
            attempts: SmartLocator.getHealingAttempts(),
        };
    }

    /**
     * Reset the healing events registry (call between test suites if needed)
     */
    static reset(): void {
        SmartLocator.healingEvents = [];
        SmartLocator.healingAttempts = [];
    }
}
