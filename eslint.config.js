import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

/**
 * Каталоги, из которых захардкоженные строки уже вычищены.
 * Каждый заход экстракции (chat → onboarding → settings/profile →
 * video/imagegen/tokens → pages/chats/search) дописывает сюда свой путь,
 * и правило удерживает зачищенный слой чистым.
 * Админка сюда не попадает никогда — она остаётся русской по решению из спеки.
 */
export const I18N_MIGRATED_DIRS = [
  'src/i18n/**/*.{ts,tsx}',
  'src/utils/formatters.ts',
  'src/components/settings/LanguageSelect.tsx',
];

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Ratchet: запрещает захардкоженные строки в JSX там, где уже вычищено.
    // Запускается отдельной командой `pnpm lint:i18n`, потому что общий
    // `pnpm lint` красный от ~715 предсуществующих ошибок и сигнал в нём тонет.
    files: I18N_MIGRATED_DIRS,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { markupOnly: true }],
    },
  }
);
