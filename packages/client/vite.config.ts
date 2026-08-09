import { resolve } from "node:path";
import { defineConfig } from "vite";

// Declarations are emitted separately by `tsc -p tsconfig.build.json`
// (see the package `build` script). vite-plugin-dts cannot be used here:
// TypeScript 7 removed the JavaScript Compiler API the plugin depends on.
export default defineConfig({
	build: {
		target: ["chrome83", "edge83", "firefox80", "safari15"],
		lib: {
			entry: {
				conduit: resolve(__dirname, "src/index.ts"),
				"peerjs-compat": resolve(__dirname, "src/peerjs-compat.ts"),
				msgpack: resolve(__dirname, "src/msgpack.ts"),
			},
			formats: ["es", "cjs"],
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
});
