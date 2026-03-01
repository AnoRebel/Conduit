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
		"@nuxt/scripts",
		"nuxt-umami",
		"@nuxtjs/seo",
	],

	css: ["~/assets/css/main.css"],

	vite: {
		// @tailwindcss/vite is built against a different rollup version than Nuxt resolves,
		// causing a Plugin type mismatch. This cast is safe — it works at runtime.
		// Track: https://github.com/tailwindlabs/tailwindcss/issues
		plugins: tailwindcss() as never[],
	},

	runtimeConfig: {
		rybbit: {
			siteId: process.env.NUXT_RYBBIT_SITE_ID || "",
		},
		umami: {
			id: process.env.NUXT_UMAMI_SITE_ID || "",
		},
		// Public keys (exposed to client)
		public: {
			siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "https://conduit-ui.anorebel.net",
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

	// Site configuration for SEO
	site: {
		url: "https://conduit-ui.anorebel.net",
		name: "Conduit Admin",
		description: "Conduit Server Administration Dashboard",
		defaultLocale: "en",
	},

	// Robots configuration
	robots: {
		allow: "/",
		sitemap: ["https://tujengeconstruction.com/sitemap.xml"],
	},

	umami: {
		id: process.env.NUXT_UMAMI_SITE_ID || "",
		host: "https://umami.anorebel.net",
		autoTrack: true,
		proxy: "cloak",
	},

	scripts: {
		registry: {
			rybbitAnalytics: {
				scriptInput: {
					src: "https://rybbit.anorebel.net/api/script.js",
				},
				siteId: process.env.NUXT_RYBBIT_SITE_ID || "",
			},
		},
	},

	shadcn: {
		prefix: "",
		componentDir: "@/components/ui",
	},
});
