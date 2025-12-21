<script setup lang="ts">
import {
	Users,
	MessageSquare,
	Activity,
	HardDrive,
	TrendingUp,
	Clock,
} from "lucide-vue-next";

const store = useAdminStore();
const api = useAdminApi();

// Initialize on mount
onMounted(async () => {
	api.loadApiKey();
	if (api.isAuthenticated.value) {
		await store.initialize();
	}
});

onUnmounted(() => {
	store.cleanup();
});

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
	return (
		(store.metrics.memory.heapUsed / store.metrics.memory.heapTotal) *
		100
	).toFixed(1);
});
</script>

<template>
	<div>
		<!-- Auth check -->
		<div
			v-if="!api.isAuthenticated.value"
			class="max-w-md mx-auto mt-20 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg"
		>
			<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
				Authentication Required
			</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Enter your API key to access the admin dashboard.
			</p>
			<form
				@submit.prevent="
					() => {
						const input = $event.target as HTMLFormElement;
						const key = (input.elements.namedItem('apiKey') as HTMLInputElement)
							?.value;
						if (key) {
							api.setApiKey(key);
							store.initialize();
						}
					}
				"
			>
				<input
					name="apiKey"
					type="password"
					placeholder="API Key"
					class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
				/>
				<button
					type="submit"
					class="mt-4 w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
				>
					Connect
				</button>
			</form>
		</div>

		<!-- Dashboard content -->
		<div v-else>
			<div class="mb-6" data-tour-guide="dashboard-header">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
					Dashboard
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Monitor your Conduit server in real-time
				</p>
			</div>

			<template v-if="store.isLoading">
				<!-- Loading state -->
				<div class="flex justify-center py-12">
					<div class="flex flex-col items-center gap-3">
						<div
							class="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent"
						/>
						<span class="text-sm text-gray-500 dark:text-gray-400 animate-pulse-subtle">
							Loading dashboard...
						</span>
					</div>
				</div>
			</template>

			<template v-else-if="store.error">
				<!-- Error state -->
				<div
					class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400"
				>
					{{ store.error }}
				</div>
			</template>

			<!-- Stats grid -->
			<template v-else>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<!-- Connected Clients -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 card-hover animate-in stagger-1"
					data-tour-guide="active-clients-card"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Connected Clients
							</p>
							<p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">
								{{ store.metrics?.clients.connected ?? 0 }}
							</p>
						</div>
						<div
							class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg"
						>
							<Users class="h-6 w-6 text-blue-600 dark:text-blue-400" />
						</div>
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
						Peak: {{ store.metrics?.clients.peak ?? 0 }}
					</p>
				</div>

				<!-- Messages Relayed -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 card-hover animate-in stagger-2"
					data-tour-guide="messages-card"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Messages Relayed
							</p>
							<p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">
								{{ store.metrics?.messages.relayed?.toLocaleString() ?? 0 }}
							</p>
						</div>
						<div
							class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg"
						>
							<MessageSquare
								class="h-6 w-6 text-green-600 dark:text-green-400"
							/>
						</div>
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
						{{ store.metrics?.messages.throughputPerSecond ?? 0 }} msg/s
					</p>
				</div>

				<!-- Uptime -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 card-hover animate-in stagger-3"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-gray-500 dark:text-gray-400">Uptime</p>
							<p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">
								{{ uptime }}
							</p>
						</div>
						<div
							class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg"
						>
							<Clock class="h-6 w-6 text-purple-600 dark:text-purple-400" />
						</div>
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
						v{{ store.status?.version ?? "N/A" }}
					</p>
				</div>

				<!-- Memory Usage -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 card-hover animate-in stagger-4"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-gray-500 dark:text-gray-400">Memory</p>
							<p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">
								{{ memoryUsage }}
							</p>
						</div>
						<div
							class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg"
						>
							<HardDrive
								class="h-6 w-6 text-orange-600 dark:text-orange-400"
							/>
						</div>
					</div>
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
						{{ memoryPercent }}% of heap
					</p>
				</div>
			</div>

			<!-- Quick Actions & Recent Activity -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
				<!-- Quick Actions -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-in stagger-5"
					data-tour-guide="quick-actions"
				>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Quick Actions
					</h3>
					<div class="space-y-2">
						<button
							class="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
							@click="store.fetchClients"
						>
							Refresh Clients
						</button>
						<button
							class="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
							@click="store.fetchMetrics"
						>
							Refresh Metrics
						</button>
						<NuxtLink
							to="/clients"
							class="block w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
						>
							View All Clients
						</NuxtLink>
						<NuxtLink
							to="/settings"
							class="block w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
						>
							Server Settings
						</NuxtLink>
					</div>
				</div>

				<!-- Server Status -->
				<div
					class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-in"
					style="animation-delay: 300ms"
					data-tour-guide="server-status-card"
				>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Server Status
					</h3>
					<div class="space-y-3">
						<div class="flex justify-between items-center">
							<span class="text-gray-600 dark:text-gray-400">Status</span>
							<span
								:class="[
									'px-2 py-1 rounded-full text-xs font-medium',
									store.status?.running
										? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
										: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
								]"
							>
								{{ store.status?.running ? "Running" : "Stopped" }}
							</span>
						</div>
						<div class="flex justify-between items-center">
							<span class="text-gray-600 dark:text-gray-400">Rate Limit Hits</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{{ store.metrics?.rateLimit.hits ?? 0 }}
							</span>
						</div>
						<div class="flex justify-between items-center">
							<span class="text-gray-600 dark:text-gray-400">Errors</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{{ store.metrics?.errors.total ?? 0 }}
							</span>
						</div>
						<div class="flex justify-between items-center">
							<span class="text-gray-600 dark:text-gray-400">Queued Messages</span>
							<span class="text-gray-900 dark:text-white font-medium">
								{{ store.metrics?.messages.queued ?? 0 }}
							</span>
						</div>
					</div>
				</div>
			</div>
			</template>
		</div>
	</div>
</template>
