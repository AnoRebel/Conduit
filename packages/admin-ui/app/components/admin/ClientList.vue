<script setup lang="ts">
import { Ban, Copy, ExternalLink, MoreHorizontal, Search, UserX } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Pagination,
	PaginationContent,
	PaginationFirst,
	PaginationLast,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
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

export interface ClientInfo {
	id: string;
	connected: boolean;
	connectedAt: number;
	messagesReceived: number;
	messagesSent: number;
}

const props = defineProps<{
	clients: ClientInfo[];
	loading?: boolean;
	itemsPerPage?: number;
}>();

const emit = defineEmits<{
	disconnect: [id: string];
	ban: [id: string];
	select: [id: string];
}>();

const searchQuery = ref("");
const currentPage = ref(1);
const perPage = computed(() => props.itemsPerPage ?? 10);

const filteredClients = computed(() => {
	if (!searchQuery.value) return props.clients;
	const query = searchQuery.value.toLowerCase();
	return props.clients.filter(client => client.id.toLowerCase().includes(query));
});

const totalPages = computed(() => Math.ceil(filteredClients.value.length / perPage.value));

const paginatedClients = computed(() => {
	const start = (currentPage.value - 1) * perPage.value;
	const end = start + perPage.value;
	return filteredClients.value.slice(start, end);
});

// Reset to first page when search changes
watch(searchQuery, () => {
	currentPage.value = 1;
});

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

const { copy } = useClipboard();

function copyClientId(id: string) {
	copy(id);
}
</script>

<template>
	<div>
		<!-- Search -->
		<div class="mb-6">
			<div class="relative max-w-sm">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					v-model="searchQuery"
					type="text"
					placeholder="Search by client ID..."
					class="pl-9"
				/>
			</div>
		</div>

		<!-- Clients table -->
		<Card>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Client ID</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Connected At</TableHead>
						<TableHead>Messages</TableHead>
						<TableHead class="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- Loading state -->
					<template v-if="loading">
						<TableRow v-for="i in 5" :key="i">
							<TableCell><Skeleton class="h-4 w-32" /></TableCell>
							<TableCell><Skeleton class="h-5 w-20" /></TableCell>
							<TableCell><Skeleton class="h-4 w-28" /></TableCell>
							<TableCell><Skeleton class="h-4 w-16" /></TableCell>
							<TableCell class="text-right"><Skeleton class="h-8 w-8 ml-auto" /></TableCell>
						</TableRow>
					</template>

					<!-- Data -->
					<template v-else>
						<ContextMenu v-for="client in paginatedClients" :key="client.id">
							<ContextMenuTrigger as-child>
								<TableRow class="cursor-context-menu">
									<TableCell>
										<button
											class="text-primary hover:underline font-mono text-sm text-left"
											@click="emit('select', client.id)"
										>
											{{ client.id }}
										</button>
									</TableCell>
									<TableCell>
										<Badge :variant="client.connected ? 'default' : 'secondary'">
											{{ client.connected ? "Connected" : "Disconnected" }}
										</Badge>
									</TableCell>
									<TableCell class="text-muted-foreground">
										{{ formatTime(client.connectedAt) }}
									</TableCell>
									<TableCell class="text-muted-foreground">
										{{ client.messagesReceived }} / {{ client.messagesSent }}
									</TableCell>
									<TableCell class="text-right">
										<DropdownMenu>
											<DropdownMenuTrigger as-child>
												<Button variant="ghost" size="icon-sm">
													<MoreHorizontal class="h-4 w-4" />
													<span class="sr-only">Actions</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem @click="emit('select', client.id)">
													<ExternalLink class="h-4 w-4" />
													View Details
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant="destructive"
													@click="emit('disconnect', client.id)"
												>
													<UserX class="h-4 w-4" />
													Disconnect
												</DropdownMenuItem>
												<DropdownMenuItem
													variant="destructive"
													@click="emit('ban', client.id)"
												>
													<Ban class="h-4 w-4" />
													Ban Client
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem @click="emit('select', client.id)">
									<ExternalLink class="h-4 w-4" />
									View Details
								</ContextMenuItem>
								<ContextMenuItem @click="copyClientId(client.id)">
									<Copy class="h-4 w-4" />
									Copy Client ID
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									variant="destructive"
									@click="emit('disconnect', client.id)"
								>
									<UserX class="h-4 w-4" />
									Disconnect
								</ContextMenuItem>
								<ContextMenuItem
									variant="destructive"
									@click="emit('ban', client.id)"
								>
									<Ban class="h-4 w-4" />
									Ban Client
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>

						<TableEmpty v-if="filteredClients.length === 0" :colspan="5">
							No clients found
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
					{{ Math.min(currentPage * perPage, filteredClients.length) }}
					of {{ filteredClients.length }} clients
				</p>
				<Pagination
					v-model:page="currentPage"
					:total="filteredClients.length"
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
