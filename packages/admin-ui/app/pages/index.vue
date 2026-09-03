<script setup lang="ts">
import { Chart } from "@tanstack/charts/vue";
import {
	AlertCircle,
	Clock,
	HardDrive,
	MessageSquare,
	Network,
	RefreshCw,
	Settings,
	TrendingUp,
	Users,
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const store = useAdminStore();
const connection = useConnection();
const colorMode = useColorMode();

// Initialize on mount if already configured. `useConnection` reads storage on
// first use rather than on mount, so the settings are already hydrated here.
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
	const memory = store.metrics?.memory;
	if (!memory?.heapTotal) return 0;
	// Bun's process.memoryUsage() can report heapUsed at or above heapTotal
	// (they are equal on a fresh process), which rendered as "118.0% of heap".
	// Clamp so the card never shows an impossible percentage.
	const percent = (memory.heapUsed / memory.heapTotal) * 100;
	return Math.min(percent, 100).toFixed(1);
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

// Dashboard mini chart: throughput and connected clients on shared axes.
const miniChartSeries = computed(() => [
	{
		label: "Messages/sec",
		color: "rgb(59, 130, 246)",
		points: store.metricsHistory.map(m => ({
			at: new Date(m.timestamp),
			value: m.messages.throughputPerSecond,
		})),
	},
	{
		label: "Connected Clients",
		color: "rgb(34, 197, 94)",
		points: store.metricsHistory.map(m => ({
			at: new Date(m.timestamp),
			value: m.clients.connected,
		})),
	},
]);

const miniChartDefinition = useMultiSeriesChart(miniChartSeries);

/**
 * Recent average throughput, for the Messages Relayed card.
 *
 * The raw `throughputPerSecond` is a single instant of a spiky metric, so the
 * card read "0 msg/s" on a steadily busy server whenever the latest snapshot
 * happened to land on a quiet tick. Averaging the same series the mini chart
 * draws keeps the number honest and the two in agreement.
 */
const averageThroughput = computed(() => averageOverWindow(miniChartSeries.value[0]?.points ?? []));

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
		sub: `${averageThroughput.value} msg/s avg`,
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
		<!--
			Which branch renders depends on connection settings held in
			localStorage, which the server cannot see: SSR therefore always
			rendered the dialog, and hydration patched the dashboard into that
			markup. The dialog's centering wrapper survived the patch and
			collapsed every dashboard grid to its content width.

			Rendering this client-side only removes the divergence at its source.
			The keys additionally stop Vue reusing one branch's root <div> for the
			other, which is what let the classes leak across in the first place.
		-->
		<ClientOnly>
			<template #fallback>
				<div class="flex items-center justify-center min-h-[60vh]">
					<Skeleton class="h-64 w-full max-w-lg rounded-xl" />
				</div>
			</template>

		<!-- Connection dialog when not configured -->
		<div
			v-if="!connection.isConfigured.value"
			key="connection-dialog"
			class="flex items-center justify-center min-h-[60vh]"
		>
			<ConnectionDialog class="w-full max-w-lg" @connected="onConnected" />
		</div>

		<!-- Dashboard content -->
		<div v-else key="dashboard">
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
				<!--
					Cluster status. A single-process server reports one node and a
					reachable backend, so this reads correctly whether or not a
					distributed backend is configured.
				-->
				<Card v-if="store.cluster" class="mt-6" data-testid="cluster-status">
					<CardHeader>
						<CardTitle class="flex items-center gap-2">
							<Network class="h-4 w-4" />
							Cluster
						</CardTitle>
						<CardDescription>
							{{
								store.cluster.distributed
									? "Peer routing and membership are shared across instances"
									: "Single instance; no distributed backend configured"
							}}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div class="flex flex-wrap items-center gap-4 mb-4">
							<div>
								<p class="text-sm text-muted-foreground">Nodes</p>
								<p class="text-2xl font-bold">{{ store.cluster.nodes.length }}</p>
							</div>
							<div>
								<p class="text-sm text-muted-foreground">Backend</p>
								<Badge :variant="store.cluster.backendReachable ? 'secondary' : 'destructive'">
									{{ store.cluster.backendReachable ? "Reachable" : "Unreachable" }}
								</Badge>
							</div>
						</div>

						<Alert v-if="!store.cluster.backendReachable" variant="destructive" class="mb-4">
							<AlertCircle class="h-4 w-4" />
							<AlertTitle>Backend unreachable</AlertTitle>
							<AlertDescription>
								{{ store.cluster.backendError ?? "Peers on other instances cannot be reached." }}
							</AlertDescription>
						</Alert>

						<div v-if="store.cluster.nodes.length" class="space-y-1">
							<div
								v-for="node in store.cluster.nodes"
								:key="node.nodeId"
								class="flex items-center justify-between text-sm"
							>
								<span class="font-mono truncate">
									{{ node.nodeId }}
									<Badge v-if="node.nodeId === store.cluster.nodeId" variant="outline" class="ml-1">
										this node
									</Badge>
								</span>
								<span class="text-muted-foreground">
									{{ node.peers }} {{ node.peers === 1 ? "peer" : "peers" }}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

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
							<Chart
								:key="`dashboard-chart-${isDark}`"
								:definition="miniChartDefinition"
								aria-label="Message throughput and connected clients over time"
								class="h-full w-full"
							/>
						</div>
					</CardContent>
				</Card>
			</template>
		</div>
		</ClientOnly>
	</div>
</template>
