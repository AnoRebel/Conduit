<script setup lang="ts">
import { Info, Save } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ServerConfig {
	rateLimit: {
		enabled: boolean;
		maxRequestsPerSecond: number;
		maxConnectionsPerIp: number;
	};
	features: {
		discovery: boolean;
		relay: boolean;
	};
}

const props = defineProps<{
	config: ServerConfig;
	saving?: boolean;
}>();

const emit = defineEmits<{
	save: [config: ServerConfig];
}>();

const localConfig = ref<ServerConfig>({ ...props.config });

// Update local config when prop changes
watch(
	() => props.config,
	newConfig => {
		localConfig.value = { ...newConfig };
	},
	{ deep: true }
);

function handleSave() {
	emit("save", localConfig.value);
}

const hasChanges = computed(() => {
	return JSON.stringify(localConfig.value) !== JSON.stringify(props.config);
});
</script>

<template>
	<div class="space-y-6">
		<!-- Rate Limiting -->
		<Card>
			<CardHeader>
				<CardTitle>Rate Limiting</CardTitle>
				<CardDescription>
					Configure request rate limits to protect your server
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Enable Rate Limiting</Label>
						<p class="text-sm text-muted-foreground">
							Limit the number of requests clients can make
						</p>
					</div>
					<Switch v-model:checked="localConfig.rateLimit.enabled" />
				</div>

				<Separator />

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<Label for="maxRequests">Max Requests/Second</Label>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Info class="h-4 w-4 text-muted-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										Maximum number of requests a client can make per second
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<Input
							id="maxRequests"
							v-model.number="localConfig.rateLimit.maxRequestsPerSecond"
							type="number"
							min="1"
							:disabled="!localConfig.rateLimit.enabled"
						/>
					</div>
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<Label for="maxConnections">Max Connections/IP</Label>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Info class="h-4 w-4 text-muted-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										Maximum number of simultaneous connections from a single IP
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<Input
							id="maxConnections"
							v-model.number="localConfig.rateLimit.maxConnectionsPerIp"
							type="number"
							min="1"
							:disabled="!localConfig.rateLimit.enabled"
						/>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Features -->
		<Card>
			<CardHeader>
				<CardTitle>Features</CardTitle>
				<CardDescription>
					Enable or disable server features
				</CardDescription>
			</CardHeader>
			<CardContent class="space-y-6">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Peer Discovery</Label>
						<p class="text-sm text-muted-foreground">
							Allow clients to discover and connect to other peers
						</p>
					</div>
					<Switch v-model:checked="localConfig.features.discovery" />
				</div>

				<Separator />

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Message Relay</Label>
						<p class="text-sm text-muted-foreground">
							Relay messages between peers through the server
						</p>
					</div>
					<Switch v-model:checked="localConfig.features.relay" />
				</div>
			</CardContent>
			<CardFooter>
				<Button :disabled="!hasChanges || saving" @click="handleSave">
					<Save class="h-4 w-4" />
					{{ saving ? "Saving..." : "Save Changes" }}
				</Button>
			</CardFooter>
		</Card>
	</div>
</template>
