<script setup lang="ts">
/**
 * Place connected peers into a room.
 *
 * Rooms are derived from membership rather than stored in their own right, so
 * there is no empty room to create: naming a room nobody is in yet and picking
 * its first member is how a room comes into existence. The dialog therefore
 * asks for a name and at least one peer, rather than offering a bare "create".
 */
import { useForm } from "@tanstack/vue-form";
import { Search, Users } from "lucide-vue-next";
import * as v from "valibot";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const props = defineProps<{
	/** Pre-fill the room name, when adding to a room that already exists. */
	room?: string;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{ added: [] }>();

const store = useAdminStore();

/**
 * The server's own room-name rule, mirrored so the dialog rejects a bad name
 * before a request rather than after one.
 */
const ROOM_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const schema = v.object({
	room: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "A room name is required"),
		v.maxLength(128, "Room names are at most 128 characters"),
		v.regex(ROOM_NAME_PATTERN, "Use only letters, digits, dot, underscore, colon or hyphen")
	),
	peerIds: v.pipe(v.array(v.string()), v.minLength(1, "Select at least one peer to add")),
});

const form = useForm({
	defaultValues: {
		room: props.room ?? "",
		peerIds: [] as string[],
	},
	validators: { onSubmit: schema },
	onSubmit: async ({ value }) => {
		const result = await store.addRoomMembers(value.room.trim(), value.peerIds);
		if (!result) {
			toast.error(store.error ?? "Failed to add members");
			return;
		}

		// Report both halves: a batch where one peer has since disconnected still
		// moves the rest, and saying only "added 5" would hide the one that did not.
		if (result.added.length > 0) {
			toast.success(
				`Added ${result.added.length} ${result.added.length === 1 ? "peer" : "peers"} to ${value.room.trim()}`
			);
		}
		for (const skip of result.skipped) {
			toast.warning(`${skip.peerId}: ${SKIP_REASONS[skip.reason]}`);
		}
		if (result.added.length === 0 && result.skipped.length === 0) {
			toast.info("Nothing to add");
		}

		emit("added");
		open.value = false;
	},
});

/** Plain-language wording for each per-peer refusal. */
const SKIP_REASONS: Record<string, string> = {
	"not-connected": "no longer connected",
	"already-member": "already in the room",
	"room-full": "room is at capacity",
};

const peerSearch = ref("");

/** Only connected peers can be placed, so disconnected ones are not offered. */
const availablePeers = computed(() => {
	const query = peerSearch.value.trim().toLowerCase();
	return store.clients
		.filter(c => c.connected)
		.filter(c => (query ? c.id.toLowerCase().includes(query) : true));
});

function togglePeer(peerId: string, selected: string[], set: (next: string[]) => void) {
	set(selected.includes(peerId) ? selected.filter(id => id !== peerId) : [...selected, peerId]);
}

// Reset whenever the dialog opens, so a previous attempt's selection and any
// validation errors do not carry into the next one.
//
// The peer list is also refreshed here rather than relied upon: pages other
// than Clients never fetch it, so opening this from Rooms offered an empty
// picker on a server with peers connected.
watch(open, async isOpen => {
	if (!isOpen) return;
	form.reset({ room: props.room ?? "", peerIds: [] });
	peerSearch.value = "";
	await store.fetchClients();
});
</script>

<template>
	<Dialog v-model:open="open">
		<DialogContent class="sm:max-w-lg">
			<DialogHeader>
				<DialogTitle>{{ props.room ? `Add peers to ${props.room}` : "Add a room" }}</DialogTitle>
				<DialogDescription>
					A room exists only while peers are in it, so adding one means placing its
					first member.
				</DialogDescription>
			</DialogHeader>

			<form
				class="space-y-4"
				@submit.prevent.stop="form.handleSubmit()"
			>
				<form.Field name="room">
					<template #default="{ field }">
						<div class="space-y-2">
							<Label :for="field.name">Room name</Label>
							<Input
								:id="field.name"
								:model-value="field.state.value"
								:disabled="!!props.room"
								placeholder="standup-engineering"
								data-testid="room-name-input"
								@update:model-value="val => field.handleChange(String(val))"
								@blur="field.handleBlur"
							/>
							<p
								v-if="!field.state.meta.isValid"
								class="text-xs text-destructive"
								role="alert"
							>
								{{ field.state.meta.errors.map(e => (typeof e === "string" ? e : e?.message)).join(", ") }}
							</p>
						</div>
					</template>
				</form.Field>

				<form.Field name="peerIds">
					<template #default="{ field }">
						<div class="space-y-2">
							<Label>Peers</Label>

							<div class="relative">
								<Search
									class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
								/>
								<Input
									v-model="peerSearch"
									placeholder="Search connected peers..."
									class="pl-9"
									data-testid="peer-search"
								/>
							</div>

							<div
								v-if="availablePeers.length > 0"
								class="max-h-56 overflow-y-auto rounded-md border divide-y"
							>
								<label
									v-for="peer in availablePeers"
									:key="peer.id"
									class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
								>
									<Checkbox
										:model-value="field.state.value.includes(peer.id)"
										@update:model-value="
											() => togglePeer(peer.id, field.state.value, field.handleChange)
										"
									/>
									<span class="font-mono text-sm">{{ peer.id }}</span>
								</label>
							</div>

							<!--
								No connected peers means nothing can be placed, which is worth
								saying plainly rather than showing an empty box.
							-->
							<p v-else class="text-sm text-muted-foreground flex items-center gap-2 py-3">
								<Users class="h-4 w-4" />
								{{ peerSearch ? "No peers match that search." : "No connected peers to add." }}
							</p>

							<p
								v-if="!field.state.meta.isValid"
								class="text-xs text-destructive"
								role="alert"
							>
								{{ field.state.meta.errors.map(e => (typeof e === "string" ? e : e?.message)).join(", ") }}
							</p>
						</div>
					</template>
				</form.Field>

				<DialogFooter>
					<Button type="button" variant="ghost" @click="open = false">Cancel</Button>
					<form.Subscribe>
						<template #default="{ canSubmit, isSubmitting }">
							<Button type="submit" :disabled="!canSubmit" data-testid="add-members-submit">
								{{ isSubmitting ? "Adding..." : "Add to room" }}
							</Button>
						</template>
					</form.Subscribe>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>
</template>
