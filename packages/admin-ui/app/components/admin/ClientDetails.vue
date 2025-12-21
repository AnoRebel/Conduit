<script setup lang="ts">
import { Ban, Clock, Copy, Globe, MessageSquare, MoreHorizontal, UserX } from "lucide-vue-next";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export interface ClientInfo {
	id: string;
	connected: boolean;
	connectedAt: number;
	lastActivity: number;
	messagesReceived: number;
	messagesSent: number;
	queuedMessages: number;
	ip?: string;
	userAgent?: string;
}

const props = defineProps<{
	client: ClientInfo | null;
	loading?: boolean;
}>();

const emit = defineEmits<{
	disconnect: [];
	ban: [];
}>();

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
}

function copyClientAsJson() {
	if (props.client) {
		copy(JSON.stringify(props.client, null, 2));
	}
}
</script>

<template>
	<!-- Loading state -->
	<template v-if="loading">
		<div class="grid gap-6 md:grid-cols-2">
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
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-muted-foreground">Client not found or has disconnected.</p>
			</CardContent>
		</Card>
	</template>

	<!-- Client details -->
	<template v-else>
		<!-- Actions header -->
		<div class="flex items-center justify-end gap-2 mb-6">
			<DropdownMenu>
				<DropdownMenuTrigger as-child>
					<Button variant="outline" size="icon">
						<MoreHorizontal class="h-4 w-4" />
						<span class="sr-only">Actions</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem @click="copyToClipboard(client.id)">
						<Copy class="h-4 w-4" />
						Copy Client ID
					</DropdownMenuItem>
					<DropdownMenuItem @click="copyClientAsJson">
						<Copy class="h-4 w-4" />
						Copy as JSON
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" @click="emit('disconnect')">
						<UserX class="h-4 w-4" />
						Disconnect
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" @click="emit('ban')">
						<Ban class="h-4 w-4" />
						Ban Client
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>

		<ContextMenu>
			<ContextMenuTrigger as-child>
				<div class="grid gap-6 md:grid-cols-2 cursor-context-menu">
					<!-- Connection Info -->
					<Card>
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
					<Card>
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
					<Card v-if="client.userAgent" class="md:col-span-2">
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
				<ContextMenuItem @click="copyToClipboard(client.id)">
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
				<ContextMenuItem variant="destructive" @click="emit('disconnect')">
					<UserX class="h-4 w-4" />
					Disconnect
				</ContextMenuItem>
				<ContextMenuItem variant="destructive" @click="emit('ban')">
					<Ban class="h-4 w-4" />
					Ban Client
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	</template>
</template>
