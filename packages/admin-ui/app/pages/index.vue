<script setup lang="ts">
import {
	CategoryScale,
	Chart as ChartJS,
	Tooltip as ChartTooltip,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
} from "chart.js";
import {
	AlertCircle,
	Clock,
	HardDrive,
	MessageSquare,
	RefreshCw,
	Settings,
	TrendingUp,
	Users,
} from "lucide-vue-next";
import { Line } from "vue-chartjs";
import { toast } from "vue-sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	ChartTooltip,
	Legend,
	Filler
);

const store = useAdminStore();
const connection = useConnection();
const colorMode = useColorMode();

// Initialize on mount if already configured
onMounted(async () => {
	if (connection.isConfigured.value) {
		await store.initialize();
	}
});

onUnmounted(() => {
	store.cleanup();
});

function onConnected() {
	// Store initializes inside ConnectionDialog already
}

// Computed values
const uptime = computed(() => {
	if (!store.status?.uptime) return "N/A";
	const seconds = Math.floor(store.status.uptime / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
});

const memoryUsage = computed(() => {
	if (!store.metrics?.memory) return "N/A";
	const mb = store.metrics.memory.heapUsed / 1024 / 1024;
	return `${mb.toFixed(1)} MB`;
});

const memoryPercent = computed(() => {
	if (!store.metrics?.memory) return 0;
	return ((store.metrics.memory.heapUsed / store.metrics.memory.heapTotal) * 100).toFixed(1);
});

async function refreshClients() {
	await store.fetchClients();
	toast.success("Clients refreshed");
}

async function refreshMetrics() {
	await store.fetchMetrics();
	toast.success("Metrics refreshed");
}

// --- Theme-reactive mini chart ---
const isDark = computed(() => colorMode.value === "dark");

const miniChartData = computed(() => {
	const labels = store.metricsHistory.map(m => new Date(m.timestamp).toLocaleTimeString());
	const throughput = store.metricsHistory.map(m => m.messages.throughputPerSecond);
	const clients = store.metricsHistory.map(m => m.clients.connected);

	return {
		labels,
		datasets: [
			{
				label: "Messages/sec",
				data: throughput,
				borderColor: "rgb(59, 130, 246)",
				backgroundColor: "rgba(59, 130, 246, 0.08)",
				fill: true,
				tension: 0.4,
				pointRadius: 0,
				pointHitRadius: 10,
				pointHoverRadius: 3,
				borderWidth: 2,
				yAxisID: "y",
			},
			{
				label: "Connected Clients",
				data: clients,
				borderColor: "rgb(34, 197, 94)",
				backgroundColor: "rgba(34, 197, 94, 0.08)",
				fill: true,
				tension: 0.4,
				pointRadius: 0,
				pointHitRadius: 10,
				pointHoverRadius: 3,
				borderWidth: 2,
				yAxisID: "y1",
			},
		],
	};
});

const miniChartOptions = computed(() => {
	const gridColor = isDark.value ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)";
	const tickColor = isDark.value ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";
	const tooltipBg = isDark.value ? "rgba(30, 30, 30, 0.95)" : "rgba(255, 255, 255, 0.95)";
	const tooltipText = isDark.value ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.8)";

	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: "index" as const, intersect: false },
		plugins: {
			legend: {
				display: true,
				position: "top" as const,
				labels: {
					color: tickColor,
					usePointStyle: true,
					pointStyle: "circle",
					padding: 16,
					font: { size: 11 },
				},
			},
			tooltip: {
				backgroundColor: tooltipBg,
				titleColor: tooltipText,
				bodyColor: tooltipText,
				borderColor: isDark.value ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
				borderWidth: 1,
				cornerRadius: 8,
				padding: 10,
				boxPadding: 4,
			},
		},
		scales: {
			x: {
				grid: { color: gridColor, drawBorder: false },
				ticks: { color: tickColor, maxRotation: 0, autoSkipPadding: 30, font: { size: 10 } },
				border: { display: false },
			},
			y: {
				type: "linear" as const,
				display: true,
				position: "left" as const,
				beginAtZero: true,
				grid: { color: gridColor, drawBorder: false },
				ticks: { color: tickColor, font: { size: 10 }, padding: 6 },
				border: { display: false },
				title: {
					display: false,
				},
			},
			y1: {
				type: "linear" as const,
				display: true,
				position: "right" as const,
				beginAtZero: true,
				grid: { drawOnChartArea: false },
				ticks: { color: tickColor, font: { size: 10 }, padding: 6 },
				border: { display: false },
			},
		},
	};
});

// Fetch history for dashboard mini chart
onMounted(async () => {
	if (connection.isConfigured.value && store.metricsHistory.length === 0) {
		await store.fetchMetricsHistory("1h");
	}
});

// Stats cards config for staggered animation
const statsCards = computed(() => [
	{
		key: "clients",
		label: "Connected Clients",
		tourGuide: "active-clients-card",
		icon: Users,
		iconBg: "bg-blue-100 dark:bg-blue-900/30",
		iconColor: "text-blue-600 dark:text-blue-400",
		value: store.metrics?.clients.connected ?? 0,
		sub: `Peak: ${store.metrics?.clients.peak ?? 0}`,
	},
	{
		key: "messages",
		label: "Messages Relayed",
		tourGuide: "messages-card",
		icon: MessageSquare,
		iconBg: "bg-green-100 dark:bg-green-900/30",
		iconColor: "text-green-600 dark:text-green-400",
		value: store.metrics?.messages.relayed?.toLocaleString() ?? 0,
		sub: `${store.metrics?.messages.throughputPerSecond ?? 0} msg/s`,
	},
	{
		key: "uptime",
		label: "Uptime",
		tourGuide: undefined,
		icon: Clock,
		iconBg: "bg-purple-100 dark:bg-purple-900/30",
		iconColor: "text-purple-600 dark:text-purple-400",
		value: uptime.value,
		sub: `v${store.status?.version ?? "N/A"}`,
	},
	{
		key: "memory",
		label: "Memory",
		tourGuide: undefined,
		icon: HardDrive,
		iconBg: "bg-orange-100 dark:bg-orange-900/30",
		iconColor: "text-orange-600 dark:text-orange-400",
		value: memoryUsage.value,
		sub: `${memoryPercent.value}% of heap`,
	},
]);
</script>

<template>
	<div>
		<!-- Connection dialog when not configured -->
		<ConnectionDialog
			v-if="!connection.isConfigured.value"
			@connected="onConnected"
		/>

		<!-- Dashboard content -->
		<div v-else>
			<div
				v-motion
				:initial="{ opacity: 0, y: -10 }"
				:enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
				class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
				data-tour-guide="dashboard-header"
			>
				<div>
					<h1 class="text-2xl font-bold text-foreground">
						Dashboard
					</h1>
					<p class="text-muted-foreground">
						Monitor your Conduit server in real-time
					</p>
				</div>
				<Button variant="outline" size="sm" @click="store.fetchMetrics">
					<RefreshCw class="h-4 w-4" />
					Refresh
				</Button>
			</div>

			<template v-if="store.isLoading">
				<!-- Loading state with skeletons -->
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
					<Card v-for="i in 4" :key="i" class="min-w-0">
						<CardHeader class="pb-2">
							<Skeleton class="h-4 w-24" />
						</CardHeader>
						<CardContent>
							<Skeleton class="h-8 w-20 mb-2" />
							<Skeleton class="h-3 w-16" />
						</CardContent>
					</Card>
				</div>
			</template>

			<template v-else-if="store.error">
				<!-- Error state -->
				<Alert variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{{ store.error }}</AlertDescription>
				</Alert>
			</template>

			<!-- Stats grid -->
			<template v-else>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
					<Card
						v-for="(card, index) in statsCards"
						:key="card.key"
						v-motion
						:initial="{ opacity: 0, y: 20 }"
						:visible-once="{ opacity: 1, y: 0, transition: { duration: 350, delay: index * 75 } }"
						class="min-w-0 overflow-hidden"
						:data-tour-guide="card.tourGuide"
					>
						<CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
							<CardDescription class="truncate">{{ card.label }}</CardDescription>
							<div class="p-2 rounded-lg shrink-0" :class="card.iconBg">
								<component :is="card.icon" class="h-4 w-4" :class="card.iconColor" />
							</div>
						</CardHeader>
						<CardContent>
							<div class="text-2xl sm:text-3xl font-bold truncate">
								{{ card.value }}
							</div>
							<p class="text-xs text-muted-foreground mt-1 truncate">
								{{ card.sub }}
							</p>
						</CardContent>
					</Card>
				</div>

				<!-- Quick Actions & Server Status -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6">
					<!-- Quick Actions -->
					<Card
						v-motion
						:initial="{ opacity: 0, x: -20 }"
						:visible-once="{ opacity: 1, x: 0, transition: { duration: 400, delay: 300 } }"
						data-tour-guide="quick-actions"
					>
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
						</CardHeader>
						<CardContent class="space-y-2">
						<Button variant="ghost" class="w-full justify-start" @click="refreshClients">
							<RefreshCw class="h-4 w-4" />
							Refresh Clients
						</Button>
						<Button variant="ghost" class="w-full justify-start" @click="refreshMetrics">
							<TrendingUp class="h-4 w-4" />
							Refresh Metrics
						</Button>
							<Button variant="ghost" class="w-full justify-start" as-child>
								<NuxtLink to="/clients">
									<Users class="h-4 w-4" />
									View All Clients
								</NuxtLink>
							</Button>
							<Button variant="ghost" class="w-full justify-start" as-child>
								<NuxtLink to="/settings">
									<Settings class="h-4 w-4" />
									Server Settings
								</NuxtLink>
							</Button>
						</CardContent>
					</Card>

					<!-- Server Status -->
					<Card
						v-motion
						:initial="{ opacity: 0, x: 20 }"
						:visible-once="{ opacity: 1, x: 0, transition: { duration: 400, delay: 300 } }"
						data-tour-guide="server-status-card"
					>
						<CardHeader>
							<CardTitle>Server Status</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Status</span>
								<Badge :variant="store.status?.running ? 'default' : 'destructive'">
									{{ store.status?.running ? "Running" : "Stopped" }}
								</Badge>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Rate Limit Hits</span>
								<span class="font-medium">
									{{ store.metrics?.rateLimit.hits ?? 0 }}
								</span>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Errors</span>
								<span class="font-medium">
									{{ store.metrics?.errors.total ?? 0 }}
								</span>
							</div>
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Queued Messages</span>
								<span class="font-medium">
									{{ store.metrics?.messages.queued ?? 0 }}
								</span>
							</div>
						</CardContent>
					</Card>
				</div>

				<!-- Mini Chart — Activity Overview -->
				<Card
					v-if="store.metricsHistory.length > 0"
					v-motion
					:initial="{ opacity: 0, y: 20 }"
					:visible-once="{ opacity: 1, y: 0, transition: { duration: 400, delay: 400 } }"
					class="mt-6"
					data-tour-guide="activity-chart"
				>
					<CardHeader class="flex flex-row items-center justify-between pb-2">
						<div>
							<CardTitle>Activity Overview</CardTitle>
							<CardDescription>Throughput and connections over the last hour</CardDescription>
						</div>
						<Button variant="outline" size="sm" as-child>
							<NuxtLink to="/metrics">
								<TrendingUp class="h-4 w-4" />
								Full Metrics
							</NuxtLink>
						</Button>
					</CardHeader>
					<CardContent>
						<div class="h-48 sm:h-56">
							<Line
								:key="`dashboard-chart-${isDark}`"
								:data="miniChartData"
								:options="miniChartOptions"
							/>
						</div>
					</CardContent>
				</Card>
			</template>
		</div>
	</div>
</template>
