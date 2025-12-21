import type { TourGuideStep } from "v-tour-guide";

export interface PageTourSteps {
	[key: string]: TourGuideStep[];
}

const tourSteps: PageTourSteps = {
	// Dashboard page tour
	"/": [
		{
			id: "welcome",
			title: "Welcome to Conduit Admin",
			content:
				"This is your admin dashboard for monitoring and managing Conduit servers. Let's take a quick tour!",
			target: "dashboard-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "nav-sidebar",
			title: "Navigation",
			content:
				"Use the sidebar to navigate between different sections: Dashboard, Clients, Metrics, Audit Log, and Settings.",
			target: "nav-sidebar",
			direction: "right",
			showAction: true,
		},
		{
			id: "server-status",
			title: "Server Status",
			content: "View real-time server status including uptime, version, and connection health.",
			target: "server-status-card",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "active-clients",
			title: "Active Clients",
			content: "Monitor the number of currently connected clients at a glance.",
			target: "active-clients-card",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "messages-stats",
			title: "Message Statistics",
			content: "Track the total messages relayed through your server.",
			target: "messages-card",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "quick-actions",
			title: "Quick Actions",
			content: "Perform common admin actions like disconnecting all clients or resetting metrics.",
			target: "quick-actions",
			direction: "left",
			showAction: true,
		},
		{
			id: "theme-toggle",
			title: "Theme Toggle",
			content: "Switch between light and dark themes for your preference.",
			target: "theme-toggle",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "tour-button",
			title: "Need Help?",
			content: "Click this button anytime to restart the tour for the current page.",
			target: "tour-help-button",
			direction: "bottom",
			showAction: true,
		},
	],

	// Clients page tour
	"/clients": [
		{
			id: "clients-header",
			title: "Client Management",
			content:
				"View and manage all connected clients from this page. You can search, filter, and perform actions on individual clients.",
			target: "clients-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "clients-search",
			title: "Search Clients",
			content: "Search for clients by their ID to quickly find specific connections.",
			target: "clients-search",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "clients-list",
			title: "Client List",
			content:
				"View all connected clients with their IDs, connection time, and status. Click on a client to see more details.",
			target: "clients-list",
			direction: "top",
			showAction: true,
		},
		{
			id: "client-actions",
			title: "Client Actions",
			content: "Disconnect individual clients or ban them if needed. Use with caution!",
			target: "client-actions",
			direction: "left",
			showAction: true,
		},
	],

	// Metrics page tour
	"/metrics": [
		{
			id: "metrics-header",
			title: "Server Metrics",
			content:
				"Monitor detailed server performance metrics including throughput, latency, and error rates.",
			target: "metrics-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "throughput-chart",
			title: "Throughput",
			content: "Track messages per second over time. Higher values indicate more server activity.",
			target: "throughput-chart",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "connections-chart",
			title: "Connection History",
			content: "View connection patterns over time to identify usage trends.",
			target: "connections-chart",
			direction: "top",
			showAction: true,
		},
		{
			id: "error-stats",
			title: "Error Statistics",
			content: "Monitor errors by type. Click to see detailed error information.",
			target: "error-stats",
			direction: "left",
			showAction: true,
		},
	],

	// Audit page tour
	"/audit": [
		{
			id: "audit-header",
			title: "Audit Log",
			content:
				"Track all administrative actions performed on the server. This helps maintain security and accountability.",
			target: "audit-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "audit-filters",
			title: "Filter Actions",
			content: "Filter the audit log by action type to find specific events quickly.",
			target: "audit-filters",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "audit-list",
			title: "Action History",
			content: "View detailed information about each action including who performed it and when.",
			target: "audit-list",
			direction: "top",
			showAction: true,
		},
	],

	// Settings page tour
	"/settings": [
		{
			id: "settings-header",
			title: "Settings",
			content: "Configure your admin dashboard preferences and connection settings.",
			target: "settings-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "api-settings",
			title: "API Configuration",
			content: "Configure the Admin API endpoint URL and authentication settings.",
			target: "api-settings",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "appearance-settings",
			title: "Appearance",
			content: "Customize the look and feel of your dashboard including theme preferences.",
			target: "appearance-settings",
			direction: "top",
			showAction: true,
		},
	],
};

export function useTour() {
	const route = useRoute();
	const tourManager = ref<{
		startTourGuide: () => void;
		skipTourGuide: () => void;
		resetTourGuide: () => void;
		isActive: Ref<boolean>;
		currentStepIndex: Ref<number>;
	} | null>(null);

	const hasSeenTour = useLocalStorage<Record<string, boolean>>("conduit-admin-tours-seen", {});

	const currentPath = computed(() => {
		// Normalize path - handle dynamic routes
		const path = route.path;
		if (path.startsWith("/clients/") && path !== "/clients") {
			return "/clients"; // Use clients tour for client detail pages
		}
		return path;
	});

	const currentSteps = computed<TourGuideStep[]>(() => {
		return tourSteps[currentPath.value] || [];
	});

	const hasTourForCurrentPage = computed(() => {
		return currentSteps.value.length > 0;
	});

	const hasSeenCurrentTour = computed(() => {
		return hasSeenTour.value[currentPath.value] === true;
	});

	function startTour() {
		if (tourManager.value && hasTourForCurrentPage.value) {
			tourManager.value.startTourGuide();
		}
	}

	function skipTour() {
		if (tourManager.value) {
			tourManager.value.skipTourGuide();
		}
	}

	function resetTour() {
		if (tourManager.value) {
			tourManager.value.resetTourGuide();
		}
	}

	function markTourAsSeen() {
		hasSeenTour.value[currentPath.value] = true;
	}

	function resetAllTours() {
		hasSeenTour.value = {};
	}

	function setTourManager(manager: typeof tourManager.value) {
		tourManager.value = manager;
	}

	return {
		tourManager,
		currentSteps,
		hasTourForCurrentPage,
		hasSeenCurrentTour,
		currentPath,
		startTour,
		skipTour,
		resetTour,
		markTourAsSeen,
		resetAllTours,
		setTourManager,
	};
}
