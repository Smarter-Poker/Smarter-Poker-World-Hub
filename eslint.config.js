import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// 🛡️ SMARTER POKER CUSTOM PLUGIN — Blocks dangerous Supabase auth methods
import smarterPokerPlugin from './eslint-plugin-smarter-poker/index.js'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.next']),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'smarter-poker': smarterPokerPlugin,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 🛡️ CRITICAL: Block dangerous Supabase auth methods that cause 0/0/LV1 bug
      'smarter-poker/no-dangerous-supabase-auth': 'error',
      // Disable some noisy rules for JS files
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
