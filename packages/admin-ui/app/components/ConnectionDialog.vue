<script setup lang="ts">
import {
	Cable,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	Key,
	Loader2,
	Server,
	User,
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { AuthType } from "~/composables/useConnection";

const emit = defineEmits<{
	connected: [];
}>();

const connection = useConnection();
const api = useAdminApi();
const store = useAdminStore();

// Local form state — initialized from stored settings
const serverUrl = ref(connection.settings.value.serverUrl);
const authType = ref<AuthType>(connection.settings.value.authType);
const apiKey = ref(connection.settings.value.apiKey);
const username = ref(connection.settings.value.username);
const password = ref(connection.settings.value.password);
const wsUrl = ref(connection.settings.value.wsUrl);
const remember = ref(connection.settings.value.remember);
const showAdvanced = ref(false);
const showPassword = ref(false);
const isConnecting = ref(false);
const errorMessage = ref("");

// Fallback defaults from env
const config = useRuntimeConfig();
const defaultServerUrl = config.public.adminApiUrl || "";

// Use effective URL for display
const displayServerUrl = computed(() => serverUrl.value || defaultServerUrl || "");

async function handleConnect() {
	const effectiveUrl = serverUrl.value || defaultServerUrl;
	if (!effectiveUrl) {
		errorMessage.value = "Please enter a server URL";
		return;
	}

	errorMessage.value = "";
	isConnecting.value = true;

	// Save settings first so API composable picks them up
	connection.saveSettings({
		serverUrl: serverUrl.value,
		authType: authType.value,
		apiKey: apiKey.value,
		username: username.value,
		password: password.value,
		wsUrl: wsUrl.value,
		remember: remember.value,
	});

	try {
		// Test the connection by hitting the health endpoint
		await api.getHealth();

		// Connection successful — initialize the store
		await store.initialize();
		toast.success("Connected to Conduit server");
		emit("connected");
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Connection failed";
		errorMessage.value = msg;
		toast.error("Connection failed", { description: msg });

		// Clear invalid settings if not remembered
		if (!remember.value) {
			connection.clearSettings();
		}
	} finally {
		isConnecting.value = false;
	}
}
</script>

<template>
	<div class="flex items-center justify-center min-h-[60vh]">
		<Card
			v-motion
			:initial="{ opacity: 0, scale: 0.95, y: 20 }"
			:enter="{ opacity: 1, scale: 1, y: 0, transition: { duration: 400, ease: 'easeOut' } }"
			class="w-full max-w-lg"
		>
			<CardHeader class="text-center">
				<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
					<Cable class="h-6 w-6 text-primary" />
				</div>
				<CardTitle class="text-xl">Connect to Conduit</CardTitle>
				<CardDescription>
					Enter your server details and credentials to connect.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form class="space-y-4" @submit.prevent="handleConnect">
					<!-- Server URL -->
					<div class="space-y-2">
						<Label for="serverUrl">Server URL</Label>
						<div class="relative">
							<Server class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="serverUrl"
								v-model="serverUrl"
								:placeholder="defaultServerUrl || 'https://your-server.com/admin/v1'"
								class="pl-9"
							/>
						</div>
						<p v-if="defaultServerUrl && !serverUrl" class="text-xs text-muted-foreground">
							Using default: {{ defaultServerUrl }}
						</p>
					</div>

					<!-- Auth Type -->
					<div class="space-y-2">
						<Label>Authentication</Label>
						<Select v-model="authType">
							<SelectTrigger>
								<SelectValue placeholder="Select auth type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="apiKey">API Key</SelectItem>
								<SelectItem value="basic">Basic Auth</SelectItem>
								<SelectItem value="none">No Auth</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<!-- API Key field -->
					<div v-if="authType === 'apiKey'" class="space-y-2">
						<Label for="apiKey">API Key</Label>
						<div class="relative">
							<Key class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								id="apiKey"
								v-model="apiKey"
								:type="showPassword ? 'text' : 'password'"
								placeholder="Enter your API key"
								class="pl-9 pr-9"
							/>
							<button
								type="button"
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
								@click="showPassword = !showPassword"
							>
								<EyeOff v-if="showPassword" class="h-4 w-4" />
								<Eye v-else class="h-4 w-4" />
							</button>
						</div>
					</div>

					<!-- Basic Auth fields -->
					<template v-if="authType === 'basic'">
						<div class="space-y-2">
							<Label for="username">Username</Label>
							<div class="relative">
								<User class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									id="username"
									v-model="username"
									placeholder="Username"
									class="pl-9"
								/>
							</div>
						</div>
						<div class="space-y-2">
							<Label for="password">Password</Label>
							<div class="relative">
								<Key class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									id="password"
									v-model="password"
									:type="showPassword ? 'text' : 'password'"
									placeholder="Password"
									class="pl-9 pr-9"
								/>
								<button
									type="button"
									class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
									@click="showPassword = !showPassword"
								>
									<EyeOff v-if="showPassword" class="h-4 w-4" />
									<Eye v-else class="h-4 w-4" />
								</button>
							</div>
						</div>
					</template>

					<!-- Advanced options -->
					<div>
						<button
							type="button"
							class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
							@click="showAdvanced = !showAdvanced"
						>
							<component :is="showAdvanced ? ChevronUp : ChevronDown" class="h-3.5 w-3.5" />
							Advanced options
						</button>
						<div
							v-if="showAdvanced"
							v-motion
							:initial="{ opacity: 0, height: 0 }"
							:enter="{ opacity: 1, height: 'auto', transition: { duration: 200 } }"
							class="mt-3 space-y-2"
						>
							<Label for="wsUrl">WebSocket URL (optional)</Label>
							<Input
								id="wsUrl"
								v-model="wsUrl"
								placeholder="Auto-derived from server URL"
							/>
							<p class="text-xs text-muted-foreground">
								Override the WebSocket URL if it differs from the default (server URL with /ws appended).
							</p>
						</div>
					</div>

					<Separator />

					<!-- Remember checkbox -->
					<div class="flex items-center gap-2">
						<Checkbox id="remember" :checked="remember" @update:checked="(v: boolean | 'indeterminate') => remember = v === true" />
						<Label for="remember" class="text-sm font-normal cursor-pointer">
							Remember this connection
						</Label>
					</div>

					<!-- Error message -->
					<p v-if="errorMessage" class="text-sm text-destructive">
						{{ errorMessage }}
					</p>

					<!-- Connect button -->
					<Button type="submit" class="w-full" :disabled="isConnecting">
						<Loader2 v-if="isConnecting" class="h-4 w-4 animate-spin" />
						{{ isConnecting ? "Connecting..." : "Connect" }}
					</Button>
				</form>
			</CardContent>
		</Card>
	</div>
</template>
