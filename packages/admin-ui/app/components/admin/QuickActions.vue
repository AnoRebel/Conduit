<script setup lang="ts">
import { RefreshCw, Settings, TrendingUp, Users } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const emit = defineEmits<{
	refreshClients: [];
	refreshMetrics: [];
	viewClients: [];
	viewSettings: [];
}>();
</script>

<template>
	<Card>
		<CardHeader>
			<CardTitle>Quick Actions</CardTitle>
		</CardHeader>
		<CardContent class="space-y-2">
			<Button variant="ghost" class="w-full justify-start" @click="emit('refreshClients')">
				<RefreshCw class="h-4 w-4" />
				Refresh Clients
			</Button>
			<Button variant="ghost" class="w-full justify-start" @click="emit('refreshMetrics')">
				<TrendingUp class="h-4 w-4" />
				Refresh Metrics
			</Button>
			<Button variant="ghost" class="w-full justify-start" @click="emit('viewClients')">
				<Users class="h-4 w-4" />
				View All Clients
			</Button>
			<Button variant="ghost" class="w-full justify-start" @click="emit('viewSettings')">
				<Settings class="h-4 w-4" />
				Server Settings
			</Button>
		</CardContent>
	</Card>
</template>
