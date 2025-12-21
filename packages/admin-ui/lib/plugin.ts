import type { App, InjectionKey } from "vue";

/**
 * Configuration options for the admin plugin
 */
export interface AdminPluginOptions {
	/** Base URL for the admin API */
	apiUrl: string;
	/** API key for authentication */
	apiKey?: string;
	/** WebSocket URL for real-time updates (optional, defaults to apiUrl with ws:// protocol) */
	wsUrl?: string;
}

/**
 * Injection key for the admin configuration
 */
export const ADMIN_CONFIG_KEY: InjectionKey<AdminPluginOptions> = Symbol("admin-config");

/**
 * Create a Vue plugin to configure the admin components
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createAdminPlugin } from '@conduit/admin-ui';
 *
 * const app = createApp(App);
 * app.use(createAdminPlugin({
 *   apiUrl: 'http://localhost:3000/admin',
 *   apiKey: 'your-api-key'
 * }));
 * ```
 */
export function createAdminPlugin(options: AdminPluginOptions) {
	return {
		install(app: App) {
			// Provide the configuration to all components
			app.provide(ADMIN_CONFIG_KEY, options);

			// Make config available globally
			app.config.globalProperties.$adminConfig = options;
		},
	};
}
