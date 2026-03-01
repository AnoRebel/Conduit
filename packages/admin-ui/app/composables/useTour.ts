import type { TourGuideStep } from "v-tour-guide";

export interface PageTourSteps {
	[key: string]: TourGuideStep[];
}

/**
 * Resolve a tour target selector to a DOM element.
 * Mirrors v-tour-guide's internal resolution: first tries querySelector,
 * then falls back to [data-tour-guide="<target>"].
 */
function resolveTarget(target: string): Element | null {
	return document.querySelector(target) ?? document.querySelector(`[data-tour-guide="${target}"]`);
}

/**
 * Wait for a target element to appear in the DOM, polling up to `timeoutMs`.
 * Returns true if the element was found, false on timeout.
 */
function waitForTarget(target: string, timeoutMs = 2000): Promise<boolean> {
	return new Promise(resolve => {
		if (resolveTarget(target)) {
			resolve(true);
			return;
		}

		const interval = 100;
		let elapsed = 0;
		const timer = setInterval(() => {
			elapsed += interval;
			if (resolveTarget(target)) {
				clearInterval(timer);
				resolve(true);
			} else if (elapsed >= timeoutMs) {
				clearInterval(timer);
				resolve(false);
			}
		}, interval);
	});
}

/**
 * Wrap raw step definitions with a `beforeShow` hook that waits for the
 * target element to mount before the step becomes visible.
 * This prevents the overlay from getting stuck when elements haven't rendered yet.
 */
function withTargetGuard(steps: TourGuideStep[]): TourGuideStep[] {
	return steps.map(step => ({
		...step,
		beforeShow: async () => {
			await waitForTarget(step.target);
			// Call original beforeShow if defined
			if (step.beforeShow) await step.beforeShow();
		},
	}));
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

	// Bans page tour
	"/bans": [
		{
			id: "bans-header",
			title: "Ban Management",
			content: "Manage banned clients and IP addresses from this page.",
			target: "bans-header",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "bans-filters",
			title: "Filter Bans",
			content: "Search and filter bans by type (client or IP) to find specific entries.",
			target: "bans-filters",
			direction: "bottom",
			showAction: true,
		},
		{
			id: "bans-list",
			title: "Ban List",
			content: "View all active bans. You can unban entries or add new bans from here.",
			target: "bans-list",
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
		const raw = tourSteps[currentPath.value] || [];
		// Wrap every step with a beforeShow guard that waits for the target element
		return withTargetGuard(raw);
	});

	const hasTourForCurrentPage = computed(() => {
		return (tourSteps[currentPath.value] || []).length > 0;
	});

	const hasSeenCurrentTour = computed(() => {
		return hasSeenTour.value[currentPath.value] === true;
	});

	/**
	 * Start the tour, but only with steps whose targets currently exist in the DOM.
	 * This prevents the overlay from getting stuck on missing elements.
	 * If no steps have visible targets, the tour is silently skipped.
	 */
	async function startTour() {
		if (!tourManager.value || !hasTourForCurrentPage.value) return;

		// Filter to only steps whose targets are already in the DOM (or will appear shortly)
		const rawSteps = tourSteps[currentPath.value] || [];
		const availableSteps: TourGuideStep[] = [];
		for (const step of rawSteps) {
			const found = await waitForTarget(step.target, 500);
			if (found) availableSteps.push(step);
		}

		if (availableSteps.length === 0) {
			console.warn("[Tour] No target elements found on page, skipping tour");
			return;
		}

		// Update the steps on the manager with only the available ones (wrapped with guards)
		// Then start — if a step's target disappears between now and show-time,
		// the beforeShow guard will still try to wait for it
		tourManager.value.startTourGuide();
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
