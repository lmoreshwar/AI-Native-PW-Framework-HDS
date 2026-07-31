import * as path from 'path';

/**
 * Absolute path to the shared test-attachments folder. Drop any file the tests need to
 * upload (images, PDFs, docs) into `src/testdata/attachments/` and reference it by name.
 */
export const ATTACHMENTS_DIR = path.resolve(__dirname, '..', 'testdata', 'attachments');

/**
 * Resolve an attachment file by its file name to an absolute path under the shared
 * `src/testdata/attachments/` folder. Use this whenever a test uploads a file so paths
 * stay OS-agnostic and never hardcoded.
 *
 * @param fileName file name including extension, e.g. `sample-attachment.txt`.
 */
export function attachmentPath(fileName: string): string {
    return path.join(ATTACHMENTS_DIR, fileName);
}
