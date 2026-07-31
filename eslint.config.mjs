import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/**"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
		rules: {
			"no-console": ["error", { allow: ["error"] }],
			"no-control-regex": "off",
		},
	},
	{
		files: ["tests/**/*.{ts,mjs}", "esbuild.config.mjs"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
);
