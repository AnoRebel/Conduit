<script setup lang="ts">
import {
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
} from "chart.js";
import { Copy, Download, RefreshCw } from "lucide-vue-next";
import { Line } from "vue-chartjs";
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

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	Filler
);

const store = useAdminStore();
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
	await store.fetchMetricsHistory(selectedDuration.value);
	isLoading.value = false;
});

watch(selectedDuration, async duration => {
	isLoading.value = true;
	await store.fetchMetricsHistory(duration);
	isLoading.value = false;
});

const throughputData = computed(() => {
	const labels = store.metricsHistory.map(m => new Date(m.timestamp).toLocaleTimeString());
	const data = store.metricsHistory.map(m => m.messages.throughputPerSecond);

	return {
		labels,
		datasets: [
			{
				label: "Messages/sec",
				data,
				borderColor: "rgb(59, 130, 246)",
				backgroundColor: "rgba(59, 130, 246, 0.1)",
				fill: true,
				tension: 0.4,
			},
		],
	};
});

const connectionsData = computed(() => {
	const labels = store.metricsHistory.map(m => new Date(m.timestamp).toLocaleTimeString());
	const data = store.metricsHistory.map(m => m.clients.connected);

	return {
		labels,
		datasets: [
			{
				label: "Connected Clients",
				data,
				borderColor: "rgb(34, 197, 94)",
				backgroundColor: "rgba(34, 197, 94, 0.1)",
				fill: true,
				tension: 0.4,
			},
		],
	};
});

const memoryData = computed(() => {
	const labels = store.metricsHistory.map(m => new Date(m.timestamp).toLocaleTimeString());
	const data = store.metricsHistory.map(m => m.memory.heapUsed / 1024 / 1024);

	return {
		labels,
		datasets: [
			{
				label: "Heap Used (MB)",
				data,
				borderColor: "rgb(249, 115, 22)",
				backgroundColor: "rgba(249, 115, 22, 0.1)",
				fill: true,
				tension: 0.4,
			},
		],
	};
});

const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: {
		legend: {
			display: false,
		},
	},
	scales: {
		x: {
			grid: {
				display: false,
			},
		},
		y: {
			beginAtZero: true,
		},
	},
};

async function refresh() {
	isLoading.value = true;
	await store.fetchMetricsHistory(selectedDuration.value);
	isLoading.value = false;
	toast.success("Metrics refreshed");
}

const { copy } = useClipboard();

function getChartDataByType(chartType: "throughput" | "connections" | "memory") {
	switch (chartType) {
		case "throughput":
			return throughputData.value;
		case "connections":
			return connectionsData.value;
		case "memory":
			return memoryData.value;
	}
}

function copyChartData(chartType: "throughput" | "connections" | "memory") {
	const chartData = getChartDataByType(chartType);
	const dataset = chartData.datasets[0];
	if (!dataset) return;

	const data = {
		labels: chartData.labels,
		values: dataset.data as number[],
	};

	copy(JSON.stringify(data, null, 2));
	toast.success("Chart data copied");
}

function exportChartAsCSV(chartType: "throughput" | "connections" | "memory") {
	const chartData = getChartDataByType(chartType);
	const dataset = chartData.datasets[0];
	if (!dataset) return;

	const labels = chartData.labels;
	const values = dataset.data as number[];

	const headers: Record<string, string> = {
		throughput: "Time,Messages/sec",
		connections: "Time,Connected Clients",
		memory: "Time,Heap Used (MB)",
	};

	const csv = [headers[chartType], ...labels.map((label, i) => `${label},${values[i]}`)].join("\n");

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
const chartCards = [
	{ key: "throughput", title: "Message Throughput", tourGuide: "throughput-chart" },
	{ key: "connections", title: "Connected Clients", tourGuide: "connections-chart" },
	{ key: "memory", title: "Memory Usage", tourGuide: undefined },
] as const;

// Stats items for stagger
const statsItems = computed(() => [
	{ label: "Connected Clients", value: store.metrics?.clients.connected ?? 0 },
	{ label: "Peak Clients", value: store.metrics?.clients.peak ?? 0 },
	{ label: "Messages Relayed", value: store.metrics?.messages.relayed?.toLocaleString() ?? 0 },
	{ label: "Throughput", value: `${store.metrics?.messages.throughputPerSecond ?? 0} msg/s` },
	{ label: "Rate Limit Rejections", value: store.metrics?.rateLimit.rejections ?? 0 },
	{ label: "Total Errors", value: store.metrics?.errors.total ?? 0 },
]);

function getChartDataForCard(key: string) {
	switch (key) {
		case "throughput":
			return throughputData.value;
		case "connections":
			return connectionsData.value;
		case "memory":
			return memoryData.value;
		default:
			return throughputData.value;
	}
}
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
							<div class="h-64">
								<template v-if="isLoading">
									<Skeleton class="h-full w-full" />
								</template>
								<template v-else-if="store.metricsHistory.length > 0">
									<Line :data="getChartDataForCard(card.key)" :options="chartOptions" />
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
