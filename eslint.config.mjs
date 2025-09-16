// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // 中间件和类型转换相关的合理警告
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      // 测试文件的合理宽松设置
      '@typescript-eslint/no-unsafe-assignment': 'off',     // 测试中经常需要mock和stub
      '@typescript-eslint/no-unsafe-member-access': 'off',  // 测试响应对象访问
      '@typescript-eslint/no-unsafe-call': 'off',           // 测试工具链调用
      '@typescript-eslint/no-unsafe-argument': 'off',       // 测试参数传递
      '@typescript-eslint/no-unsafe-return': 'off',         // 测试返回值
      '@typescript-eslint/no-unused-vars': 'off',           // 测试中可能有未使用的变量
      '@typescript-eslint/require-await': 'off',            // 测试中的async可能不总是需要await
      '@typescript-eslint/only-throw-error': 'off'          // 测试中可能抛出各种值
    },
  },
);