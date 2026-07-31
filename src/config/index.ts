import * as dotenv from 'dotenv';
import * as path from 'path';

// ─── Load environment files ───────────────────────────────────────────────────
const testEnv = process.env.TEST_ENV || 'qa';
const envFile = testEnv === 'production' ? '.env' : `.env.${testEnv}`;

dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config(); // fallback to root .env

const appProfile = (process.env.APP_PROFILE || '').toLowerCase();

if (appProfile === 'ftr') {
    process.env.APP_BASE_URL = process.env.FTR_BASE_URL || process.env.APP_BASE_URL || process.env.BASE_URL;
    process.env.APP_USERNAME = process.env.FTR_APP_USERNAME || process.env.APP_USERNAME;
    process.env.APP_PASSWORD = process.env.FTR_APP_PASSWORD || process.env.APP_PASSWORD;
}

if (appProfile === 'dpr') {
    process.env.APP_BASE_URL = process.env.DPR_BASE_URL || process.env.APP_BASE_URL || process.env.BASE_URL;
    process.env.APP_USERNAME = process.env.DPR_APP_USERNAME || process.env.APP_USERNAME;
    process.env.APP_PASSWORD = process.env.DPR_APP_PASSWORD || process.env.APP_PASSWORD;
}

if (appProfile === 'pqr') {
    process.env.APP_BASE_URL = process.env.PQR_BASE_URL || process.env.APP_BASE_URL || process.env.BASE_URL;
    process.env.APP_USERNAME = process.env.PQR_APP_USERNAME || process.env.APP_USERNAME;
    process.env.APP_PASSWORD = process.env.PQR_APP_PASSWORD || process.env.APP_PASSWORD;
}

// ─── Framework Config (rarely changes) ───────────────────────────────────────
export interface AppConfig {
    baseUrl: string;
    defaultTimeout: number;
    navigationTimeout: number;
    logLevel: string;
    retryCount: number;
    testEnv: string;
}

export const config: AppConfig = {
    baseUrl: process.env.APP_BASE_URL || process.env.BASE_URL || 'https://app.example.com',
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000', 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT || '90000', 10),
    logLevel: process.env.LOG_LEVEL || 'INFO',
    retryCount: parseInt(process.env.RETRY_COUNT || '2', 10),
    testEnv,
};

// ─── env() Helper — Read ANY key from .env (no index.ts changes needed) ──────
/**
 * Read any environment variable from your .env file.
 * Just add the key to .env and call env('KEY_NAME') anywhere in code.
 *
 * @example
 *   env('APP_USERNAME')       → 'your-app-username'
 *   env('APP_PASSWORD')       → 'your-app-password'
 *   env('SAUCE_USERNAME')     → 'your-sauce-username'
 *   env('MY_NEW_API_TOKEN')   → reads from .env — no index.ts update needed!
 *
 * @param key - The environment variable name (exactly as in .env)
 * @param fallback - Optional default value if key is missing
 */
export function env(key: string, fallback: string = ''): string {
    return process.env[key] || fallback;
}

// ─── credentials() — Read login secrets from .env ONLY (never JSON/source) ────
export interface Credentials {
    username: string;
    password: string;
}

/**
 * Read login credentials from environment variables ONLY. Credentials must NEVER live in
 * JSON test data or source — they belong in the gitignored `.env.<env>` file and are read
 * from there at runtime.
 *
 * Profiles map to .env keys:
 *   'app'     → APP_USERNAME / APP_PASSWORD
 *   'ftr'     → FTR_APP_USERNAME / FTR_APP_PASSWORD
 *   'dpr'     → DPR_APP_USERNAME / DPR_APP_PASSWORD
 *   'pqr'     → PQR_APP_USERNAME / PQR_APP_PASSWORD          (Non-CQS PQR user)
 *   'pqr-cqs' → PQR_CQS_APP_USERNAME / PQR_CQS_APP_PASSWORD  (CQS PE role)
 *   'pqr-tci' → PQR_TCI_APP_USERNAME / PQR_TCI_APP_PASSWORD  (TCI Port Engineer role)
 *
 * Throws a clear setup error when a key is missing, instead of logging in with blanks.
 */
export type CredentialProfile = 'app' | 'ftr' | 'dpr' | 'pqr' | 'pqr-cqs' | 'pqr-tci';

const CREDENTIAL_PREFIXES: Record<CredentialProfile, string> = {
    app: '',
    ftr: 'FTR_',
    dpr: 'DPR_',
    pqr: 'PQR_',
    'pqr-cqs': 'PQR_CQS_',
    'pqr-tci': 'PQR_TCI_',
};

export function credentials(profile: CredentialProfile = 'app'): Credentials {
    const prefix = CREDENTIAL_PREFIXES[profile];
    const username = env(`${prefix}APP_USERNAME`);
    const password = env(`${prefix}APP_PASSWORD`);
    if (!username || !password) {
        throw new Error(
            `Missing ${profile} credentials. Set ${prefix}APP_USERNAME and ${prefix}APP_PASSWORD in your .env.${testEnv} file.`,
        );
    }
    return { username, password };
}

export default config;
