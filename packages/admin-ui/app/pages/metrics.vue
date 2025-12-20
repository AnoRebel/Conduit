<script setup lang="ts">
import { Line } from "vue-chartjs";
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	Filler,
} from "chart.js";
import { RefreshCw } from "lucide-vue-next";

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	Title,
	Tooltip,
	Legend,
	Filler,
);

const store = useAdminStore();
const selectedDuration = ref("1h");

const durations = [
	{ label: "30m", value: "30m" },
	{ label: "1h", value: "1h" },
	{ label: "6h", value: "6h" },
	{ label: "24h", value: "24h" },
];

onMounted(async () => {
	await store.fetchMetricsHistory(selectedDuration.value);
});

watch(selectedDuration, async (duration) => {
	await store.fetchMetricsHistory(duration);
});

const throughputData = computed(() => {
	const labels = store.metricsHistory.map((m) =>
		new Date(m.timestamp).toLocaleTimeString(),
	);
	const data = store.metricsHistory.map((m) => m.messages.throughputPerSecond);

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
	const labels = store.metricsHistory.map((m) =>
		new Date(m.timestamp).toLocaleTimeString(),
	);
	const data = store.metricsHistory.map((m) => m.clients.connected);

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
	const labels = store.metricsHistory.map((m) =>
		new Date(m.timestamp).toLocaleTimeString(),
	);
	const data = store.metricsHistory.map(
		(m) => m.memory.heapUsed / 1024 / 1024,
	);

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
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
					Metrics
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Server performance over time
				</p>
			</div>
			<div class="flex items-center gap-4">
				<div class="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
					<button
						v-for="d in durations"
						:key="d.value"
						:class="[
							'px-3 py-1.5 text-sm transition-colors',
							selectedDuration === d.value
								? 'bg-primary-600 text-white'
								: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
						]"
						@click="selectedDuration = d.value"
					>
						{{ d.label }}
					</button>
				</div>
				<button
					class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
					@click="store.fetchMetricsHistory(selectedDuration)"
				>
					<RefreshCw class="h-4 w-4" />
					Refresh
				</button>
			</div>
		</div>

		<!-- Charts grid -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Throughput -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Message Throughput
				</h3>
				<div class="h-64">
					<Line
						v-if="store.metricsHistory.length > 0"
						:data="throughputData"
						:options="chartOptions"
					/>
					<div
						v-else
						class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
					>
						No data available
					</div>
				</div>
			</div>

			<!-- Connections -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Connected Clients
				</h3>
				<div class="h-64">
					<Line
						v-if="store.metricsHistory.length > 0"
						:data="connectionsData"
						:options="chartOptions"
					/>
					<div
						v-else
						class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
					>
						No data available
					</div>
				</div>
			</div>

			<!-- Memory -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Memory Usage
				</h3>
				<div class="h-64">
					<Line
						v-if="store.metricsHistory.length > 0"
						:data="memoryData"
						:options="chartOptions"
					/>
					<div
						v-else
						class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
					>
						No data available
					</div>
				</div>
			</div>

			<!-- Current Stats -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Current Statistics
				</h3>
				<div class="space-y-4">
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Connected Clients</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.clients.connected ?? 0 }}
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Peak Clients</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.clients.peak ?? 0 }}
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Messages Relayed</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.messages.relayed?.toLocaleString() ?? 0 }}
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Throughput</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.messages.throughputPerSecond ?? 0 }} msg/s
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Rate Limit Rejections</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.rateLimit.rejections ?? 0 }}
						</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-gray-600 dark:text-gray-400">Total Errors</span>
						<span class="text-xl font-semibold text-gray-900 dark:text-white">
							{{ store.metrics?.errors.total ?? 0 }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
