<script setup lang="ts">
import { Ban, Copy, ExternalLink, MoreHorizontal, RefreshCw, Search, UserX } from "lucide-vue-next";
import { toast } from "vue-sonner";
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
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const store = useAdminStore();
const breadcrumbItems = [{ label: "Clients" }];
const searchQuery = ref("");
const isLoading = ref(false);

// Disconnect dialog state
const disconnectDialogOpen = ref(false);
const clientToDisconnect = ref<string | null>(null);

// Ban dialog state
const banDialogOpen = ref(false);
const clientToBan = ref<string | null>(null);
const banReason = ref("");

// Fetch clients on mount
onMounted(async () => {
	isLoading.value = true;
	await store.fetchClients();
	isLoading.value = false;
});

// Pagination
const currentPage = ref(1);
const itemsPerPage = ref(10);

const filteredClients = computed(() => {
	if (!searchQuery.value) return store.clients;
	const query = searchQuery.value.toLowerCase();
	return store.clients.filter(client => client.id.toLowerCase().includes(query));
});

const totalPages = computed(() => Math.ceil(filteredClients.value.length / itemsPerPage.value));

const paginatedClients = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredClients.value.slice(start, end);
});

// Reset to first page when search changes
watch(searchQuery, () => {
	currentPage.value = 1;
});

function openDisconnectDialog(id: string) {
	clientToDisconnect.value = id;
	disconnectDialogOpen.value = true;
}

async function confirmDisconnect() {
	if (clientToDisconnect.value) {
		await store.disconnectClient(clientToDisconnect.value);
		toast.success("Client disconnected successfully");
		disconnectDialogOpen.value = false;
		clientToDisconnect.value = null;
	}
}

function openBanDialog(id: string) {
	clientToBan.value = id;
	banReason.value = "";
	banDialogOpen.value = true;
}

async function confirmBan() {
	if (clientToBan.value) {
		await store.banClient(clientToBan.value, banReason.value || undefined);
		toast.success("Client banned successfully");
		banDialogOpen.value = false;
		clientToBan.value = null;
		banReason.value = "";
	}
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

async function refresh() {
	isLoading.value = true;
	await store.fetchClients();
	isLoading.value = false;
	toast.success("Clients refreshed");
}

const { copy } = useClipboard();

function copyClientId(id: string) {
	copy(id);
	toast.success("Client ID copied to clipboard");
}

const router = useRouter();

function navigateToClient(id: string) {
	router.push(`/clients/${id}`);
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
			data-tour-guide="clients-header"
		>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Clients</h1>
				<p class="text-muted-foreground">Manage connected clients</p>
			</div>
			<Button @click="refresh">
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
		</div>

		<!-- Search -->
		<div
			v-motion
			:initial="{ opacity: 0, y: -8 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300, delay: 100 } }"
			class="mb-6"
			data-tour-guide="clients-search"
		>
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
		<Card
			v-motion
			:initial="{ opacity: 0, y: 12 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 350, delay: 150 } }"
			data-tour-guide="clients-list"
		>
			<div class="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Client ID</TableHead>
							<TableHead>Status</TableHead>
							<TableHead class="hidden sm:table-cell">Connected At</TableHead>
							<TableHead class="hidden md:table-cell">Messages</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<!-- Loading state -->
						<template v-if="isLoading">
							<TableRow v-for="i in 5" :key="i">
								<TableCell><Skeleton class="h-4 w-32" /></TableCell>
								<TableCell><Skeleton class="h-5 w-20" /></TableCell>
								<TableCell class="hidden sm:table-cell"><Skeleton class="h-4 w-28" /></TableCell>
								<TableCell class="hidden md:table-cell"><Skeleton class="h-4 w-16" /></TableCell>
								<TableCell class="text-right"><Skeleton class="h-8 w-8 ml-auto" /></TableCell>
							</TableRow>
						</template>

						<!-- Data -->
						<template v-else>
							<ContextMenu v-for="(client, index) in paginatedClients" :key="client.id">
								<ContextMenuTrigger as-child>
									<TableRow
										v-motion
										:initial="{ opacity: 0, x: -10 }"
										:visible-once="{ opacity: 1, x: 0, transition: { duration: 250, delay: index * 50 } }"
										class="cursor-context-menu"
									>
										<TableCell>
											<NuxtLink
												:to="`/clients/${client.id}`"
												class="text-primary hover:underline font-mono text-sm"
											>
												{{ client.id }}
											</NuxtLink>
										</TableCell>
										<TableCell>
											<Badge :variant="client.connected ? 'default' : 'secondary'">
												{{ client.connected ? "Connected" : "Disconnected" }}
											</Badge>
										</TableCell>
										<TableCell class="text-muted-foreground hidden sm:table-cell">
											{{ formatTime(client.connectedAt) }}
										</TableCell>
										<TableCell class="text-muted-foreground hidden md:table-cell">
											{{ client.messagesReceived }} / {{ client.messagesSent }}
										</TableCell>
										<TableCell class="text-right" data-tour-guide="client-actions">
											<DropdownMenu>
												<DropdownMenuTrigger as-child>
													<Button variant="ghost" size="icon-sm">
														<MoreHorizontal class="h-4 w-4" />
														<span class="sr-only">Actions</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem as-child>
														<NuxtLink :to="`/clients/${client.id}`">
															View Details
														</NuxtLink>
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														variant="destructive"
														@click="openDisconnectDialog(client.id)"
													>
														<UserX class="h-4 w-4" />
														Disconnect
													</DropdownMenuItem>
													<DropdownMenuItem
														variant="destructive"
														@click="openBanDialog(client.id)"
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
									<ContextMenuItem @click="navigateToClient(client.id)">
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
										@click="openDisconnectDialog(client.id)"
									>
										<UserX class="h-4 w-4" />
										Disconnect
									</ContextMenuItem>
									<ContextMenuItem
										variant="destructive"
										@click="openBanDialog(client.id)"
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
			</div>

			<!-- Pagination -->
			<div
				v-if="totalPages > 1"
				v-motion
				:initial="{ opacity: 0 }"
				:enter="{ opacity: 1, transition: { duration: 300, delay: 200 } }"
				class="flex flex-col sm:flex-row items-center justify-between border-t px-4 py-3 gap-3"
			>
				<p class="text-sm text-muted-foreground">
					Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to
					{{ Math.min(currentPage * itemsPerPage, filteredClients.length) }}
					of {{ filteredClients.length }} clients
				</p>
				<Pagination
					v-model:page="currentPage"
					:total="filteredClients.length"
					:items-per-page="itemsPerPage"
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

		<!-- Disconnect Confirmation Dialog -->
		<AlertDialog v-model:open="disconnectDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect Client</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to disconnect client
						<span class="font-mono font-medium">{{ clientToDisconnect }}</span>?
						This will terminate their connection immediately.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction @click="confirmDisconnect">
						Disconnect
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>

		<!-- Ban Dialog -->
		<Dialog v-model:open="banDialogOpen">
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ban Client</DialogTitle>
					<DialogDescription>
						Ban client <span class="font-mono font-medium">{{ clientToBan }}</span> from the server.
					</DialogDescription>
				</DialogHeader>
				<div class="py-4">
					<Label for="banReason">Reason (optional)</Label>
					<Input
						id="banReason"
						v-model="banReason"
						placeholder="Enter ban reason..."
						class="mt-2"
					/>
				</div>
				<DialogFooter>
					<DialogClose as-child>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button variant="destructive" @click="confirmBan">
						Ban Client
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
