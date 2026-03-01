import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-03-01",
	devtools: { enabled: true },

	future: {
		compatibilityVersion: 5,
	},

	modules: [
		"@pinia/nuxt",
		"@vueuse/nuxt",
		"shadcn-nuxt",
		"@nuxt/icon",
		"@nuxt/image",
		"@vueuse/motion/nuxt",
	],

	css: ["~/assets/css/main.css"],

	vite: {
		// @tailwindcss/vite is built against a different rollup version than Nuxt resolves,
		// causing a Plugin type mismatch. This cast is safe — it works at runtime.
		// Track: https://github.com/tailwindlabs/tailwindcss/issues
		plugins: tailwindcss() as never[],
	},

	runtimeConfig: {
		public: {
			adminApiUrl: process.env.NUXT_PUBLIC_ADMIN_API_URL || "/admin/v1",
			adminWsUrl: process.env.NUXT_PUBLIC_ADMIN_WS_URL || "",
		},
	},

	app: {
		head: {
			title: "Conduit Admin",
			meta: [
				{
					name: "description",
					content: "Conduit Server Administration Dashboard",
				},
			],
		},
	},
	shadcn: {
		prefix: "",
		componentDir: "@/components/ui",
	},
});
