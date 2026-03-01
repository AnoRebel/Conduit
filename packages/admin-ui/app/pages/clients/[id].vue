<script setup lang="ts">
import {
	ArrowLeft,
	Ban,
	Clock,
	Copy,
	Globe,
	MessageSquare,
	MoreHorizontal,
	RefreshCw,
	UserX,
} from "lucide-vue-next";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const route = useRoute();
const router = useRouter();
const store = useAdminStore();
const api = useAdminApi();

const clientId = computed(() => route.params.id as string);
const isLoading = ref(true);
const client = ref<{
	id: string;
	connected: boolean;
	connectedAt: number;
	lastActivity: number;
	messagesReceived: number;
	messagesSent: number;
	queuedMessages: number;
	ip?: string;
	userAgent?: string;
} | null>(null);

// Dialog states
const disconnectDialogOpen = ref(false);
const banDialogOpen = ref(false);
const banReason = ref("");

const breadcrumbItems = computed(() => [
	{ label: "Clients", href: "/clients" },
	{ label: clientId.value },
]);

onMounted(async () => {
	await fetchClientDetails();
});

async function fetchClientDetails() {
	isLoading.value = true;
	try {
		const result = await api.getClient(clientId.value);
		client.value = result;
	} catch {
		client.value = null;
		toast.error("Failed to load client details");
	} finally {
		isLoading.value = false;
	}
}

async function confirmDisconnect() {
	await store.disconnectClient(clientId.value);
	toast.success("Client disconnected");
	disconnectDialogOpen.value = false;
	router.push("/clients");
}

async function confirmBan() {
	await store.banClient(clientId.value, banReason.value || undefined);
	toast.success("Client banned");
	banDialogOpen.value = false;
	banReason.value = "";
	router.push("/clients");
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

function formatDuration(ms: number) {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

const { copy } = useClipboard();

function copyToClipboard(text: string) {
	copy(text);
	toast.success("Copied to clipboard");
}

function copyClientAsJson() {
	if (client.value) {
		copy(JSON.stringify(client.value, null, 2));
		toast.success("Client data copied as JSON");
	}
}
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div
			v-motion
			:initial="{ opacity: 0, y: -10 }"
			:enter="{ opacity: 1, y: 0, transition: { duration: 300 } }"
			class="flex items-center justify-between mb-6"
		>
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="icon-sm" @click="router.push('/clients')">
					<ArrowLeft class="h-5 w-5" />
					<span class="sr-only">Back to clients</span>
				</Button>
				<div>
					<h1 class="text-2xl font-bold text-foreground font-mono">{{ clientId }}</h1>
					<p class="text-muted-foreground">Client Details</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" @click="fetchClientDetails">
					<RefreshCw class="h-4 w-4" />
					Refresh
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger as-child>
						<Button variant="outline" size="icon">
							<MoreHorizontal class="h-4 w-4" />
							<span class="sr-only">Actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem @click="copyToClipboard(clientId)">
							<Copy class="h-4 w-4" />
							Copy Client ID
						</DropdownMenuItem>
						<DropdownMenuItem @click="copyClientAsJson">
							<Copy class="h-4 w-4" />
							Copy as JSON
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" @click="disconnectDialogOpen = true">
							<UserX class="h-4 w-4" />
							Disconnect
						</DropdownMenuItem>
						<DropdownMenuItem variant="destructive" @click="banDialogOpen = true">
							<Ban class="h-4 w-4" />
							Ban Client
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		<!-- Loading state -->
		<template v-if="isLoading">
			<div
				v-motion
				:initial="{ opacity: 0 }"
				:enter="{ opacity: 1, transition: { duration: 300 } }"
				class="grid gap-6 md:grid-cols-2"
			>
				<Card>
					<CardHeader>
						<Skeleton class="h-5 w-32" />
						<Skeleton class="h-4 w-48" />
					</CardHeader>
					<CardContent class="space-y-4">
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-4 w-1/2" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<Skeleton class="h-5 w-32" />
						<Skeleton class="h-4 w-48" />
					</CardHeader>
					<CardContent class="space-y-4">
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-3/4" />
					</CardContent>
				</Card>
			</div>
		</template>

		<!-- Not found -->
		<template v-else-if="!client">
			<Card
				v-motion
				:initial="{ opacity: 0, scale: 0.95 }"
				:enter="{ opacity: 1, scale: 1, transition: { duration: 350 } }"
			>
				<CardContent class="py-12 text-center">
					<p class="text-muted-foreground">Client not found or has disconnected.</p>
					<Button variant="outline" class="mt-4" @click="router.push('/clients')">
						Back to Clients
					</Button>
				</CardContent>
			</Card>
		</template>

		<!-- Client details -->
		<template v-else>
			<ContextMenu>
				<ContextMenuTrigger as-child>
					<div
						v-motion
						:initial="{ opacity: 0 }"
						:enter="{ opacity: 1, transition: { duration: 300 } }"
						class="grid gap-6 md:grid-cols-2 cursor-context-menu"
					>
						<!-- Connection Info -->
						<Card
							v-motion
							:initial="{ opacity: 0, y: 16 }"
							:visible-once="{ opacity: 1, y: 0, transition: { duration: 350 } }"
						>
							<CardHeader>
								<CardTitle class="flex items-center gap-2">
									<Globe class="h-5 w-5" />
									Connection Info
								</CardTitle>
								<CardDescription>Current connection status and details</CardDescription>
							</CardHeader>
							<CardContent class="space-y-4">
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Status</span>
									<Badge :variant="client.connected ? 'default' : 'secondary'">
										{{ client.connected ? "Connected" : "Disconnected" }}
									</Badge>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Connected At</span>
									<span class="text-sm">{{ formatTime(client.connectedAt) }}</span>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Session Duration</span>
									<span class="text-sm font-mono">
										{{ formatDuration(Date.now() - client.connectedAt) }}
									</span>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Last Activity</span>
									<span class="text-sm">{{ formatTime(client.lastActivity) }}</span>
								</div>
								<template v-if="client.ip">
									<Separator />
									<div class="flex justify-between items-center">
										<span class="text-muted-foreground">IP Address</span>
										<code class="text-sm bg-muted px-2 py-1 rounded">{{ client.ip }}</code>
									</div>
								</template>
							</CardContent>
						</Card>

						<!-- Message Stats -->
						<Card
							v-motion
							:initial="{ opacity: 0, y: 16 }"
							:visible-once="{ opacity: 1, y: 0, transition: { duration: 350, delay: 100 } }"
						>
							<CardHeader>
								<CardTitle class="flex items-center gap-2">
									<MessageSquare class="h-5 w-5" />
									Message Statistics
								</CardTitle>
								<CardDescription>Messages sent and received by this client</CardDescription>
							</CardHeader>
							<CardContent class="space-y-4">
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Messages Received</span>
									<span class="text-2xl font-semibold">
										{{ client.messagesReceived.toLocaleString() }}
									</span>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Messages Sent</span>
									<span class="text-2xl font-semibold">
										{{ client.messagesSent.toLocaleString() }}
									</span>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Total Messages</span>
									<span class="text-2xl font-semibold">
										{{ (client.messagesReceived + client.messagesSent).toLocaleString() }}
									</span>
								</div>
							</CardContent>
						</Card>

						<!-- Additional Info -->
						<Card
							v-if="client.userAgent"
							v-motion
							:initial="{ opacity: 0, y: 16 }"
							:visible-once="{ opacity: 1, y: 0, transition: { duration: 350, delay: 200 } }"
							class="md:col-span-2"
						>
							<CardHeader>
								<CardTitle class="flex items-center gap-2">
									<Clock class="h-5 w-5" />
									Additional Information
								</CardTitle>
							</CardHeader>
							<CardContent class="space-y-4">
								<div>
									<Label class="text-muted-foreground">User Agent</Label>
									<code class="block mt-1 text-sm bg-muted px-3 py-2 rounded break-all">
										{{ client.userAgent }}
									</code>
								</div>
								<Separator />
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Queued Messages</span>
									<span class="text-xl font-semibold">
										{{ client.queuedMessages }}
									</span>
								</div>
							</CardContent>
						</Card>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem @click="copyToClipboard(clientId)">
						<Copy class="h-4 w-4" />
						Copy Client ID
					</ContextMenuItem>
					<ContextMenuItem v-if="client.ip" @click="copyToClipboard(client.ip)">
						<Copy class="h-4 w-4" />
						Copy IP Address
					</ContextMenuItem>
					<ContextMenuItem @click="copyClientAsJson">
						<Copy class="h-4 w-4" />
						Copy as JSON
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem variant="destructive" @click="disconnectDialogOpen = true">
						<UserX class="h-4 w-4" />
						Disconnect
					</ContextMenuItem>
					<ContextMenuItem variant="destructive" @click="banDialogOpen = true">
						<Ban class="h-4 w-4" />
						Ban Client
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</template>

		<!-- Disconnect Confirmation Dialog -->
		<AlertDialog v-model:open="disconnectDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect Client</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to disconnect client
						<span class="font-mono font-medium">{{ clientId }}</span>?
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
						Ban client <span class="font-mono font-medium">{{ clientId }}</span> from the server.
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
