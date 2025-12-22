import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2025-12-21",
	devtools: { enabled: true },

	future: {
		compatibilityVersion: 4,
	},

	modules: ["@pinia/nuxt", "@vueuse/nuxt", "shadcn-nuxt", "@nuxt/icon", "@nuxt/image"],

	css: ["~/assets/css/main.css"],

	vite: {
		// @ts-ignore - tailwindcss vite plugin type may conflict with nuxt's vite version in CI
		plugins: [tailwindcss()],
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
