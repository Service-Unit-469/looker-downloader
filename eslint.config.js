import globals from 'globals';
import pluginJs from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import mochaPlugin from 'eslint-plugin-mocha';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  mochaPlugin.configs.recommended,
  globalIgnores(['coverage/', 'dist/', 'node_modules/']),
];
