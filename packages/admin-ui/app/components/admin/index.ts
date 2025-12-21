/**
 * Embeddable Admin Components
 *
 * These components can be imported and used in other Vue applications
 * to embed Conduit admin functionality.
 *
 * @example
 * ```vue
 * <script setup>
 * import { AdminDashboard, ClientList } from '@conduit/admin-ui/components/admin';
 * </script>
 *
 * <template>
 *   <AdminDashboard
 *     :status="serverStatus"
 *     :metrics="metrics"
 *     @refresh="handleRefresh"
 *   />
 * </template>
 * ```
 */

export type { MetricsData, ServerStatusData } from "./AdminDashboard.vue";
// Main dashboard component
export { default as AdminDashboard } from "./AdminDashboard.vue";
export type { AuditEntry } from "./AuditLog.vue";
export { default as AuditLog } from "./AuditLog.vue";
export type { BanEntry } from "./BanManager.vue";
export { default as BanManager } from "./BanManager.vue";
export type { ClientInfo as ClientDetailsData } from "./ClientDetails.vue";
export { default as ClientDetails } from "./ClientDetails.vue";
// Re-export types
export type { ClientInfo as ClientListItem } from "./ClientList.vue";
export { default as ClientList } from "./ClientList.vue";
export type { MetricsDataPoint } from "./MetricsChart.vue";
export { default as MetricsChart } from "./MetricsChart.vue";
export { default as QuickActions } from "./QuickActions.vue";
// Individual components
export { default as ServerStatus } from "./ServerStatus.vue";
export type { ServerConfig } from "./SettingsPanel.vue";
export { default as SettingsPanel } from "./SettingsPanel.vue";
