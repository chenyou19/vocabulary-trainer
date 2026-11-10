import js from '@eslint/js'
import globals from 'globals'
import hooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', '.pnpm-store/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser }, plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules },
  { files: ['*.{js,ts}', 'tests/**/*.ts', 'scripts/**/*.mjs'], languageOptions: { globals: globals.node } },
)
