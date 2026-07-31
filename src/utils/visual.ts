/**
 * Sauce Visual opt-in flag.
 *
 * Visual testing is additive and OFF by default. It only runs when the `VISUAL`
 * env flag is truthy (1 / true / yes) AND Sauce credentials are present, so every
 * normal/CI/saucectl functional run is completely unaffected. Enabling it makes
 * the global setup/teardown create + finish a Sauce Visual build and lets specs
 * push snapshots via `sauceVisualCheck`.
 */
export function isVisualEnabled(): boolean {
    const flag = (process.env.VISUAL ?? '').toLowerCase();
    const optedIn = flag === '1' || flag === 'true' || flag === 'yes';
    const hasCreds = !!process.env.SAUCE_USERNAME && !!process.env.SAUCE_ACCESS_KEY;
    return optedIn && hasCreds;
}
