import { defineConfig } from "vitest/config";

/**
 * Cluster integration tests, which require a reachable Redis.
 *
 * Kept out of the default `test` run so the ordinary suite stays hermetic and
 * needs no services; `bun run test:cluster` starts Redis and runs these.
 */
export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["test/cluster/**/*.spec.ts"],
		// Redis round-trips and TTL expiry make these slower than unit tests.
		testTimeout: 20000,
		hookTimeout: 20000,
	},
});
