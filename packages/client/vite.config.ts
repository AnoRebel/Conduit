import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		dts({
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.spec.ts", "src/**/*.test.ts"],
			rollupTypes: true,
			outDir: "dist",
			entryRoot: "src",
		}),
	],
	build: {
		target: ["chrome83", "edge83", "firefox80", "safari15"],
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "Conduit",
			formats: ["es", "cjs", "umd"],
			fileName: format => {
				if (format === "es") return "conduit.js";
				if (format === "cjs") return "conduit.cjs";
				return "conduit.umd.js";
			},
		},
		sourcemap: true,
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: false,
				drop_debugger: true,
			},
			mangle: {
				safari10: true,
			},
		},
		rollupOptions: {
			external: id => {
				// Externalize dependencies for ESM/CJS only
				return (
					id === "eventemitter3" ||
					id === "webrtc-adapter" ||
					id === "@msgpack/msgpack" ||
					id === "peerjs-js-binarypack" ||
					id === "web-streams-polyfill" ||
					id.startsWith("@conduit/")
				);
			},
			output: {
				globals: {
					eventemitter3: "EventEmitter3",
					"webrtc-adapter": "adapter",
					"@msgpack/msgpack": "msgpack",
					"peerjs-js-binarypack": "BinaryPack",
					"@conduit/shared": "ConduitShared",
				},
			},
		},
	},
	define: {
		__VERSION__: JSON.stringify(process.env.npm_package_version || "1.0.0"),
	},
});
