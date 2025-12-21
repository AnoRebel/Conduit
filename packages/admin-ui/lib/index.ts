/**
 * @conduit/admin-ui
 *
 * Vue 3/Nuxt 4 dashboard for monitoring and managing Conduit servers.
 *
 * This package provides:
 * - A full Nuxt application for the admin dashboard
 * - Embeddable Vue components for custom integrations
 * - Composables for interacting with the admin API
 * - Pinia stores for state management
 *
 * @example Embedding components in your Vue app
 * ```vue
 * <script setup>
 * import { AdminDashboard, createAdminPlugin } from '@conduit/admin-ui';
 *
 * const app = createApp(App);
 * app.use(createAdminPlugin({ apiUrl: '/admin', apiKey: 'your-key' }));
 * </script>
 *
 * <template>
 *   <AdminDashboard />
 * </template>
 * ```
 */

// Export types
export type {
	AuditEntry,
	BanEntry,
	ClientDetailsData,
	ClientListItem,
	MetricsData,
	MetricsDataPoint,
	ServerConfig,
	ServerStatusData,
} from "./components";
// Export all embeddable components
export * from "./components";
// Export the plugin for Vue apps
export { createAdminPlugin } from "./plugin";
