<script setup lang="ts">
import { Chart } from "@tanstack/charts/vue";
import { Copy, Download, RefreshCw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const store = useAdminStore();
const colorMode = useColorMode();
const breadcrumbItems = [{ label: "Metrics" }];
const selectedDuration = ref("1h");
const isLoading = ref(false);

const durations = [
	{ label: "30m", value: "30m" },
	{ label: "1h", value: "1h" },
	{ label: "6h", value: "6h" },
	{ label: "24h", value: "24h" },
];

onMounted(async () => {
	isLoading.value = true;
	// Both are needed: the charts read history, while "Current Statistics" reads
	// the live snapshot in store.metrics. Fetching only history left every
	// current-value stat showing its 0 fallback.
	await Promise.all([store.fetchMetrics(), store.fetchMetricsHistory(selectedDuration.value)]);
	isLoading.value = false;
});

watch(selectedDuration, async duration => {
	isLoading.value = true;
	await store.fetchMetricsHistory(duration);
	isLoading.value = false;
});

// --- Theme-reactive chart colors ---
const isDark = computed(() => colorMode.value === "dark");

/**
 * Room, topic, and multicast totals.
 *
 * Absent on a server without group support, in which case the section is
 * hidden rather than showing zeroes that would read as real measurements.
 */
const groupStats = computed(() => {
	const groups = store.metrics?.groups;
	if (!groups) return null;
	return [
		{ key: "rooms", label: "Active Rooms", value: groups.activeRooms },
		{ key: "topics", label: "Active Topics", value: groups.activeTopics },
		{ key: "subs", label: "Subscriptions", value: groups.subscriptions },
		{
			key: "fanout",
			label: "Multicast Deliveries",
			value: groups.multicastDeliveries,
		},
	];
});

const gridColor = computed(() =>
	isDark.value ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
);
const tickColor = computed(() =>
	isDark.value ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
);
const tooltipBg = computed(() =>
	isDark.value ? "rgba(30, 30, 30, 0.95)" : "rgba(255, 255, 255, 0.95)"
);
const tooltipText = computed(() =>
	isDark.value ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.8)"
);
const tooltipBorder = computed(() =>
	isDark.value ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
);

// --- Chart definitions ---
// Marks consume the metrics history directly, so there is no parallel labels
// array to drift out of step with the values.

const throughputSeries = computed(() =>
	store.metricsHistory.map(m => ({
		at: new Date(m.timestamp),
		value: m.messages.throughputPerSecond,
	}))
);

const connectionsSeries = computed(() =>
	store.metricsHistory.map(m => ({ at: new Date(m.timestamp), value: m.clients.connected }))
);

const memorySeries = computed(() =>
	store.metricsHistory.map(m => ({
		at: new Date(m.timestamp),
		value: m.memory.heapUsed / 1024 / 1024,
	}))
);

const multicastSeries = computed(() =>
	store.metricsHistory.map(m => ({
		at: new Date(m.timestamp),
		value: m.groups?.multicastDeliveries ?? 0,
	}))
);

const roomsSeries = computed(() =>
	store.metricsHistory.map(m => ({ at: new Date(m.timestamp), value: m.groups?.activeRooms ?? 0 }))
);

const throughputChart = useTimeSeriesChart(throughputSeries, {
	color: "rgb(59, 130, 246)",
	label: "Messages/sec",
});
const connectionsChart = useTimeSeriesChart(connectionsSeries, {
	color: "rgb(34, 197, 94)",
	label: "Connected clients",
});
const memoryChart = useTimeSeriesChart(memorySeries, {
	color: "rgb(249, 115, 22)",
	label: "Heap used (MB)",
});
const multicastChart = useTimeSeriesChart(multicastSeries, {
	color: "rgb(168, 85, 247)",
	label: "Multicast deliveries",
});
const roomsChart = useTimeSeriesChart(roomsSeries, {
	color: "rgb(14, 165, 233)",
	label: "Active rooms",
});

/** The chart definition for a card, by key. */
function getChartDefinition(key: string) {
	switch (key) {
		case "throughput":
			return throughputChart.value;
		case "connections":
			return connectionsChart.value;
		case "memory":
			return memoryChart.value;
		case "multicast":
			return multicastChart.value;
		case "rooms":
			return roomsChart.value;
		default:
			return throughputChart.value;
	}
}

async function refresh() {
	isLoading.value = true;
	await store.fetchMetricsHistory(selectedDuration.value);
	isLoading.value = false;
	toast.success("Metrics refreshed");
}

const { copy } = useClipboard();

/** The series behind a chart card, for copy and export. */
function getSeriesForCard(key: string): readonly TimeSeriesPoint[] {
	switch (key) {
		case "throughput":
			return throughputSeries.value;
		case "connections":
			return connectionsSeries.value;
		case "memory":
			return memorySeries.value;
		case "multicast":
			return multicastSeries.value;
		case "rooms":
			return roomsSeries.value;
		default:
			return [];
	}
}

/** The column heading for a chart card's value. */
function getSeriesLabel(key: string): string {
	const card = chartCards.value.find(c => c.key === key);
	return card?.title ?? key;
}

function copyChartData(chartType: string) {
	const series = getSeriesForCard(chartType);
	copy(
		JSON.stringify(
			series.map(p => ({ time: formatMetricDateTime(p.at), value: p.value })),
			null,
			2
		)
	);
	toast.success("Chart data copied");
}

function exportChartAsCSV(chartType: string) {
	const series = getSeriesForCard(chartType);
	if (series.length === 0) {
		toast.error("No data to export");
		return;
	}

	const rows = series.map(p => `${formatMetricDateTime(p.at)},${p.value}`);
	const csv = [`Time,${getSeriesLabel(chartType)}`, ...rows].join("\n");

	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${chartType}-metrics.csv`;
	a.click();
	URL.revokeObjectURL(url);
	toast.success("CSV exported");
}

function copyCurrentStats() {
	const stats = {
		connectedClients: store.metrics?.clients.connected ?? 0,
		peakClients: store.metrics?.clients.peak ?? 0,
		messagesRelayed: store.metrics?.messages.relayed ?? 0,
		throughput: store.metrics?.messages.throughputPerSecond ?? 0,
		rateLimitRejections: store.metrics?.rateLimit.rejections ?? 0,
		totalErrors: store.metrics?.errors.total ?? 0,
	};
	copy(JSON.stringify(stats, null, 2));
	toast.success("Stats copied");
}

// Chart card configs for staggered animation
const baseChartCards = [
	{ key: "throughput", title: "Message Throughput", tourGuide: "throughput-chart" },
	{ key: "connections", title: "Connected Clients", tourGuide: "connections-chart" },
	{ key: "memory", title: "Memory Usage", tourGuide: undefined },
] as const;

/**
 * Group charts appear only when the server reports group metrics, so a server
 * without rooms shows no empty panels.
 */
const chartCards = computed(() => {
	const cards: { key: string; title: string; tourGuide?: string }[] = [...baseChartCards];
	if (store.metrics?.groups) {
		cards.push(
			{ key: "rooms", title: "Active Rooms", tourGuide: undefined },
			{ key: "multicast", title: "Multicast Deliveries", tourGuide: undefined }
		);
	}
	return cards;
});

// Stats items for stagger
const statsItems = computed(() => [
	{ label: "Connected Clients", value: store.metrics?.clients.connected ?? 0 },
	{ label: "Peak Clients", value: store.metrics?.clients.peak ?? 0 },
	{ label: "Messages Relayed", value: store.metrics?.messages.relayed?.toLocaleString() ?? 0 },
	// Averaged for the same reason as the dashboard card: a single sample of a
	// spiky per-second rate reads 0 on a busy server whenever it lands on a
	// quiet tick. The chart beside this still shows every individual sample.
	{ label: "Throughput", value: `${averageOverWindow(throughputSeries.value)} msg/s avg` },
	{ label: "Rate Limit Rejections", value: store.metrics?.rateLimit.rejections ?? 0 },
	{ label: "Total Errors", value: store.metrics?.errors.total ?? 0 },
]);
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div
			v-motion
			:initial="{ opacity: 0, y: -10 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
			class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
			data-tour-guide="metrics-header"
		>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Metrics</h1>
				<p class="text-muted-foreground">Server performance over time</p>
			</div>
			<div class="flex items-center gap-4">
				<ToggleGroup
					v-model="selectedDuration"
					v-motion
					:initial="{ opacity: 0 }"
					:enter="{ opacity: 1, transition: { duration: 300, delay: 100 } }"
					type="single"
					variant="outline"
				>
					<ToggleGroupItem v-for="d in durations" :key="d.value" :value="d.value">
						{{ d.label }}
					</ToggleGroupItem>
				</ToggleGroup>
				<Button @click="refresh">
					<RefreshCw class="h-4 w-4" />
					Refresh
				</Button>
			</div>
		</div>

		<!-- Room, topic, and multicast totals -->
		<div
			v-if="groupStats"
			class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
			data-testid="group-metrics"
		>
			<Card v-for="stat in groupStats" :key="stat.key" class="p-4">
				<p class="text-sm text-muted-foreground">{{ stat.label }}</p>
				<p class="text-2xl font-bold text-foreground">{{ stat.value.toLocaleString() }}</p>
			</Card>
		</div>

		<!-- Charts grid -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
			<!-- Chart cards with staggered animation -->
			<ContextMenu v-for="(card, index) in chartCards" :key="card.key">
				<ContextMenuTrigger as-child>
					<Card
						v-motion
						:initial="{ opacity: 0, scale: 0.95 }"
						:visible-once="{ opacity: 1, scale: 1, transition: { duration: 350, delay: index * 100 } }"
						:data-tour-guide="card.tourGuide"
						class="cursor-context-menu"
					>
						<CardHeader>
							<CardTitle>{{ card.title }}</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="h-48 sm:h-64">
								<template v-if="isLoading">
									<Skeleton class="h-full w-full rounded-lg" />
								</template>
								<template v-else-if="store.metricsHistory.length > 0">
									<Chart
										:key="`${card.key}-${isDark}`"
										:definition="getChartDefinition(card.key)"
										:aria-label="`${card.title} over time`"
										class="h-full w-full"
									/>
								</template>
								<div
									v-else
									class="flex items-center justify-center h-full text-muted-foreground"
								>
									No data available
								</div>
							</div>
						</CardContent>
					</Card>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem @click="copyChartData(card.key)">
						<Copy class="h-4 w-4" />
						Copy Data as JSON
					</ContextMenuItem>
					<ContextMenuItem @click="exportChartAsCSV(card.key)">
						<Download class="h-4 w-4" />
						Export as CSV
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<!-- Current Stats -->
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<Card
						v-motion
						:initial="{ opacity: 0, scale: 0.95 }"
						:visible-once="{ opacity: 1, scale: 1, transition: { duration: 350, delay: 300 } }"
						data-tour-guide="error-stats"
						class="cursor-context-menu"
					>
						<CardHeader>
							<CardTitle>Current Statistics</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<template v-for="(item, index) in statsItems" :key="item.label">
								<div
									v-motion
									:initial="{ opacity: 0, x: -8 }"
									:visible-once="{ opacity: 1, x: 0, transition: { duration: 250, delay: 350 + index * 50 } }"
									class="flex justify-between items-center"
								>
									<span class="text-muted-foreground">{{ item.label }}</span>
									<span class="text-xl font-semibold">
										{{ item.value }}
									</span>
								</div>
								<Separator v-if="index < statsItems.length - 1" />
							</template>
						</CardContent>
					</Card>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem @click="copyCurrentStats">
						<Copy class="h-4 w-4" />
						Copy Stats as JSON
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</div>
	</div>
</template>
