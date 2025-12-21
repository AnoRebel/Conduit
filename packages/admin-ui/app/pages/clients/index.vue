<script setup lang="ts">
import { Ban, RefreshCw, Search, UserX } from "lucide-vue-next";

const store = useAdminStore();
const searchQuery = ref("");

// Fetch clients on mount
onMounted(() => {
	store.fetchClients();
});

const filteredClients = computed(() => {
	if (!searchQuery.value) return store.clients;
	const query = searchQuery.value.toLowerCase();
	return store.clients.filter(client => client.id.toLowerCase().includes(query));
});

async function handleDisconnect(id: string) {
	if (confirm(`Disconnect client ${id}?`)) {
		await store.disconnectClient(id);
	}
}

async function handleBan(id: string) {
	const reason = prompt(`Ban reason for ${id}:`);
	if (reason !== null) {
		await store.banClient(id, reason || undefined);
	}
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-6" data-tour-guide="clients-header">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
					Clients
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Manage connected clients
				</p>
			</div>
			<button
				class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
				@click="store.fetchClients"
			>
				<RefreshCw class="h-4 w-4" />
				Refresh
			</button>
		</div>

		<!-- Search -->
		<div class="mb-6" data-tour-guide="clients-search">
			<div class="relative">
				<Search
					class="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
				/>
				<input
					v-model="searchQuery"
					type="text"
					placeholder="Search by client ID..."
					class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
				/>
			</div>
		</div>

		<!-- Clients table -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
			data-tour-guide="clients-list"
		>
			<table class="w-full">
				<thead class="bg-gray-50 dark:bg-gray-700">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Client ID
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Status
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Connected At
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Messages
						</th>
						<th
							class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Actions
						</th>
					</tr>
				</thead>
				<TransitionGroup
					tag="tbody"
					name="list"
					class="divide-y divide-gray-200 dark:divide-gray-700"
				>
					<tr
						v-for="(client, index) in filteredClients"
						:key="client.id"
						class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
						:style="{ animationDelay: `${index * 50}ms` }"
					>
						<td class="px-6 py-4">
							<NuxtLink
								:to="`/clients/${client.id}`"
								class="text-primary-600 dark:text-primary-400 hover:underline font-mono text-sm"
							>
								{{ client.id }}
							</NuxtLink>
						</td>
						<td class="px-6 py-4">
							<span
								:class="[
									'px-2 py-1 rounded-full text-xs font-medium',
									client.connected
										? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
										: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400',
								]"
							>
								{{ client.connected ? "Connected" : "Disconnected" }}
							</span>
						</td>
						<td
							class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400"
						>
							{{ formatTime(client.connectedAt) }}
						</td>
						<td
							class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400"
						>
							{{ client.messagesReceived }} / {{ client.messagesSent }}
						</td>
						<td class="px-6 py-4 text-right" data-tour-guide="client-actions">
							<div class="flex justify-end gap-2">
								<button
									class="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
									title="Disconnect"
									@click="handleDisconnect(client.id)"
								>
									<UserX class="h-4 w-4" />
								</button>
								<button
									class="p-2 text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
									title="Ban"
									@click="handleBan(client.id)"
								>
									<Ban class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
					<tr v-if="filteredClients.length === 0" key="empty">
						<td
							colspan="5"
							class="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
						>
							No clients found
						</td>
					</tr>
				</TransitionGroup>
			</table>
		</div>
	</div>
</template>
