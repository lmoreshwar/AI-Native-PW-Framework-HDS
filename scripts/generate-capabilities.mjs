// @ts-check
/**
 * generate-capabilities.mjs — Reuse Index Generator
 *
 * Scans src/pages, src/modules, src/tests, and src/fixtures to produce a single
 * authoritative capability index at `.ai-memory/capabilities.json`.
 *
 * WHY: The AI agent (and humans) can read ONE small file to know exactly which
 * Page Objects, locator methods, Module workflows, fixtures, and spec coverage
 * already exist — instead of re-reading every source file (slow) or re-deriving
 * locators that already exist (wrong). This is the "reuse-first fast path".
 *
 * This file is auto-maintained: run `npm run index` after adding/changing any
 * Page, Module, or Spec. Output is deterministic (sorted) so diffs stay clean.
 *
 * Zero runtime dependencies — pure Node fs + regex (no parser, no install).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, '.ai-memory');
const OUT_FILE = join(OUT_DIR, 'capabilities.json');

/**
 * Recursively list *.ts files under a directory (skips .d.ts).
 * @param {string} dir
 * @returns {string[]}
 */
function listTsFiles(dir) {
    if (!existsSync(dir)) return [];
    /** @type {string[]} */
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listTsFiles(full));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out.sort();
}

/**
 * Workspace-relative POSIX path for stable, link-friendly output.
 * @param {string} p
 * @returns {string}
 */
function rel(p) {
    return relative(ROOT, p).split('\\').join('/');
}

/**
 * Extract the first exported/declared class name from a TS source string.
 * @param {string} src
 * @returns {string | null}
 */
function extractClassName(src) {
    const m = src.match(/export\s+class\s+([A-Za-z0-9_]+)/) || src.match(/\bclass\s+([A-Za-z0-9_]+)/);
    return m ? m[1] : null;
}

/**
 * Extract PUBLIC async method names from a class source.
 * - Skips `private`/`protected` members (internal helpers).
 * - Skips the constructor.
 * - De-dupes and sorts for deterministic output.
 * @param {string} src
 * @returns {string[]}
 */
function extractPublicAsyncMethods(src) {
    /** @type {Set<string>} */
    const methods = new Set();
    const re = /(^|\n)\s*(public\s+|private\s+|protected\s+)?async\s+([A-Za-z0-9_]+)\s*\(/g;
    let match;
    while ((match = re.exec(src)) !== null) {
        const visibility = (match[2] || '').trim();
        const name = match[3];
        if (visibility === 'private' || visibility === 'protected') continue;
        if (name === 'constructor') continue;
        methods.add(name);
    }
    return [...methods].sort();
}

/**
 * Build a {file, class, methods} record for a Page/Module file.
 * @param {string} file
 * @returns {{ file: string, class: string | null, methods: string[] }}
 */
function describeClassFile(file) {
    const src = readFileSync(file, 'utf-8');
    return {
        file: rel(file),
        class: extractClassName(src),
        methods: extractPublicAsyncMethods(src),
    };
}

/**
 * Extract @Tags (e.g. @P0 @Smoke) found anywhere in a spec.
 * @param {string} src
 * @returns {string[]}
 */
function extractTags(src) {
    const tags = new Set();
    const re = /@([A-Za-z][A-Za-z0-9]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) tags.add('@' + m[1]);
    return [...tags].sort();
}

/**
 * Extract test.describe(...) titles from a spec.
 * @param {string} src
 * @returns {string[]}
 */
function extractDescribes(src) {
    const titles = [];
    const re = /test\.describe\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(src)) !== null) titles.push(m[1]);
    return titles;
}

/**
 * Extract imported Module/Page class names a spec reuses.
 * @param {string} src
 * @returns {string[]}
 */
function extractReuses(src) {
    const reuses = new Set();
    const re = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/(modules|pages)\/[^'"]*['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        for (const name of m[1].split(',')) {
            const clean = name.trim();
            if (clean && /^[A-Za-z]/.test(clean)) reuses.add(clean);
        }
    }
    return [...reuses].sort();
}

/**
 * Build a {file, describe, tags, reuses} record for a spec file.
 * @param {string} file
 * @returns {{ file: string, describes: string[], tags: string[], reuses: string[] }}
 */
function describeSpecFile(file) {
    const src = readFileSync(file, 'utf-8');
    return {
        file: rel(file),
        describes: extractDescribes(src),
        tags: extractTags(src),
        reuses: extractReuses(src),
    };
}

/** Extract fixture names declared in src/fixtures/index.ts (TestFixtures type). */
function extractFixtures() {
    const file = join(SRC, 'fixtures', 'index.ts');
    if (!existsSync(file)) return [];
    const src = readFileSync(file, 'utf-8');
    const typeBlock = src.match(/TestFixtures\s*=\s*\{([\s\S]*?)\};/);
    if (!typeBlock) return [];
    const fixtures = new Set();
    const re = /^\s*([A-Za-z0-9_]+)\s*:/gm;
    let m;
    while ((m = re.exec(typeBlock[1])) !== null) fixtures.add(m[1]);
    return [...fixtures].sort();
}

/** Extract available util class names from src/utils. */
function extractUtils() {
    return listTsFiles(join(SRC, 'utils'))
        .map((f) => basename(f, '.ts'))
        .filter((n) => n !== 'index')
        .sort();
}

function main() {
    const pages = listTsFiles(join(SRC, 'pages'))
        .filter((f) => !f.endsWith('index.ts'))
        .map(describeClassFile);

    const modules = listTsFiles(join(SRC, 'modules'))
        .filter((f) => !f.endsWith('index.ts'))
        .map(describeClassFile);

    const specs = listTsFiles(join(SRC, 'tests')).map(describeSpecFile);

    const index = {
        $schema: 'reuse-capability-index/v1',
        purpose:
            'Authoritative reuse map. READ THIS FIRST before writing locators or methods. ' +
            'If an asset is listed here it ALREADY EXISTS — reuse it; do not re-derive or re-capture it.',
        generatedAt: new Date().toISOString(),
        regenerateWith: 'npm run index',
        counts: { pages: pages.length, modules: modules.length, specs: specs.length },
        fixtures: extractFixtures(),
        utils: extractUtils(),
        pages,
        modules,
        specs,
    };

    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(index, null, 2) + '\n', 'utf-8');

    console.log(`✅ Wrote ${rel(OUT_FILE)}`);
    console.log(`   pages=${pages.length} modules=${modules.length} specs=${specs.length}`);
}

main();
