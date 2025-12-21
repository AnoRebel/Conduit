<script setup lang="ts">
import { Clock, HardDrive, MessageSquare, Users } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const props = defineProps<{
	status?: {
		running: boolean;
		version: string;
		uptime: number;
	} | null;
	metrics?: {
		clients: { connected: number; peak: number };
		messages: { relayed: number; throughputPerSecond: number; queued: number };
		memory: { heapUsed: number; heapTotal: number };
		rateLimit: { hits: number; rejections: number };
		errors: { total: number };
	} | null;
	loading?: boolean;
}>();

const uptime = computed(() => {
	if (!props.status?.uptime) return "N/A";
	const seconds = Math.floor(props.status.uptime / 1000);
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
});

const memoryUsage = computed(() => {
	if (!props.metrics?.memory) return "N/A";
	const mb = props.metrics.memory.heapUsed / 1024 / 1024;
	return `${mb.toFixed(1)} MB`;
});

const memoryPercent = computed(() => {
	if (!props.metrics?.memory) return 0;
	return ((props.metrics.memory.heapUsed / props.metrics.memory.heapTotal) * 100).toFixed(1);
});
</script>

<template>
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		<template v-if="loading">
			<Card v-for="i in 4" :key="i">
				<CardHeader class="pb-2">
					<Skeleton class="h-4 w-24" />
				</CardHeader>
				<CardContent>
					<Skeleton class="h-8 w-20 mb-2" />
					<Skeleton class="h-3 w-16" />
				</CardContent>
			</Card>
		</template>

		<template v-else>
			<!-- Connected Clients -->
			<Card>
				<CardHeader class="flex flex-row items-center justify-between pb-2">
					<CardDescription>Connected Clients</CardDescription>
					<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
						<Users class="h-4 w-4 text-blue-600 dark:text-blue-400" />
					</div>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">
						{{ metrics?.clients.connected ?? 0 }}
					</div>
					<p class="text-xs text-muted-foreground mt-1">
						Peak: {{ metrics?.clients.peak ?? 0 }}
					</p>
				</CardContent>
			</Card>

			<!-- Messages Relayed -->
			<Card>
				<CardHeader class="flex flex-row items-center justify-between pb-2">
					<CardDescription>Messages Relayed</CardDescription>
					<div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
						<MessageSquare class="h-4 w-4 text-green-600 dark:text-green-400" />
					</div>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">
						{{ metrics?.messages.relayed?.toLocaleString() ?? 0 }}
					</div>
					<p class="text-xs text-muted-foreground mt-1">
						{{ metrics?.messages.throughputPerSecond ?? 0 }} msg/s
					</p>
				</CardContent>
			</Card>

			<!-- Uptime -->
			<Card>
				<CardHeader class="flex flex-row items-center justify-between pb-2">
					<CardDescription>Uptime</CardDescription>
					<div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
						<Clock class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					</div>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{{ uptime }}</div>
					<p class="text-xs text-muted-foreground mt-1">
						v{{ status?.version ?? "N/A" }}
					</p>
				</CardContent>
			</Card>

			<!-- Memory Usage -->
			<Card>
				<CardHeader class="flex flex-row items-center justify-between pb-2">
					<CardDescription>Memory</CardDescription>
					<div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
						<HardDrive class="h-4 w-4 text-orange-600 dark:text-orange-400" />
					</div>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{{ memoryUsage }}</div>
					<p class="text-xs text-muted-foreground mt-1">
						{{ memoryPercent }}% of heap
					</p>
				</CardContent>
			</Card>
		</template>
	</div>

	<!-- Detailed Status Card -->
	<Card class="mt-6">
		<CardHeader>
			<CardTitle>Server Status</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="flex justify-between items-center">
				<span class="text-muted-foreground">Status</span>
				<Badge :variant="status?.running ? 'default' : 'destructive'">
					{{ status?.running ? "Running" : "Stopped" }}
				</Badge>
			</div>
			<Separator />
			<div class="flex justify-between items-center">
				<span class="text-muted-foreground">Rate Limit Hits</span>
				<span class="font-medium">
					{{ metrics?.rateLimit.hits ?? 0 }}
				</span>
			</div>
			<div class="flex justify-between items-center">
				<span class="text-muted-foreground">Errors</span>
				<span class="font-medium">
					{{ metrics?.errors.total ?? 0 }}
				</span>
			</div>
			<div class="flex justify-between items-center">
				<span class="text-muted-foreground">Queued Messages</span>
				<span class="font-medium">
					{{ metrics?.messages.queued ?? 0 }}
				</span>
			</div>
		</CardContent>
	</Card>
</template>
