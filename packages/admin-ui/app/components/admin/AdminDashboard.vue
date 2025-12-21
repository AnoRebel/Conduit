<script setup lang="ts">
import { AlertCircle, RefreshCw } from "lucide-vue-next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import QuickActions from "./QuickActions.vue";
import ServerStatus from "./ServerStatus.vue";

export interface ServerStatusData {
	running: boolean;
	version: string;
	uptime: number;
}

export interface MetricsData {
	clients: { connected: number; peak: number };
	messages: { relayed: number; throughputPerSecond: number; queued: number };
	memory: { heapUsed: number; heapTotal: number };
	rateLimit: { hits: number; rejections: number };
	errors: { total: number };
}

const props = defineProps<{
	status?: ServerStatusData | null;
	metrics?: MetricsData | null;
	loading?: boolean;
	error?: string | null;
}>();

const emit = defineEmits<{
	refresh: [];
	refreshClients: [];
	refreshMetrics: [];
	viewClients: [];
	viewSettings: [];
}>();
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">
					Dashboard
				</h1>
				<p class="text-muted-foreground">
					Monitor your Conduit server in real-time
				</p>
			</div>
			<Button variant="outline" size="sm" @click="emit('refresh')">
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
		</div>

		<!-- Error state -->
		<Alert v-if="error" variant="destructive" class="mb-6">
			<AlertCircle class="h-4 w-4" />
			<AlertTitle>Error</AlertTitle>
			<AlertDescription>{{ error }}</AlertDescription>
		</Alert>

		<!-- Status cards -->
		<ServerStatus :status="status" :metrics="metrics" :loading="loading" />

		<!-- Quick Actions -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
			<QuickActions
				@refresh-clients="emit('refreshClients')"
				@refresh-metrics="emit('refreshMetrics')"
				@view-clients="emit('viewClients')"
				@view-settings="emit('viewSettings')"
			/>
		</div>
	</div>
</template>
