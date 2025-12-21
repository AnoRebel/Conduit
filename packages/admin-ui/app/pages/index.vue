<script setup lang="ts">
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const store = useAdminStore();
const api = useAdminApi();
const apiKeyInput = ref("");

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
	return ((store.metrics.memory.heapUsed / store.metrics.memory.heapTotal) * 100).toFixed(1);
});

function handleLogin() {
	if (apiKeyInput.value) {
		api.setApiKey(apiKeyInput.value);
		store.initialize();
	}
}
</script>

<template>
	<div>
		<!-- Auth check -->
		<div
			v-if="!api.isAuthenticated.value"
			class="flex items-center justify-center min-h-[60vh]"
		>
			<Card class="w-full max-w-md">
				<CardHeader>
					<CardTitle class="text-xl">Authentication Required</CardTitle>
					<CardDescription>
						Enter your API key to access the admin dashboard.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form class="space-y-4" @submit.prevent="handleLogin">
						<div class="space-y-2">
							<Label for="apiKey">API Key</Label>
							<Input
								id="apiKey"
								v-model="apiKeyInput"
								type="password"
								placeholder="Enter your API key"
							/>
						</div>
						<Button type="submit" class="w-full">
							Connect
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>

		<!-- Dashboard content -->
		<div v-else>
			<div class="flex items-center justify-between mb-6" data-tour-guide="dashboard-header">
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
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					<Card v-for="i in 4" :key="i">
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
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
					<!-- Connected Clients -->
					<Card data-tour-guide="active-clients-card">
						<CardHeader class="flex flex-row items-center justify-between pb-2">
							<CardDescription>Connected Clients</CardDescription>
							<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
								<Users class="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div class="text-3xl font-bold">
								{{ store.metrics?.clients.connected ?? 0 }}
							</div>
							<p class="text-xs text-muted-foreground mt-1">
								Peak: {{ store.metrics?.clients.peak ?? 0 }}
							</p>
						</CardContent>
					</Card>

					<!-- Messages Relayed -->
					<Card data-tour-guide="messages-card">
						<CardHeader class="flex flex-row items-center justify-between pb-2">
							<CardDescription>Messages Relayed</CardDescription>
							<div class="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
								<MessageSquare class="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div class="text-3xl font-bold">
								{{ store.metrics?.messages.relayed?.toLocaleString() ?? 0 }}
							</div>
							<p class="text-xs text-muted-foreground mt-1">
								{{ store.metrics?.messages.throughputPerSecond ?? 0 }} msg/s
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
								v{{ store.status?.version ?? "N/A" }}
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
				</div>

				<!-- Quick Actions & Recent Activity -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
					<!-- Quick Actions -->
					<Card data-tour-guide="quick-actions">
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
						</CardHeader>
						<CardContent class="space-y-2">
							<Button variant="ghost" class="w-full justify-start" @click="store.fetchClients">
								<RefreshCw class="h-4 w-4" />
								Refresh Clients
							</Button>
							<Button variant="ghost" class="w-full justify-start" @click="store.fetchMetrics">
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
					<Card data-tour-guide="server-status-card">
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
			</template>
		</div>
	</div>
</template>
