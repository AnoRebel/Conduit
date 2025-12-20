<script setup lang="ts">
import { Save, RefreshCw, Trash2, Key } from "lucide-vue-next";

const api = useAdminApi();
const store = useAdminStore();

const rateLimitEnabled = ref(true);
const rateLimitMaxTokens = ref(100);
const rateLimitRefillRate = ref(10);
const isSaving = ref(false);
const saveMessage = ref("");

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
	} catch (e) {
		saveMessage.value =
			e instanceof Error ? e.message : "Failed to save settings";
	} finally {
		isSaving.value = false;
	}
}

function clearApiKey() {
	if (confirm("Clear stored API key? You will need to re-authenticate.")) {
		localStorage.removeItem("adminApiKey");
		window.location.reload();
	}
}

async function clearBans() {
	if (confirm("Clear all bans? This cannot be undone.")) {
		try {
			await api.fetchApi("/bans", { method: "DELETE" });
			await store.fetchBans();
		} catch {
			// Handle error
		}
	}
}
</script>

<template>
	<div>
		<div class="mb-6">
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
				Settings
			</h1>
			<p class="text-gray-600 dark:text-gray-400">
				Configure server and admin settings
			</p>
		</div>

		<div class="space-y-6">
			<!-- Rate Limiting -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Rate Limiting
				</h3>

				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<div>
							<label class="text-sm font-medium text-gray-900 dark:text-white">
								Enable Rate Limiting
							</label>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Limit the number of messages per client
							</p>
						</div>
						<button
							:class="[
								'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
								rateLimitEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700',
							]"
							@click="rateLimitEnabled = !rateLimitEnabled"
						>
							<span
								:class="[
									'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
									rateLimitEnabled ? 'translate-x-5' : 'translate-x-0',
								]"
							/>
						</button>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-900 dark:text-white mb-1">
							Max Tokens
						</label>
						<input
							v-model.number="rateLimitMaxTokens"
							type="number"
							min="1"
							class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
						/>
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Maximum number of tokens in the bucket
						</p>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-900 dark:text-white mb-1">
							Refill Rate
						</label>
						<input
							v-model.number="rateLimitRefillRate"
							type="number"
							min="1"
							class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
						/>
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Tokens added per second
						</p>
					</div>

					<div class="flex items-center gap-4">
						<button
							class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
							:disabled="isSaving"
							@click="saveRateLimits"
						>
							<Save class="h-4 w-4" />
							{{ isSaving ? "Saving..." : "Save Changes" }}
						</button>
						<span
							v-if="saveMessage"
							:class="[
								'text-sm',
								saveMessage.includes('success')
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400',
							]"
						>
							{{ saveMessage }}
						</span>
					</div>
				</div>
			</div>

			<!-- Authentication -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
					Authentication
				</h3>

				<div class="space-y-4">
					<div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
						<div class="flex items-center gap-3">
							<Key class="h-5 w-5 text-gray-400" />
							<div>
								<p class="text-sm font-medium text-gray-900 dark:text-white">
									API Key
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{{ api.isAuthenticated.value ? "Configured" : "Not configured" }}
								</p>
							</div>
						</div>
						<button
							class="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
							@click="clearApiKey"
						>
							Clear
						</button>
					</div>
				</div>
			</div>

			<!-- Danger Zone -->
			<div
				class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-red-200 dark:border-red-800"
			>
				<h3 class="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
					Danger Zone
				</h3>

				<div class="space-y-4">
					<div class="flex items-center justify-between p-4 border border-red-200 dark:border-red-800 rounded-lg">
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Clear All Bans
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Remove all client and IP bans
							</p>
						</div>
						<button
							class="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
							@click="clearBans"
						>
							<Trash2 class="h-4 w-4" />
							Clear Bans
						</button>
					</div>

					<div class="flex items-center justify-between p-4 border border-red-200 dark:border-red-800 rounded-lg">
						<div>
							<p class="text-sm font-medium text-gray-900 dark:text-white">
								Disconnect All Clients
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Force disconnect all connected clients
							</p>
						</div>
						<button
							class="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
							@click="
								async () => {
									if (confirm('Disconnect all clients?')) {
										await api.disconnectAllClients();
										await store.fetchClients();
									}
								}
							"
						>
							<Trash2 class="h-4 w-4" />
							Disconnect All
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
