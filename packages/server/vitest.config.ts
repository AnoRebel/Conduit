import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["src/**/*.spec.ts", "src/**/*.test.ts", "test/**/*.spec.ts", "test/**/*.test.ts"],
		// Cluster tests need a live Redis; they run via `bun run test:cluster` so
		// the default suite stays hermetic and needs no services.
		exclude: ["**/node_modules/**", "test/cluster/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "lcov", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts", "src/**/*.test.ts"],
		},
	},
});
