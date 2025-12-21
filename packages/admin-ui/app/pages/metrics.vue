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
}
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div class="flex items-center justify-between mb-6" data-tour-guide="metrics-header">
			<div>
				<h1 class="text-2xl font-bold text-foreground">Metrics</h1>
				<p class="text-muted-foreground">Server performance over time</p>
			</div>
			<div class="flex items-center gap-4">
				<ToggleGroup v-model="selectedDuration" type="single" variant="outline">
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
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Throughput -->
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<Card data-tour-guide="throughput-chart" class="cursor-context-menu">
						<CardHeader>
							<CardTitle>Message Throughput</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="h-64">
								<template v-if="isLoading">
									<Skeleton class="h-full w-full" />
								</template>
								<template v-else-if="store.metricsHistory.length > 0">
									<Line :data="throughputData" :options="chartOptions" />
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
					<ContextMenuItem @click="copyChartData('throughput')">
						<Copy class="h-4 w-4" />
						Copy Data as JSON
					</ContextMenuItem>
					<ContextMenuItem @click="exportChartAsCSV('throughput')">
						<Download class="h-4 w-4" />
						Export as CSV
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<!-- Connections -->
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<Card data-tour-guide="connections-chart" class="cursor-context-menu">
						<CardHeader>
							<CardTitle>Connected Clients</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="h-64">
								<template v-if="isLoading">
									<Skeleton class="h-full w-full" />
								</template>
								<template v-else-if="store.metricsHistory.length > 0">
									<Line :data="connectionsData" :options="chartOptions" />
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
					<ContextMenuItem @click="copyChartData('connections')">
						<Copy class="h-4 w-4" />
						Copy Data as JSON
					</ContextMenuItem>
					<ContextMenuItem @click="exportChartAsCSV('connections')">
						<Download class="h-4 w-4" />
						Export as CSV
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<!-- Memory -->
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<Card class="cursor-context-menu">
						<CardHeader>
							<CardTitle>Memory Usage</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="h-64">
								<template v-if="isLoading">
									<Skeleton class="h-full w-full" />
								</template>
								<template v-else-if="store.metricsHistory.length > 0">
									<Line :data="memoryData" :options="chartOptions" />
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
					<ContextMenuItem @click="copyChartData('memory')">
						<Copy class="h-4 w-4" />
						Copy Data as JSON
					</ContextMenuItem>
					<ContextMenuItem @click="exportChartAsCSV('memory')">
						<Download class="h-4 w-4" />
						Export as CSV
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<!-- Current Stats -->
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<Card data-tour-guide="error-stats" class="cursor-context-menu">
						<CardHeader>
							<CardTitle>Current Statistics</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Connected Clients</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.clients.connected ?? 0 }}
								</span>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Peak Clients</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.clients.peak ?? 0 }}
								</span>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Messages Relayed</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.messages.relayed?.toLocaleString() ?? 0 }}
								</span>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Throughput</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.messages.throughputPerSecond ?? 0 }} msg/s
								</span>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Rate Limit Rejections</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.rateLimit.rejections ?? 0 }}
								</span>
							</div>
							<Separator />
							<div class="flex justify-between items-center">
								<span class="text-muted-foreground">Total Errors</span>
								<span class="text-xl font-semibold">
									{{ store.metrics?.errors.total ?? 0 }}
								</span>
							</div>
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
