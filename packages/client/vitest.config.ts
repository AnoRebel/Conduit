import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom",
		globals: true,
		include: ["src/**/*.spec.ts", "src/**/*.test.ts", "test/**/*.spec.ts", "test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "lcov", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/global.ts"],
		},
	},
});
