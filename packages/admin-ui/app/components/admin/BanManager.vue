<script setup lang="ts">
import { Copy, Network, ShieldOff, Trash2, User } from "lucide-vue-next";
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

export interface BanEntry {
	id: string;
	type: "client" | "ip";
	reason?: string;
	createdAt: number;
	expiresAt?: number;
}

const props = defineProps<{
	bans: BanEntry[];
	loading?: boolean;
}>();

const emit = defineEmits<{
	unban: [id: string, type: "client" | "ip"];
}>();

const unbanDialogOpen = ref(false);
const banToRemove = ref<BanEntry | null>(null);

function openUnbanDialog(ban: BanEntry) {
	banToRemove.value = ban;
	unbanDialogOpen.value = true;
}

function confirmUnban() {
	if (banToRemove.value) {
		emit("unban", banToRemove.value.id, banToRemove.value.type);
		unbanDialogOpen.value = false;
		banToRemove.value = null;
	}
}

function formatTime(timestamp: number) {
	return new Date(timestamp).toLocaleString();
}

const { copy } = useClipboard();

function copyBanId(id: string) {
	copy(id);
}

function copyBanAsJson(ban: BanEntry) {
	copy(JSON.stringify(ban, null, 2));
}
</script>

<template>
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<ShieldOff class="h-5 w-5" />
				Ban List
			</CardTitle>
			<CardDescription>
				Manage banned clients and IP addresses
			</CardDescription>
		</CardHeader>
		<CardContent>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Type</TableHead>
						<TableHead>ID / IP</TableHead>
						<TableHead>Reason</TableHead>
						<TableHead>Created</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead class="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<!-- Loading state -->
					<template v-if="loading">
						<TableRow v-for="i in 3" :key="i">
							<TableCell><Skeleton class="h-5 w-16" /></TableCell>
							<TableCell><Skeleton class="h-4 w-32" /></TableCell>
							<TableCell><Skeleton class="h-4 w-24" /></TableCell>
							<TableCell><Skeleton class="h-4 w-28" /></TableCell>
							<TableCell><Skeleton class="h-4 w-28" /></TableCell>
							<TableCell class="text-right"><Skeleton class="h-8 w-8 ml-auto" /></TableCell>
						</TableRow>
					</template>

					<!-- Data -->
					<template v-else>
						<ContextMenu v-for="ban in bans" :key="`${ban.type}-${ban.id}`">
							<ContextMenuTrigger as-child>
								<TableRow class="cursor-context-menu">
									<TableCell>
										<Badge :variant="ban.type === 'ip' ? 'secondary' : 'outline'">
											<User v-if="ban.type === 'client'" class="h-3 w-3" />
											<Network v-else class="h-3 w-3" />
											{{ ban.type === "client" ? "Client" : "IP" }}
										</Badge>
									</TableCell>
									<TableCell class="font-mono text-sm">
										{{ ban.id }}
									</TableCell>
									<TableCell class="text-muted-foreground">
										{{ ban.reason || "-" }}
									</TableCell>
									<TableCell class="text-muted-foreground whitespace-nowrap">
										{{ formatTime(ban.createdAt) }}
									</TableCell>
									<TableCell class="text-muted-foreground whitespace-nowrap">
										{{ ban.expiresAt ? formatTime(ban.expiresAt) : "Never" }}
									</TableCell>
									<TableCell class="text-right">
										<Button
											variant="ghost"
											size="icon-sm"
											@click="openUnbanDialog(ban)"
										>
											<Trash2 class="h-4 w-4" />
											<span class="sr-only">Remove ban</span>
										</Button>
									</TableCell>
								</TableRow>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem @click="copyBanId(ban.id)">
									<Copy class="h-4 w-4" />
									Copy {{ ban.type === "client" ? "Client ID" : "IP Address" }}
								</ContextMenuItem>
								<ContextMenuItem @click="copyBanAsJson(ban)">
									<Copy class="h-4 w-4" />
									Copy as JSON
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem variant="destructive" @click="openUnbanDialog(ban)">
									<Trash2 class="h-4 w-4" />
									Remove Ban
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>

						<TableEmpty v-if="bans.length === 0" :colspan="6">
							No active bans
						</TableEmpty>
					</template>
				</TableBody>
			</Table>
		</CardContent>
	</Card>

	<!-- Unban Confirmation Dialog -->
	<AlertDialog v-model:open="unbanDialogOpen">
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>Remove Ban</AlertDialogTitle>
				<AlertDialogDescription>
					Are you sure you want to remove the ban for
					<span class="font-mono font-medium">{{ banToRemove?.id }}</span>?
					This will allow them to connect again.
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction @click="confirmUnban">
					Remove Ban
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
</template>
