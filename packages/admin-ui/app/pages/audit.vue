<script setup lang="ts">
import { Copy, Filter, RefreshCw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuditEntry } from "~/types";
import type { DataTableColumns } from "~/types/table";

const store = useAdminStore();
const breadcrumbItems = [{ label: "Audit Log" }];
const selectedAction = ref("all");
const isLoading = ref(false);

/**
 * Columns drive the header row and sorting; per-row markup stays in the
 * template via DataTable's `row` slot, so the context menus and tooltips this
 * page relies on are preserved rather than squeezed into render functions.
 */
const columns: DataTableColumns<AuditEntry> = [
	{ accessorKey: "timestamp", header: "Timestamp" },
	{ accessorKey: "action", header: "Action" },
	{ accessorKey: "userId", header: "User" },
	{ id: "details", header: "Details", enableSorting: false },
];

const actionTypes = [
	{ label: "All Actions", value: "all" },
	{ label: "Disconnect Client", value: "disconnect_client" },
	{ label: "Ban Client", value: "ban_client" },
	{ label: "Unban Client", value: "unban_client" },
	{ label: "Ban IP", value: "ban_ip" },
	{ label: "Unban IP", value: "unban_ip" },
	{ label: "Broadcast", value: "broadcast" },
	{ label: "Update Rate Limits", value: "update_rate_limits" },
	{ label: "Toggle Feature", value: "toggle_feature" },
];

onMounted(async () => {
	isLoading.value = true;
	await store.fetchAuditLog();
	isLoading.value = false;
});

const filteredEntries = computed(() => {
	if (selectedAction.value === "all") return store.auditLog;
	return store.auditLog.filter(entry => entry.action === selectedAction.value);
});

function formatTime(timestamp: number) {
	// Shared date-fns/TZDate formatting, so audit timestamps read the same as
	// every other table rather than falling back to the runtime locale.
	return formatMetricDateTime(timestamp);
}

function formatAction(action: string) {
	return action
		.split("_")
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function getActionVariant(action: string): "default" | "destructive" | "outline" | "secondary" {
	if (action.includes("ban") && !action.includes("unban")) {
		return "destructive";
	}
	if (action.includes("unban")) {
		return "default";
	}
	if (action.includes("disconnect")) {
		return "outline";
	}
	return "secondary";
}

async function refresh() {
	isLoading.value = true;
	await store.fetchAuditLog();
	isLoading.value = false;
	toast.success("Audit log refreshed");
}

function formatDetails(details: unknown) {
	if (!details) return null;
	return JSON.stringify(details, null, 2);
}

const { copy } = useClipboard();

function copyToClipboard(text: string) {
	copy(text);
	toast.success("Copied to clipboard");
}

function copyEntryAsJson(entry: {
	id: string;
	timestamp: number;
	action: string;
	userId: string;
	details?: unknown;
}) {
	const json = JSON.stringify(entry, null, 2);
	copy(json);
	toast.success("Entry copied as JSON");
}
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div
			v-motion
			:initial="{ opacity: 0, y: -10 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
			class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
			data-tour-guide="audit-header"
		>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Audit Log</h1>
				<p class="text-muted-foreground">Track administrative actions</p>
			</div>
			<Button @click="refresh">
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
		</div>

		<!-- Filter -->
		<div
			v-motion
			:initial="{ opacity: 0, y: -8 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300, delay: 100 } }"
			class="mb-6 flex items-center gap-4"
			data-tour-guide="audit-filters"
		>
			<Filter class="h-5 w-5 text-muted-foreground" />
			<Select v-model="selectedAction">
				<SelectTrigger class="w-[200px]">
					<SelectValue placeholder="Filter by action" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem v-for="action in actionTypes" :key="action.value" :value="action.value">
						{{ action.label }}
					</SelectItem>
				</SelectContent>
			</Select>
		</div>

		<!-- Audit log table -->
		<div
			v-motion
			:initial="{ opacity: 0, y: 12 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 350, delay: 150 } }"
			data-tour-guide="audit-list"
		>
			<DataTable
				:data="filteredEntries"
				:columns="columns"
				:page-size="15"
				item-label="entry"
				item-label-plural="entries"
				empty-message="No audit entries found"
			>
				<!-- Each row keeps its context menu and tooltips. -->
				<template #row="{ row: entry, index }">
					<ContextMenu>
									<ContextMenuTrigger as-child>
										<TableRow
											v-motion
											:initial="{ opacity: 0, x: -10 }"
											:visible-once="{ opacity: 1, x: 0, transition: { duration: 250, delay: index * 40 } }"
											class="cursor-context-menu"
										>
											<TableCell class="text-muted-foreground whitespace-nowrap">
												{{ formatTime(entry.timestamp) }}
											</TableCell>
											<TableCell>
												<Badge :variant="getActionVariant(entry.action)">
													{{ formatAction(entry.action) }}
												</Badge>
											</TableCell>
											<TableCell class="font-mono text-sm hidden sm:table-cell">
												{{ entry.userId }}
											</TableCell>
											<TableCell class="hidden md:table-cell">
												<TooltipProvider v-if="entry.details">
													<Tooltip>
														<TooltipTrigger as-child>
															<code class="text-xs bg-muted px-2 py-1 rounded cursor-help max-w-[200px] truncate block">
																{{ JSON.stringify(entry.details) }}
															</code>
														</TooltipTrigger>
														<TooltipContent side="bottom" class="max-w-md">
															<pre class="text-xs">{{ formatDetails(entry.details) }}</pre>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
												<span v-else class="text-muted-foreground">-</span>
											</TableCell>
										</TableRow>
									</ContextMenuTrigger>
									<ContextMenuContent>
										<ContextMenuItem @click="copyToClipboard(entry.userId)">
											<Copy class="h-4 w-4" />
											Copy User ID
										</ContextMenuItem>
										<ContextMenuItem @click="copyToClipboard(entry.action)">
											<Copy class="h-4 w-4" />
											Copy Action
										</ContextMenuItem>
										<ContextMenuSeparator />
										<ContextMenuItem @click="copyEntryAsJson(entry)">
											<Copy class="h-4 w-4" />
											Copy Entry as JSON
										</ContextMenuItem>
									</ContextMenuContent>
					</ContextMenu>
				</template>
			</DataTable>
		</div>
	</div>
</template>
