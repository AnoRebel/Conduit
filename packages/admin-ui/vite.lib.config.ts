import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./app"),
			"~": resolve(__dirname, "./app"),
		},
	},
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, "./lib/index.ts"),
				components: resolve(__dirname, "./lib/components.ts"),
			},
			formats: ["es"],
			fileName: (format, entryName) => `${entryName}.${format}.js`,
		},
		rollupOptions: {
			external: [
				"vue",
				"pinia",
				"chart.js",
				"vue-chartjs",
				"@vueuse/core",
				"lucide-vue-next",
				"reka-ui",
			],
			output: {
				globals: {
					vue: "Vue",
					pinia: "Pinia",
				},
			},
		},
		outDir: "dist",
		emptyOutDir: true,
	},
});
