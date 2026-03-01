<script setup lang="ts">
import { Copy, Filter } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Pagination,
	PaginationContent,
	PaginationFirst,
	PaginationLast,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface AuditEntry {
	id: string;
	timestamp: number;
	action: string;
	userId: string;
	details?: unknown;
}

const props = defineProps<{
	entries: AuditEntry[];
	loading?: boolean;
	itemsPerPage?: number;
}>();

const selectedAction = ref("all");
const currentPage = ref(1);
const perPage = computed(() => props.itemsPerPage ?? 15);

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

const filteredEntries = computed(() => {
	if (selectedAction.value === "all") return props.entries;
	return props.entries.filter(entry => entry.action === selectedAction.value);
});

const totalPages = computed(() => Math.ceil(filteredEntries.value.length / perPage.value));

const paginatedEntries = computed(() => {
	const start = (currentPage.value - 1) * perPage.value;
	const end = start + perPage.value;
	return filteredEntries.value.slice(start, end);
});

// Reset to first page when filter changes
watch(selectedAction, () => {
	currentPage.value = 1;
});

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
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

function formatDetails(details: unknown) {
	if (!details) return null;
	return JSON.stringify(details, null, 2);
}

const { copy } = useClipboard();

function copyToClipboard(text: string) {
	copy(text);
}

function copyEntryAsJson(entry: AuditEntry) {
	copy(JSON.stringify(entry, null, 2));
}
</script>

<template>
	<div>
		<!-- Filter -->
		<div class="mb-6 flex items-center gap-4">
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
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Timestamp</TableHead>
						<TableHead>Action</TableHead>
						<TableHead>User</TableHead>
						<TableHead>Details</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- Loading state -->
					<template v-if="loading">
						<TableRow v-for="i in 5" :key="i">
							<TableCell><Skeleton class="h-4 w-32" /></TableCell>
							<TableCell><Skeleton class="h-5 w-24" /></TableCell>
							<TableCell><Skeleton class="h-4 w-20" /></TableCell>
							<TableCell><Skeleton class="h-4 w-40" /></TableCell>
						</TableRow>
					</template>

					<!-- Data -->
					<template v-else>
						<ContextMenu v-for="entry in paginatedEntries" :key="entry.id">
							<ContextMenuTrigger as-child>
								<TableRow class="cursor-context-menu">
									<TableCell class="text-muted-foreground whitespace-nowrap">
										{{ formatTime(entry.timestamp) }}
									</TableCell>
									<TableCell>
										<Badge :variant="getActionVariant(entry.action)">
											{{ formatAction(entry.action) }}
										</Badge>
									</TableCell>
									<TableCell class="font-mono text-sm">
										{{ entry.userId }}
									</TableCell>
									<TableCell>
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

						<TableEmpty v-if="filteredEntries.length === 0" :colspan="4">
							No audit entries found
						</TableEmpty>
					</template>
				</TableBody>
			</Table>

			<!-- Pagination -->
			<div
				v-if="totalPages > 1"
				class="flex items-center justify-between border-t px-4 py-3"
			>
				<p class="text-sm text-muted-foreground">
					Showing {{ (currentPage - 1) * perPage + 1 }} to
					{{ Math.min(currentPage * perPage, filteredEntries.length) }}
					of {{ filteredEntries.length }} entries
				</p>
				<Pagination
					v-model:page="currentPage"
					:total="filteredEntries.length"
					:items-per-page="perPage"
					:sibling-count="1"
				>
					<PaginationContent>
						<PaginationFirst />
						<PaginationPrevious />
						<PaginationNext />
						<PaginationLast />
					</PaginationContent>
				</Pagination>
			</div>
		</Card>
	</div>
</template>
