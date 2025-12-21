<script setup lang="ts">
import { Key, Save, Trash2, Users } from "lucide-vue-next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const api = useAdminApi();
const store = useAdminStore();
const breadcrumbItems = [{ label: "Settings" }];

const rateLimitEnabled = ref(true);
const rateLimitMaxTokens = ref(100);
const rateLimitRefillRate = ref(10);
const isSaving = ref(false);
const saveMessage = ref("");
const saveSuccess = ref(false);

// Dialog states
const clearApiKeyDialogOpen = ref(false);
const clearBansDialogOpen = ref(false);
const disconnectAllDialogOpen = ref(false);

onMounted(async () => {
	try {
		const config = await api.getConfig();
		if (config.rateLimit) {
			const rl = config.rateLimit as {
				enabled?: boolean;
				maxRequests?: number;
				windowMs?: number;
			};
			rateLimitEnabled.value = rl.enabled ?? true;
			rateLimitMaxTokens.value = rl.maxRequests ?? 100;
		}
	} catch {
		// Use defaults
	}
});

async function saveRateLimits() {
	isSaving.value = true;
	saveMessage.value = "";

	try {
		await api.updateRateLimits({
			enabled: rateLimitEnabled.value,
			maxTokens: rateLimitMaxTokens.value,
			refillRate: rateLimitRefillRate.value,
		});
		saveMessage.value = "Rate limits updated successfully";
		saveSuccess.value = true;
	} catch (e) {
		saveMessage.value = e instanceof Error ? e.message : "Failed to save settings";
		saveSuccess.value = false;
	} finally {
		isSaving.value = false;
		setTimeout(() => {
			saveMessage.value = "";
		}, 3000);
	}
}

function confirmClearApiKey() {
	localStorage.removeItem("adminApiKey");
	window.location.reload();
}

async function confirmClearBans() {
	try {
		await api.fetchApi("/bans", { method: "DELETE" });
		await store.fetchBans();
		clearBansDialogOpen.value = false;
	} catch {
		// Handle error
	}
}

async function confirmDisconnectAll() {
	await api.disconnectAllClients();
	await store.fetchClients();
	disconnectAllDialogOpen.value = false;
}
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div class="mb-6" data-tour-guide="settings-header">
			<h1 class="text-2xl font-bold text-foreground">Settings</h1>
			<p class="text-muted-foreground">Configure server and admin settings</p>
		</div>

		<div class="space-y-6">
			<!-- Rate Limiting -->
			<Card data-tour-guide="api-settings">
				<CardHeader>
					<CardTitle>Rate Limiting</CardTitle>
					<CardDescription>
						Configure rate limiting to protect your server from abuse
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="flex items-center justify-between">
						<div class="space-y-0.5">
							<Label>Enable Rate Limiting</Label>
							<p class="text-sm text-muted-foreground">
								Limit the number of messages per client
							</p>
						</div>
						<Switch v-model:checked="rateLimitEnabled" />
					</div>

					<Separator />

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="maxTokens">Max Tokens</Label>
							<Input
								id="maxTokens"
								v-model.number="rateLimitMaxTokens"
								type="number"
								min="1"
							/>
							<p class="text-xs text-muted-foreground">
								Maximum number of tokens in the bucket
							</p>
						</div>

						<div class="space-y-2">
							<Label for="refillRate">Refill Rate</Label>
							<Input
								id="refillRate"
								v-model.number="rateLimitRefillRate"
								type="number"
								min="1"
							/>
							<p class="text-xs text-muted-foreground">
								Tokens added per second
							</p>
						</div>
					</div>

					<div class="flex items-center gap-4">
						<Button :disabled="isSaving" @click="saveRateLimits">
							<Save class="h-4 w-4" />
							{{ isSaving ? "Saving..." : "Save Changes" }}
						</Button>
						<Alert
							v-if="saveMessage"
							:variant="saveSuccess ? 'default' : 'destructive'"
							class="flex-1 py-2"
						>
							<AlertDescription>{{ saveMessage }}</AlertDescription>
						</Alert>
					</div>
				</CardContent>
			</Card>

			<!-- Authentication -->
			<Card data-tour-guide="appearance-settings">
				<CardHeader>
					<CardTitle>Authentication</CardTitle>
					<CardDescription>
						Manage your API key and authentication settings
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
						<div class="flex items-center gap-3">
							<Key class="h-5 w-5 text-muted-foreground" />
							<div>
								<p class="text-sm font-medium">API Key</p>
								<p class="text-xs text-muted-foreground">
									{{ api.isAuthenticated.value ? "Configured" : "Not configured" }}
								</p>
							</div>
						</div>
						<Button variant="ghost" size="sm" @click="clearApiKeyDialogOpen = true">
							Clear
						</Button>
					</div>
				</CardContent>
			</Card>

			<!-- Danger Zone -->
			<Card class="border-destructive/50">
				<CardHeader>
					<CardTitle class="text-destructive">Danger Zone</CardTitle>
					<CardDescription>
						Irreversible and destructive actions
					</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
						<div>
							<p class="text-sm font-medium">Clear All Bans</p>
							<p class="text-xs text-muted-foreground">
								Remove all client and IP bans
							</p>
						</div>
						<Button variant="outline" size="sm" @click="clearBansDialogOpen = true">
							<Trash2 class="h-4 w-4" />
							Clear Bans
						</Button>
					</div>

					<div class="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
						<div>
							<p class="text-sm font-medium">Disconnect All Clients</p>
							<p class="text-xs text-muted-foreground">
								Force disconnect all connected clients
							</p>
						</div>
						<Button variant="outline" size="sm" @click="disconnectAllDialogOpen = true">
							<Users class="h-4 w-4" />
							Disconnect All
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- Clear API Key Dialog -->
		<AlertDialog v-model:open="clearApiKeyDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Clear API Key</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to clear your stored API key?
						You will need to re-authenticate to access the admin dashboard.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction @click="confirmClearApiKey">
						Clear API Key
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>

		<!-- Clear Bans Dialog -->
		<AlertDialog v-model:open="clearBansDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Clear All Bans</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to remove all client and IP bans?
						This action cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction @click="confirmClearBans">
						Clear All Bans
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>

		<!-- Disconnect All Dialog -->
		<AlertDialog v-model:open="disconnectAllDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect All Clients</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to disconnect all connected clients?
						This will terminate all active connections immediately.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction @click="confirmDisconnectAll">
						Disconnect All
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</div>
</template>
