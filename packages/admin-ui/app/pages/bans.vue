<script setup lang="ts">
import { Ban, Copy, Globe, RefreshCw, Search, ShieldOff, User } from "lucide-vue-next";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const store = useAdminStore();
const api = useAdminApi();
const breadcrumbItems = [{ label: "Bans" }];

const searchQuery = ref("");
const filterType = ref("all");
const isLoading = ref(false);

// Pagination
const currentPage = ref(1);
const itemsPerPage = ref(15);

// Ban IP dialog
const banIpDialogOpen = ref(false);
const banIpAddress = ref("");
const banIpReason = ref("");
const isBanning = ref(false);

// Ban client dialog
const banClientDialogOpen = ref(false);
const banClientId = ref("");
const banClientReason = ref("");

// Unban dialog
const unbanDialogOpen = ref(false);
const banToRemove = ref<{ id: string; type: "client" | "ip" } | null>(null);

onMounted(async () => {
	isLoading.value = true;
	await store.fetchBans();
	isLoading.value = false;
});

const filteredBans = computed(() => {
	let bans = store.bans;

	// Filter by type
	if (filterType.value !== "all") {
		bans = bans.filter(ban => ban.type === filterType.value);
	}

	// Filter by search
	if (searchQuery.value) {
		const query = searchQuery.value.toLowerCase();
		bans = bans.filter(
			ban => ban.id.toLowerCase().includes(query) || ban.reason?.toLowerCase().includes(query)
		);
	}

	return bans;
});

const totalPages = computed(() => Math.ceil(filteredBans.value.length / itemsPerPage.value));

const paginatedBans = computed(() => {
	const start = (currentPage.value - 1) * itemsPerPage.value;
	const end = start + itemsPerPage.value;
	return filteredBans.value.slice(start, end);
});

// Stats
const totalBans = computed(() => store.bans.length);
const clientBans = computed(() => store.bans.filter(b => b.type === "client").length);
const ipBans = computed(() => store.bans.filter(b => b.type === "ip").length);

// Reset to first page when filter changes
watch([searchQuery, filterType], () => {
	currentPage.value = 1;
});

async function refresh() {
	isLoading.value = true;
	await store.fetchBans();
	isLoading.value = false;
	toast.success("Bans refreshed");
}

function openUnbanDialog(id: string, type: "client" | "ip") {
	banToRemove.value = { id, type };
	unbanDialogOpen.value = true;
}

async function confirmUnban() {
	if (!banToRemove.value) return;

	try {
		if (banToRemove.value.type === "client") {
			await api.unbanClient(banToRemove.value.id);
		} else {
			await api.unbanIP(banToRemove.value.id);
		}
		await store.fetchBans();
		toast.success(`${banToRemove.value.type === "client" ? "Client" : "IP"} unbanned`);
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Failed to unban";
		toast.error(msg);
	} finally {
		unbanDialogOpen.value = false;
		banToRemove.value = null;
	}
}

async function confirmBanIp() {
	if (!banIpAddress.value.trim()) {
		toast.error("IP address is required");
		return;
	}

	isBanning.value = true;
	try {
		await api.banIP(banIpAddress.value.trim(), banIpReason.value || undefined);
		await store.fetchBans();
		toast.success(`IP ${banIpAddress.value} banned`);
		banIpDialogOpen.value = false;
		banIpAddress.value = "";
		banIpReason.value = "";
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Failed to ban IP";
		toast.error(msg);
	} finally {
		isBanning.value = false;
	}
}

async function confirmBanClient() {
	if (!banClientId.value.trim()) {
		toast.error("Client ID is required");
		return;
	}

	isBanning.value = true;
	try {
		await api.banClient(banClientId.value.trim(), banClientReason.value || undefined);
		await store.fetchBans();
		toast.success(`Client ${banClientId.value} banned`);
		banClientDialogOpen.value = false;
		banClientId.value = "";
		banClientReason.value = "";
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Failed to ban client";
		toast.error(msg);
	} finally {
		isBanning.value = false;
	}
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp: number) {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ago`;
	if (hours > 0) return `${hours}h ago`;
	if (minutes > 0) return `${minutes}m ago`;
	return "just now";
}

const { copy } = useClipboard();

function copyToClipboard(text: string) {
	copy(text);
	toast.success("Copied to clipboard");
}

function copyBanAsJson(ban: { id: string; type: string; reason?: string; bannedAt: number }) {
	copy(JSON.stringify(ban, null, 2));
	toast.success("Ban entry copied as JSON");
}

// Stats cards for staggered animation
const statsCards = computed(() => [
	{
		key: "total",
		label: "Total Bans",
		value: totalBans.value,
		icon: Ban,
		iconBg: "bg-red-100 dark:bg-red-900/30",
		iconColor: "text-red-600 dark:text-red-400",
	},
	{
		key: "clients",
		label: "Client Bans",
		value: clientBans.value,
		icon: User,
		iconBg: "bg-orange-100 dark:bg-orange-900/30",
		iconColor: "text-orange-600 dark:text-orange-400",
	},
	{
		key: "ips",
		label: "IP Bans",
		value: ipBans.value,
		icon: Globe,
		iconBg: "bg-purple-100 dark:bg-purple-900/30",
		iconColor: "text-purple-600 dark:text-purple-400",
	},
]);
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div
			v-motion
			:initial="{ opacity: 0, y: -10 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
			class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
			data-tour-guide="bans-header"
		>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Bans</h1>
				<p class="text-muted-foreground">Manage client and IP bans</p>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" @click="banClientDialogOpen = true">
					<User class="h-4 w-4" />
					Ban Client
				</Button>
				<Button variant="outline" @click="banIpDialogOpen = true">
					<Globe class="h-4 w-4" />
					Ban IP
				</Button>
				<Button @click="refresh">
					<RefreshCw class="h-4 w-4" />
					Refresh
				</Button>
			</div>
		</div>

		<!-- Stats -->
		<div
			v-motion
			:initial="{ opacity: 0, y: -8 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300, delay: 50 } }"
			class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
		>
			<Card
				v-for="(card, index) in statsCards"
				:key="card.key"
				v-motion
				:initial="{ opacity: 0, y: 12 }"
				:visible-once="{ opacity: 1, y: 0, transition: { duration: 300, delay: index * 75 } }"
				class="p-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm text-muted-foreground">{{ card.label }}</p>
						<p class="text-2xl font-bold mt-1">{{ card.value }}</p>
					</div>
					<div class="p-2 rounded-lg" :class="card.iconBg">
						<component :is="card.icon" class="h-5 w-5" :class="card.iconColor" />
					</div>
				</div>
			</Card>
		</div>

		<!-- Search & Filter -->
		<div
			v-motion
			:initial="{ opacity: 0, y: -8 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300, delay: 100 } }"
			class="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
			data-tour-guide="bans-filters"
		>
			<div class="relative flex-1 max-w-sm">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					v-model="searchQuery"
					type="text"
					placeholder="Search by ID or reason..."
					class="pl-9"
				/>
			</div>
			<Select v-model="filterType">
				<SelectTrigger class="w-[160px]">
					<SelectValue placeholder="Filter by type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Types</SelectItem>
					<SelectItem value="client">Client Bans</SelectItem>
					<SelectItem value="ip">IP Bans</SelectItem>
				</SelectContent>
			</Select>
		</div>

		<!-- Bans table -->
		<Card
			v-motion
			:initial="{ opacity: 0, y: 12 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 350, delay: 150 } }"
			data-tour-guide="bans-list"
		>
			<div class="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>ID</TableHead>
							<TableHead>Type</TableHead>
							<TableHead class="hidden sm:table-cell">Reason</TableHead>
							<TableHead class="hidden md:table-cell">Banned At</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<!-- Loading state -->
						<template v-if="isLoading">
							<TableRow v-for="i in 5" :key="i">
								<TableCell><Skeleton class="h-4 w-32" /></TableCell>
								<TableCell><Skeleton class="h-5 w-16" /></TableCell>
								<TableCell class="hidden sm:table-cell"><Skeleton class="h-4 w-40" /></TableCell>
								<TableCell class="hidden md:table-cell"><Skeleton class="h-4 w-28" /></TableCell>
								<TableCell class="text-right"><Skeleton class="h-8 w-20 ml-auto" /></TableCell>
							</TableRow>
						</template>

						<!-- Data -->
						<template v-else>
							<ContextMenu v-for="(ban, index) in paginatedBans" :key="`${ban.type}-${ban.id}`">
								<ContextMenuTrigger as-child>
									<TableRow
										v-motion
										:initial="{ opacity: 0, x: -10 }"
										:visible-once="{ opacity: 1, x: 0, transition: { duration: 250, delay: index * 40 } }"
										class="cursor-context-menu"
									>
										<TableCell class="font-mono text-sm">
											{{ ban.id }}
										</TableCell>
										<TableCell>
											<Badge :variant="ban.type === 'ip' ? 'destructive' : 'outline'">
												<component
													:is="ban.type === 'ip' ? Globe : User"
													class="h-3 w-3 mr-1"
												/>
												{{ ban.type === "ip" ? "IP" : "Client" }}
											</Badge>
										</TableCell>
										<TableCell class="hidden sm:table-cell">
											<TooltipProvider v-if="ban.reason">
												<Tooltip>
													<TooltipTrigger as-child>
														<span class="text-muted-foreground max-w-[200px] truncate block">
															{{ ban.reason }}
														</span>
													</TooltipTrigger>
													<TooltipContent side="bottom" class="max-w-sm">
														{{ ban.reason }}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
											<span v-else class="text-muted-foreground">-</span>
										</TableCell>
										<TableCell class="hidden md:table-cell">
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger as-child>
														<span class="text-muted-foreground">
															{{ formatRelativeTime(ban.bannedAt) }}
														</span>
													</TooltipTrigger>
													<TooltipContent>
														{{ formatTime(ban.bannedAt) }}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</TableCell>
										<TableCell class="text-right">
											<Button
												variant="ghost"
												size="sm"
												class="text-destructive hover:text-destructive"
												@click="openUnbanDialog(ban.id, ban.type)"
											>
												<ShieldOff class="h-4 w-4" />
												Unban
											</Button>
										</TableCell>
									</TableRow>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem @click="copyToClipboard(ban.id)">
										<Copy class="h-4 w-4" />
										Copy {{ ban.type === "ip" ? "IP Address" : "Client ID" }}
									</ContextMenuItem>
									<ContextMenuItem v-if="ban.reason" @click="copyToClipboard(ban.reason)">
										<Copy class="h-4 w-4" />
										Copy Reason
									</ContextMenuItem>
									<ContextMenuSeparator />
									<ContextMenuItem @click="copyBanAsJson(ban)">
										<Copy class="h-4 w-4" />
										Copy as JSON
									</ContextMenuItem>
									<ContextMenuSeparator />
									<ContextMenuItem
										variant="destructive"
										@click="openUnbanDialog(ban.id, ban.type)"
									>
										<ShieldOff class="h-4 w-4" />
										Unban
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>

							<TableEmpty v-if="filteredBans.length === 0" :colspan="5">
								No bans found
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
					{{ Math.min(currentPage * itemsPerPage, filteredBans.length) }}
					of {{ filteredBans.length }} bans
				</p>
				<Pagination
					v-model:page="currentPage"
					:total="filteredBans.length"
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

		<!-- Ban IP Dialog -->
		<Dialog v-model:open="banIpDialogOpen">
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ban IP Address</DialogTitle>
					<DialogDescription>
						Ban an IP address from connecting to the server.
					</DialogDescription>
				</DialogHeader>
				<form class="space-y-4 py-4" @submit.prevent="confirmBanIp">
					<div class="space-y-2">
						<Label for="banIpAddress">IP Address</Label>
						<div class="relative">
							<Globe class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="banIpAddress"
								v-model="banIpAddress"
								placeholder="e.g., 192.168.1.100"
								class="pl-9"
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="banIpReason">Reason (optional)</Label>
						<Input
							id="banIpReason"
							v-model="banIpReason"
							placeholder="Enter ban reason..."
						/>
					</div>
					<DialogFooter>
						<DialogClose as-child>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button type="submit" variant="destructive" :disabled="isBanning">
							<Ban class="h-4 w-4" />
							{{ isBanning ? "Banning..." : "Ban IP" }}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>

		<!-- Ban Client Dialog -->
		<Dialog v-model:open="banClientDialogOpen">
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ban Client</DialogTitle>
					<DialogDescription>
						Ban a client by their ID from connecting to the server.
					</DialogDescription>
				</DialogHeader>
				<form class="space-y-4 py-4" @submit.prevent="confirmBanClient">
					<div class="space-y-2">
						<Label for="banClientId">Client ID</Label>
						<div class="relative">
							<User class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="banClientId"
								v-model="banClientId"
								placeholder="Enter client ID..."
								class="pl-9"
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="banClientReason">Reason (optional)</Label>
						<Input
							id="banClientReason"
							v-model="banClientReason"
							placeholder="Enter ban reason..."
						/>
					</div>
					<DialogFooter>
						<DialogClose as-child>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button type="submit" variant="destructive" :disabled="isBanning">
							<Ban class="h-4 w-4" />
							{{ isBanning ? "Banning..." : "Ban Client" }}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>

		<!-- Unban Confirmation Dialog -->
		<AlertDialog v-model:open="unbanDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove Ban</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to unban
						<span class="font-mono font-medium">{{ banToRemove?.id }}</span>?
						This {{ banToRemove?.type === "ip" ? "IP address" : "client" }} will be able to connect again.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction @click="confirmUnban">
						Unban
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</div>
</template>
