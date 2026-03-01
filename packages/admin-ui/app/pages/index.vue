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
import { toast } from "vue-sonner";
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

async function handleLogin() {
	if (apiKeyInput.value) {
		api.setApiKey(apiKeyInput.value);
		await store.initialize();
		toast.success("Authenticated successfully");
	}
}

async function refreshClients() {
	await store.fetchClients();
	toast.success("Clients refreshed");
}

async function refreshMetrics() {
	await store.fetchMetrics();
	toast.success("Metrics refreshed");
}

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
		sub: `${store.metrics?.messages.throughputPerSecond ?? 0} msg/s`,
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
		<!-- Auth check -->
		<div
			v-if="!api.isAuthenticated.value"
			class="flex items-center justify-center min-h-[60vh]"
		>
			<Card
				v-motion
				:initial="{ opacity: 0, scale: 0.95 }"
				:enter="{ opacity: 1, scale: 1, transition: { duration: 350, ease: 'easeOut' } }"
				class="w-full max-w-md"
			>
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
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
					<Card
						v-for="(card, index) in statsCards"
						:key="card.key"
						v-motion
						:initial="{ opacity: 0, y: 20 }"
						:visible-once="{ opacity: 1, y: 0, transition: { duration: 350, delay: index * 75 } }"
						:data-tour-guide="card.tourGuide"
					>
						<CardHeader class="flex flex-row items-center justify-between pb-2">
							<CardDescription>{{ card.label }}</CardDescription>
							<div class="p-2 rounded-lg" :class="card.iconBg">
								<component :is="card.icon" class="h-4 w-4" :class="card.iconColor" />
							</div>
						</CardHeader>
						<CardContent>
							<div class="text-3xl font-bold">
								{{ card.value }}
							</div>
							<p class="text-xs text-muted-foreground mt-1">
								{{ card.sub }}
							</p>
						</CardContent>
					</Card>
				</div>

				<!-- Quick Actions & Recent Activity -->
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
			</template>
		</div>
	</div>
</template>
