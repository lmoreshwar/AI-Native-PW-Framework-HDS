import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sauceVisualSetup } from '@saucelabs/visual-playwright';
import { isVisualEnabled } from './src/utils/visual';

/**
 * Playwright globalSetup — auto-refresh the reuse capability index.
 *
 * WHY: `.ai-memory/capabilities.json` is generated from src/ by
 * `scripts/generate-capabilities.mjs`. If it is regenerated only manually
 * (`npm run index`), it drifts out of date the moment someone adds a Page /
 * Module / Spec and forgets the command — the exact bug that hid the FTR draft
 * test from the reuse map.
 *
 * Running it here means EVERY `playwright test` run (npx, npm script, or IDE)
 * rebuilds the index first, so it can never go stale. Output is deterministic,
 * so when nothing changed there is no diff and no cost beyond ~1s.
 *
 * Best-effort: a failure here must never block the test run.
 *
 * When Sauce Visual is opted in (VISUAL=1 + Sauce creds), this also creates the
 * Visual build so specs can attach snapshots. Off by default — no-op otherwise.
 */
export default async function globalSetup(): Promise<void> {
    try {
        execFileSync('node', [path.join(__dirname, 'scripts', 'generate-capabilities.mjs')], {
            stdio: 'ignore',
        });
    } catch {
        // Index refresh is best-effort — never fail the suite because of it.
    }

    if (isVisualEnabled()) {
        // Group every visual build + baseline under a dedicated "PWAF" project (instead of
        // the unlabeled "(Not set)" bucket). branch keys the baselines; default to "main"
        // but honour an explicit VISUAL_BRANCH override (e.g. per-feature-branch baselines).
        const branch = process.env.VISUAL_BRANCH?.trim() || 'main';
        await sauceVisualSetup({
            project: 'PWAF',
            branch,
            defaultBranch: 'main',
        });
    }
}
