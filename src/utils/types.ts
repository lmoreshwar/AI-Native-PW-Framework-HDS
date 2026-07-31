/**
 * Shared, framework-wide primitive types.
 *
 * Keep generic, reusable types here (not feature-specific data shapes) so any
 * page/module can consume them without cross-importing feature files.
 */

/** A binary Yes/No choice — pass as a parameter instead of writing per-answer methods. */
export type YesNo = 'Yes' | 'No';
