// ESLint 9 flat config, migrated from the previous .eslintrc.js.
// Rules removed on purpose because @typescript-eslint v8 no longer ships them:
// indent (stylistic), no-parameter-properties, no-object-literal-type-assertion,
// interface-name-prefix - all were disabled or superseded anyway.
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
	{
		ignores: ["build/**", "node_modules/**", "eslint.config.mjs", "gulpfile.js"],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2020,
			sourceType: "module",
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			"quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-use-before-define": [
				"error",
				{ functions: false, typedefs: false, classes: false },
			],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ ignoreRestSiblings: true, argsIgnorePattern: "^_" },
			],
			"@typescript-eslint/explicit-function-return-type": [
				"warn",
				{ allowExpressions: true, allowTypedFunctionExpressions: true },
			],
			"@typescript-eslint/no-non-null-assertion": "off", // needed for Map.has()/get()!
			"no-var": "error",
			"prefer-const": "error",
			"no-trailing-spaces": "error",
		},
	},
	{
		files: ["src/**/*.test.ts"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
			// chai assertions are expressions with no assignment (expect(x).to.be.true)
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
];
