/**
 * Centralized timeout constants — the single source of truth for the whole framework.
 *
 * Wrappers (`Actions`, `WaitHelper`), `playwright.config.ts`, and modules should all
 * reference these instead of scattering magic numbers. Tune timing in ONE place.
 */
export const TIMEOUTS = {
    /** Quick UI interactions: clicks, fills, fast element waits. */
    SHORT: 10_000,
    /** Default for most waits and assertions. */
    MEDIUM: 30_000,
    /** Slow backend-driven transitions (validation, save, submit, grids). */
    LONG: 90_000,
    /** Per-assertion (`expect`) timeout. */
    EXPECT: 30_000,
    /** Per-action (Playwright `actionTimeout`). */
    ACTION: 30_000,
    /** Per-navigation (`navigationTimeout`). */
    NAVIGATION: 90_000,
    /** Whole-test timeout. */
    TEST: 180_000,
    /** Whole-test timeout for long SSO-driven end-to-end flows (login + multi-section submit). */
    TEST_LONG: 420_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;
