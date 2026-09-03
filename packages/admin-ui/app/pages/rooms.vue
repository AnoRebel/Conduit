<script setup lang="ts">
import { DoorOpen, Plus, RefreshCw, Search, Trash2, UserPlus, Users } from "lucide-vue-next";
import { h } from "vue";
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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoomSummary } from "~/types";
import type { DataTableColumns } from "~/types/table";

const store = useAdminStore();
const breadcrumbItems = [{ label: "Rooms" }];

const searchQuery = ref("");
const isLoading = ref(false);
const dissolveTarget = ref<string | null>(null);

// Add-members dialog. `addTarget` is the room to add to; null means the dialog
// is naming a new one, which is how a room is brought into existence.
const showAddDialog = ref(false);
const addTarget = ref<string | undefined>(undefined);

function openAddRoom() {
	addTarget.value = undefined;
	showAddDialog.value = true;
}

function openAddToRoom(room: string) {
	addTarget.value = room;
	showAddDialog.value = true;
}

const rooms = computed(() => store.rooms);
const totalMembers = computed(() => rooms.value.reduce((sum, r) => sum + r.members, 0));
const largestRoom = computed(() =>
	rooms.value.reduce((max, r) => (r.members > max ? r.members : max), 0)
);

const statsCards = computed(() => [
	{ key: "rooms", label: "Active Rooms", value: rooms.value.length, icon: DoorOpen },
	{ key: "members", label: "Total Members", value: totalMembers.value, icon: Users },
	{ key: "largest", label: "Largest Room", value: largestRoom.value, icon: Users },
]);

/**
 * Sorting and pagination come from the shared table, so a deployment with
 * thousands of rooms stays navigable without this page implementing either.
 */
const columns: DataTableColumns<RoomSummary> = [
	{
		accessorKey: "name",
		header: "Room",
		cell: ({ row }) =>
			h("div", { class: "flex items-center gap-2 min-w-0" }, [
				h(DoorOpen, { class: "h-4 w-4 text-muted-foreground shrink-0" }),
				h("span", { class: "font-medium truncate" }, row.getValue("name") as string),
			]),
	},
	{
		accessorKey: "members",
		header: "Members",
		cell: ({ row }) => {
			const count = row.getValue("members") as number;
			return h(
				Badge,
				{ variant: "secondary" },
				() => `${count} ${count === 1 ? "member" : "members"}`
			);
		},
	},
	{
		id: "actions",
		header: "",
		enableSorting: false,
		cell: ({ row }) =>
			h("div", { class: "flex items-center justify-end gap-2" }, [
				h(
					Button,
					{
						variant: "outline",
						size: "sm",
						"data-testid": "add-to-room",
						onClick: () => openAddToRoom(row.getValue("name") as string),
					},
					() => [h(UserPlus, { class: "h-4 w-4" }), "Add peers"]
				),
				h(
					Button,
					{
						variant: "destructive",
						size: "sm",
						"data-testid": "dissolve-room",
						onClick: () => {
							dissolveTarget.value = row.getValue("name") as string;
						},
					},
					() => [h(Trash2, { class: "h-4 w-4" }), "Dissolve"]
				),
			]),
	},
];

async function refresh() {
	isLoading.value = true;
	try {
		await store.fetchRooms();
	} finally {
		isLoading.value = false;
	}
}

async function confirmDissolve() {
	const name = dissolveTarget.value;
	if (!name) return;

	const ok = await store.dissolveRoom(name);
	if (ok) {
		toast.success(`Room "${name}" dissolved`);
	} else {
		toast.error(store.error ?? `Failed to dissolve "${name}"`);
	}
	dissolveTarget.value = null;
}

onMounted(() => {
	if (store.rooms.length === 0) {
		void refresh();
	}
});
</script>

<template>
	<div>
		<PageBreadcrumb :items="breadcrumbItems" />

		<div
			class="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4"
			data-tour-guide="rooms-header"
		>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Rooms</h1>
				<p class="text-muted-foreground">Inspect active rooms, add peers, and dissolve them</p>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" data-testid="add-room" @click="openAddRoom">
					<Plus class="h-4 w-4" />
					Add room
				</Button>
				<Button :disabled="isLoading" @click="refresh">
					<RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
					Refresh
				</Button>
			</div>
		</div>

		<!--
			Room data is fetched in the browser, so the server has nothing to render
			and any markup it produced would differ from the client's. Rendering
			this subtree client-side only removes that mismatch rather than
			papering over it.
		-->
		<ClientOnly>
			<template #fallback>
				<div class="space-y-3">
					<Skeleton class="h-24 w-full rounded-lg" />
					<Skeleton class="h-64 w-full rounded-lg" />
				</div>
			</template>

		<!--
			A server without room support hides the section entirely rather than
			showing an error: nothing is wrong, the feature simply is not there.
		-->
		<Empty v-if="!store.roomsAvailable" class="py-12" data-testid="rooms-unavailable">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<DoorOpen />
				</EmptyMedia>
				<EmptyTitle>Rooms are not enabled</EmptyTitle>
				<EmptyDescription>
					This server does not expose rooms. Enable them in the server configuration to see
					membership here.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>

		<template v-else>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<Card v-for="card in statsCards" :key="card.key" class="p-4">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm text-muted-foreground">{{ card.label }}</p>
							<p class="text-2xl font-bold text-foreground">{{ card.value }}</p>
						</div>
						<component :is="card.icon" class="h-5 w-5 text-muted-foreground" />
					</div>
				</Card>
			</div>

			<div class="relative mb-4">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					v-model="searchQuery"
					placeholder="Search rooms..."
					class="pl-9"
					data-testid="rooms-search"
				/>
			</div>

			<DataTable
				:data="rooms"
				:columns="columns"
				:global-filter="searchQuery"
				:page-size="15"
				empty-message="Rooms appear here as soon as peers join one."
				data-testid="rooms-table"
			/>
		</template>

		</ClientOnly>

		<!-- Dissolution removes every member, so it is confirmed explicitly. -->
		<AlertDialog
			:open="dissolveTarget !== null"
			@update:open="value => !value && (dissolveTarget = null)"
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Dissolve this room?</AlertDialogTitle>
					<AlertDialogDescription>
						Every member of "{{ dissolveTarget }}" will be removed and notified. Peers can join
						again afterwards; nothing else is affected.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction data-testid="confirm-dissolve" @click="confirmDissolve">
						Dissolve
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>

		<AddRoomMembersDialog
			v-model:open="showAddDialog"
			:room="addTarget"
			@added="refresh"
		/>
	</div>
</template>
