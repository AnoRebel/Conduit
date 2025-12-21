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
import { Copy, Download } from "lucide-vue-next";
import { Line } from "vue-chartjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";

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

export interface MetricsDataPoint {
	timestamp: number;
	value: number;
}

const props = defineProps<{
	title: string;
	data: MetricsDataPoint[];
	loading?: boolean;
	color?: string;
	unit?: string;
	valueFormatter?: (value: number) => string;
}>();

const chartColor = computed(() => props.color ?? "rgb(59, 130, 246)");
const chartBackgroundColor = computed(() => {
	const color = chartColor.value;
	// Convert rgb to rgba with 0.1 opacity
	return color.replace("rgb(", "rgba(").replace(")", ", 0.1)");
});

const chartData = computed(() => {
	const labels = props.data.map(d => new Date(d.timestamp).toLocaleTimeString());
	const values = props.data.map(d =>
		props.valueFormatter ? Number(props.valueFormatter(d.value)) : d.value
	);

	return {
		labels,
		datasets: [
			{
				label: props.title,
				data: values,
				borderColor: chartColor.value,
				backgroundColor: chartBackgroundColor.value,
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

const { copy } = useClipboard();

function copyChartData() {
	const data = {
		labels: chartData.value.labels,
		values: props.data.map(d => d.value),
	};
	copy(JSON.stringify(data, null, 2));
}

function exportAsCSV() {
	const labels = chartData.value.labels;
	const values = props.data.map(d => d.value);

	const header = `Time,${props.title}${props.unit ? ` (${props.unit})` : ""}`;
	const csv = [header, ...labels.map((label, i) => `${label},${values[i]}`)].join("\n");

	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${props.title.toLowerCase().replace(/\s+/g, "-")}-metrics.csv`;
	a.click();
	URL.revokeObjectURL(url);
}
</script>

<template>
	<ContextMenu>
		<ContextMenuTrigger as-child>
			<Card class="cursor-context-menu">
				<CardHeader>
					<CardTitle>{{ title }}</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="h-64">
						<template v-if="loading">
							<Skeleton class="h-full w-full" />
						</template>
						<template v-else-if="data.length > 0">
							<Line :data="chartData" :options="chartOptions" />
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
			<ContextMenuItem @click="copyChartData">
				<Copy class="h-4 w-4" />
				Copy Data as JSON
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem @click="exportAsCSV">
				<Download class="h-4 w-4" />
				Export as CSV
			</ContextMenuItem>
		</ContextMenuContent>
	</ContextMenu>
</template>
