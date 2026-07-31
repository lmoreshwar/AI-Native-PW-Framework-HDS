const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const testEnv = process.env.TEST_ENV || 'qa';
const envFile = testEnv === 'production' ? '.env' : `.env.${testEnv}`;
const envPath = path.resolve(process.cwd(), envFile);
const rootEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
}

if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath, override: false, quiet: true });
}

// Dev affordance: `node scripts/run-sauce.js --sync-only` regenerates the
// saucectl.yml suites block from the current specs WITHOUT contacting Sauce
// (no credentials required, no cloud run). Useful after adding/renaming tests.
if (process.argv.includes('--sync-only')) {
    syncSauceSuites();
    process.exit(0);
}

const requiredSauceKeys = ['SAUCE_USERNAME', 'SAUCE_ACCESS_KEY'];
const missingSauceKeys = requiredSauceKeys.filter((key) => !process.env[key]);

if (missingSauceKeys.length > 0) {
    console.error(`Missing Sauce Labs credentials: ${missingSauceKeys.join(', ')}`);
    console.error(`Expected them in ${envFile}, .env, or the current shell environment.`);
    process.exit(1);
}

// Provide a build tag for grouping all parallel jobs under one Sauce build.
// Used by saucectl.yml -> sauce.metadata.build ($BUILD_TAG).
if (!process.env.BUILD_TAG) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    process.env.BUILD_TAG = `local-${stamp}`;
}

// ===================================================================
// Auto-sync Sauce suites with the individual tests in src/tests.
// Every `test(...)` in every *.spec.ts becomes its OWN suite (its own
// Sauce job), named "<spec> › <test title>", and targeted with a
// Playwright --grep on the (regex-escaped) test title. This makes the
// Sauce job count match the real test count and shows the test name on
// the dashboard. Skipped tests (test.skip / test.fixme) are excluded so
// no empty jobs are created.
// ===================================================================
syncSauceSuites();

function syncSauceSuites() {
    const testsDir = path.resolve(process.cwd(), 'src', 'tests');
    const saucePath = path.resolve(process.cwd(), 'saucectl.yml');

    if (!fs.existsSync(testsDir) || !fs.existsSync(saucePath)) {
        return;
    }

    const specFiles = fs
        .readdirSync(testsDir)
        .filter((file) => file.endsWith('.spec.ts'))
        .sort();

    if (specFiles.length === 0) {
        return;
    }

    const tests = [];
    for (const file of specFiles) {
        const base = file.replace(/\.spec\.ts$/, '');
        const fileMatch = `${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.spec\\.ts$`;
        const content = fs.readFileSync(path.join(testsDir, file), 'utf-8');
        for (const title of extractTestTitles(content)) {
            tests.push({ base, title, fileMatch });
        }
    }

    if (tests.length === 0) {
        return;
    }

    const suitesBlock = buildSuitesBlock(tests);
    const original = fs.readFileSync(saucePath, 'utf-8');
    const updated = replaceSuitesBlock(original, suitesBlock);

    if (updated !== null && updated !== original) {
        fs.writeFileSync(saucePath, updated, 'utf-8');
        console.log(`Synced saucectl.yml with ${tests.length} test(s) across ${specFiles.length} spec file(s).`);
    }
}

/**
 * Extract every runnable test title from a spec file. Matches `test('title')`
 * and `test.only('title')`; ignores `test.skip`, `test.fixme`, `test.describe`,
 * and `test.setTimeout`. Supports ', ", and ` quoting.
 */
function extractTestTitles(content) {
    const titles = [];
    const re = /^\s*test(?:\.only)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
    for (const line of content.split('\n')) {
        const match = line.match(re);
        if (match) {
            // Unescape simple JS string escapes so grep matches the runtime title.
            titles.push(match[2].replace(/\\(['"`\\])/g, '$1'));
        }
    }
    return titles;
}

/** Escape a string so it can be used as a literal Playwright --grep regex. */
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove characters that break YAML unquoted scalars or artifact folder paths. */
function sanitizeSuiteName(name) {
    return name
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // smart quotes -> ascii
        .replace(/[\u203A\u2039\u00BB\u00AB]/g, '-') // › ‹ » « -> hyphen
        .replace(/[\u00B7\u2022]/g, '-') // · • -> hyphen
        .replace(/[^\x20-\x7E]/g, '') // strip any remaining non-ASCII (Sauce rejects Unicode job names)
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100); // keep names well under Sauce's job-name limit
}

function buildSuitesBlock(tests) {
    const blocks = tests.map(({ base, title, fileMatch }) => {
        const name = sanitizeSuiteName(`${base} - ${title}`);
        // Double-quoted YAML preserves $TEST_ENV expansion by saucectl.
        const nameYaml = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // Single-quoted YAML keeps regex backslashes literal; double any apostrophes.
        const grepYaml = escapeRegex(title).replace(/'/g, "''");
        return [
            `  - name: "${nameYaml} - $TEST_ENV"`,
            '    platformName: Windows 11',
            '    screenResolution: 1440x900',
            '    testMatch:',
            `      - ${fileMatch}`,
            '    params:',
            '      browserName: chrome',
            '      project: desktop-chrome',
            '      headless: false',
            `      grep: '${grepYaml}'`,
        ].join('\n');
    });

    return `suites:\n${blocks.join('\n\n')}\n`;
}

function replaceSuitesBlock(content, suitesBlock) {
    const lines = content.split('\n');
    const startIndex = lines.findIndex((line) => line.trimEnd() === 'suites:');
    if (startIndex === -1) {
        return null;
    }

    // The suites block ends at the next top-level key (a non-indented, non-empty
    // line that is not part of the suites list).
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.length > 0 && !/^\s/.test(line)) {
            endIndex = i;
            break;
        }
    }

    const before = lines.slice(0, startIndex).join('\n');
    const after = lines.slice(endIndex).join('\n');

    return `${before}\n${suitesBlock}\n${after}`;
}

/**
 * Run the post-run aggregator that turns saucectl's combined JUnit into a single
 * ai-debug-report/DEBUG_REPORT.md covering every Sauce job. Never throws — a
 * reporting failure must not change the test exit code.
 */
function aggregateDebugReport() {
    try {
        const aggregatorPath = path.resolve(__dirname, 'aggregate-debug-report.mjs');
        if (!fs.existsSync(aggregatorPath)) {
            return;
        }
        const agg = spawnSync(process.execPath, [aggregatorPath], {
            encoding: 'utf-8',
            env: process.env,
            shell: false,
        });
        if (agg.stdout) {
            process.stdout.write(agg.stdout);
        }
        if (agg.stderr) {
            process.stderr.write(agg.stderr);
        }
    } catch (err) {
        console.error(`[run-sauce] Debug report aggregation skipped: ${err.message}`);
    }
}

const extraArgs = process.argv.slice(2);


const result = process.platform === 'win32'
    ? spawnSync(
          'cmd.exe',
          [
              '/d',
              '/s',
              '/c',
              ['npx', '--yes', 'saucectl@latest', 'run', '-c', 'saucectl.yml', ...extraArgs]
                  .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
                  .join(' '),
          ],
          {
              encoding: 'utf-8',
              env: process.env,
              shell: false,
          },
      )
    : spawnSync('npx', ['--yes', 'saucectl@latest', 'run', '-c', 'saucectl.yml', ...extraArgs], {
          encoding: 'utf-8',
          env: process.env,
          shell: false,
      });

if (result.stdout) {
    process.stdout.write(result.stdout);
}

if (result.stderr) {
    process.stderr.write(result.stderr);
}

if (result.error) {
    console.error(result.error.message);
}

// Build the combined ai-debug-report/DEBUG_REPORT.md covering ALL Sauce jobs
// from saucectl's combined JUnit output. Runs regardless of pass/fail; the
// aggregator no-ops if no report was produced.
aggregateDebugReport();

if (typeof result.status === 'number') {
    process.exit(result.status);
}

process.exit(1);
