<script setup lang="ts">
import { RefreshCw, Filter } from "lucide-vue-next";

const store = useAdminStore();
const selectedAction = ref("");

const actionTypes = [
	{ label: "All Actions", value: "" },
	{ label: "Disconnect Client", value: "disconnect_client" },
	{ label: "Ban Client", value: "ban_client" },
	{ label: "Unban Client", value: "unban_client" },
	{ label: "Ban IP", value: "ban_ip" },
	{ label: "Unban IP", value: "unban_ip" },
	{ label: "Broadcast", value: "broadcast" },
	{ label: "Update Rate Limits", value: "update_rate_limits" },
	{ label: "Toggle Feature", value: "toggle_feature" },
];

onMounted(() => {
	store.fetchAuditLog();
});

const filteredEntries = computed(() => {
	if (!selectedAction.value) return store.auditLog;
	return store.auditLog.filter(
		(entry) => entry.action === selectedAction.value,
	);
});

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

function formatAction(action: string) {
	return action
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function getActionColor(action: string) {
	if (action.includes("ban")) {
		return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
	}
	if (action.includes("unban")) {
		return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
	}
	if (action.includes("disconnect")) {
		return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400";
	}
	if (action.includes("broadcast")) {
		return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
	}
	return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400";
}
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">
					Audit Log
				</h1>
				<p class="text-gray-600 dark:text-gray-400">
					Track administrative actions
				</p>
			</div>
			<button
				class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
				@click="store.fetchAuditLog"
			>
				<RefreshCw class="h-4 w-4" />
				Refresh
			</button>
		</div>

		<!-- Filter -->
		<div class="mb-6 flex items-center gap-4">
			<Filter class="h-5 w-5 text-gray-400" />
			<select
				v-model="selectedAction"
				class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
			>
				<option v-for="action in actionTypes" :key="action.value" :value="action.value">
					{{ action.label }}
				</option>
			</select>
		</div>

		<!-- Audit log table -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
		>
			<table class="w-full">
				<thead class="bg-gray-50 dark:bg-gray-700">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Timestamp
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Action
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							User
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
						>
							Details
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
					<tr
						v-for="entry in filteredEntries"
						:key="entry.id"
						class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
					>
						<td
							class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap"
						>
							{{ formatTime(entry.timestamp) }}
						</td>
						<td class="px-6 py-4">
							<span
								:class="[
									'px-2 py-1 rounded-full text-xs font-medium',
									getActionColor(entry.action),
								]"
							>
								{{ formatAction(entry.action) }}
							</span>
						</td>
						<td
							class="px-6 py-4 text-sm text-gray-900 dark:text-white font-mono"
						>
							{{ entry.userId }}
						</td>
						<td
							class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400"
						>
							<code
								v-if="entry.details"
								class="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded"
							>
								{{ JSON.stringify(entry.details) }}
							</code>
							<span v-else class="text-gray-400">-</span>
						</td>
					</tr>
					<tr v-if="filteredEntries.length === 0">
						<td
							colspan="4"
							class="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
						>
							No audit entries found
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
