import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            // Relaxed for Playwright test patterns
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-empty-function': 'off',
            'no-console': 'off', // Logger uses console

            // Code quality
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'no-duplicate-imports': 'error',
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'ai-debug-report/**'],
    }
);
