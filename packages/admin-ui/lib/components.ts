/**
 * Embeddable Admin Components
 *
 * Import individual components for use in your Vue application.
 * These components are designed to work standalone outside of Nuxt.
 */

// Re-export types
export type {
	AuditEntry,
	BanEntry,
	ClientDetailsData,
	ClientListItem,
	MetricsData,
	MetricsDataPoint,
	ServerConfig,
	ServerStatusData,
} from "../app/components/admin";
// Re-export all components from the app/components/admin directory
export {
	AdminDashboard,
	AuditLog,
	BanManager,
	ClientDetails,
	ClientList,
	MetricsChart,
	QuickActions,
	ServerStatus,
	SettingsPanel,
} from "../app/components/admin";
