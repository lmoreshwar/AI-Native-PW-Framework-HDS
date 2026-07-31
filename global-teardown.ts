import { sauceVisualTeardown } from '@saucelabs/visual-playwright';
import { isVisualEnabled } from './src/utils/visual';

/**
 * Playwright globalTeardown — finish the Sauce Visual build.
 *
 * Only runs when Sauce Visual is opted in (VISUAL=1 + Sauce creds). It finalizes
 * the build created in globalSetup so all snapshots taken during the run are
 * grouped and queued for diffing in the Sauce dashboard. No-op for normal runs.
 */
export default async function globalTeardown(): Promise<void> {
    if (isVisualEnabled()) {
        await sauceVisualTeardown();
    }
}
