<script setup lang="ts">
import {
	BarChart3,
	Cable,
	Circle,
	FileText,
	LayoutDashboard,
	Moon,
	Settings,
	ShieldBan,
	Sun,
	Users,
} from "lucide-vue-next";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const colorMode = useColorMode();
const route = useRoute();
const connection = useConnection();
const store = useAdminStore();

// Connection sheet state
const showConnectionSheet = ref(false);

const navigation = [
	{ name: "Dashboard", href: "/", icon: LayoutDashboard },
	{ name: "Clients", href: "/clients", icon: Users },
	{ name: "Bans", href: "/bans", icon: ShieldBan },
	{ name: "Metrics", href: "/metrics", icon: BarChart3 },
	{ name: "Audit Log", href: "/audit", icon: FileText },
	{ name: "Settings", href: "/settings", icon: Settings },
];

function toggleDarkMode() {
	colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
}

/**
 * Determine if a nav item is currently active.
 * Exact match for root "/", startsWith for nested routes like "/clients/xxx".
 */
function isNavActive(href: string): boolean {
	if (href === "/") return route.path === "/";
	return route.path.startsWith(href);
}

// Format uptime from seconds to human readable string
function formatUptime(seconds: number): string {
	if (!seconds) return "0s";
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

// Current page title for header
const currentPageTitle = computed(() => {
	const nav = navigation.find(n => isNavActive(n.href));
	return nav?.name ?? "Dashboard";
});

// Display-friendly server URL
const displayServerUrl = computed(() => {
	const url = connection.serverUrl.value;
	if (!url) return "Not connected";
	try {
		const parsed = new URL(url);
		return parsed.host;
	} catch {
		return url;
	}
});

// Scroll tracking with VueUse — target the SidebarInset <main> element via $el
const sidebarInsetRef = ref<InstanceType<typeof SidebarInset> | null>(null);
const scrollTarget = computed(() => sidebarInsetRef.value?.$el as HTMLElement | undefined);
const { y: scrollY } = useScroll(scrollTarget);

// Header becomes floating after scrolling 20px
const isHeaderFloating = computed(() => scrollY.value > 20);

// Footer tracking - check if we're at the bottom
const isAtBottom = ref(false);

// Use intersection observer for footer
const footerSentinelRef = ref<HTMLElement | null>(null);
const { stop } = useIntersectionObserver(
	footerSentinelRef,
	entries => {
		const entry = entries[0];
		if (entry) {
			isAtBottom.value = entry.isIntersecting;
		}
	},
	{ threshold: 0.1 }
);

onUnmounted(() => {
	stop();
});

// Handle connection change from sheet
async function onConnectionChanged() {
	showConnectionSheet.value = false;
	store.cleanup();
	await store.initialize();
	toast.success("Reconnected to server");
}

// Disconnect and show connection dialog
function handleDisconnect() {
	store.cleanup();
	connection.clearSettings();
	toast.info("Disconnected from server");
}

// Tour guide setup
const { currentSteps, hasTourForCurrentPage, hasSeenCurrentTour, markTourAsSeen, setTourManager } =
	useTour();

const tourManagerRef = ref<{
	startTourGuide: () => void;
	skipTourGuide: () => void;
	resetTourGuide: () => void;
	isActive: Ref<boolean>;
	currentStepIndex: Ref<number>;
} | null>(null);

// Set tour manager reference when component mounts
watch(tourManagerRef, manager => {
	if (manager) {
		setTourManager(manager);
	}
});

// Auto-start tour for first-time visitors on each page (only when authenticated)
watch(
	() => route.path,
	async () => {
		await nextTick();
		// Only auto-start tour when connected — otherwise the tour overlay
		// blocks pointer events on the connection form
		useTimeoutFn(() => {
			if (
				connection.isConfigured.value &&
				hasTourForCurrentPage.value &&
				!hasSeenCurrentTour.value &&
				tourManagerRef.value
			) {
				tourManagerRef.value.startTourGuide();
			}
		}, 500);
	},
	{ immediate: true }
);

function onTourComplete() {
	markTourAsSeen();
}

function onTourSkip() {
	markTourAsSeen();
}
</script>

<template>
	<SidebarProvider :default-open="true">
		<Sidebar collapsible="icon">
			<!-- Logo -->
			<SidebarHeader class="border-b border-sidebar-border/50">
				<div class="flex h-12 items-center gap-2 px-2 overflow-hidden">
					<div class="h-8 w-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
						<span class="text-primary-foreground font-bold text-sm">C</span>
					</div>
					<span class="text-lg font-semibold text-sidebar-foreground whitespace-nowrap overflow-hidden transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
						Conduit Admin
					</span>
				</div>
			</SidebarHeader>

			<!-- Navigation -->
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu data-tour-guide="nav-sidebar">
							<SidebarMenuItem v-for="item in navigation" :key="item.name">
								<SidebarMenuButton as-child :tooltip="item.name" :is-active="isNavActive(item.href)">
									<NuxtLink :to="item.href">
										<component :is="item.icon" />
										<span>{{ item.name }}</span>
									</NuxtLink>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<!-- Sidebar Footer — Connection Status -->
			<SidebarFooter class="border-t border-sidebar-border/50">
				<div class="flex items-center gap-2 px-2 py-2 overflow-hidden">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger as-child>
								<button
									class="flex items-center gap-2 min-w-0 w-full"
									@click="showConnectionSheet = true"
								>
									<Circle
										:class="[
											'h-3 w-3 shrink-0 fill-current',
											store.isConnected ? 'text-green-500' : 'text-red-500',
										]"
									/>
									<div class="flex flex-col overflow-hidden transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
										<span class="text-xs font-medium text-sidebar-foreground/80 truncate">
											{{ store.isConnected ? displayServerUrl : 'Disconnected' }}
										</span>
										<span v-if="store.status" class="text-[10px] text-sidebar-foreground/50 truncate">
											v{{ store.status.version || '?' }} · {{ formatUptime(store.status.uptime) }}
										</span>
									</div>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">
								<div class="text-xs space-y-1">
									<p class="font-medium">{{ store.isConnected ? 'Connected' : 'Disconnected' }}</p>
									<p class="text-muted-foreground">{{ displayServerUrl }}</p>
									<template v-if="store.status">
										<p>Version: {{ store.status.version || 'unknown' }}</p>
										<p>Uptime: {{ formatUptime(store.status.uptime) }}</p>
										<p>Clients: {{ store.status.clients?.connected ?? 0 }}/{{ store.status.clients?.total ?? 0 }}</p>
									</template>
									<p class="text-muted-foreground/70 mt-1">Click to change connection</p>
								</div>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>

		<!-- Main content area -->
		<SidebarInset ref="sidebarInsetRef" class="overflow-auto">
			<!-- Flex column to push footer to bottom when content is short -->
			<div class="flex min-h-screen flex-col">
				<!-- Header -->
				<header
					v-motion
					:initial="{ opacity: 0, y: -10 }"
					:enter="{ opacity: 1, y: 0, transition: { duration: 300, delay: 100 } }"
					:class="[
						'sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6 transition-all duration-300 ease-out',
						isHeaderFloating
							? 'mx-2 sm:mx-4 mt-2 rounded-xl bg-card/70 backdrop-blur-xl border shadow-lg'
							: 'bg-transparent backdrop-blur-sm border-b border-transparent',
					]"
				>
					<!-- Sidebar trigger -->
					<SidebarTrigger class="-ml-1" />

					<Separator orientation="vertical" class="mr-2 h-4" />

					<!-- Page title -->
					<div class="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
						<span class="font-medium text-foreground">{{ currentPageTitle }}</span>
					</div>

					<div class="flex-1" />

					<!-- Connection badge -->
					<TooltipProvider v-if="connection.isConfigured.value">
						<Tooltip>
							<TooltipTrigger as-child>
								<Button
									variant="ghost"
									size="sm"
									class="gap-1.5 text-xs text-muted-foreground max-w-40"
									@click="showConnectionSheet = true"
								>
									<Cable class="h-3.5 w-3.5 shrink-0" />
									<span class="truncate hidden sm:inline">{{ displayServerUrl }}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Change connection</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<!-- Tour button -->
					<TourButton />

					<Separator orientation="vertical" class="h-6" />

					<!-- Dark mode toggle -->
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger as-child>
								<Button
									variant="ghost"
									size="icon-sm"
									data-tour-guide="theme-toggle"
									@click="toggleDarkMode"
								>
									<Sun v-if="colorMode.value === 'dark'" class="h-5 w-5" />
									<Moon v-else class="h-5 w-5" />
									<span class="sr-only">Toggle theme</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{{ colorMode.value === 'dark' ? 'Light mode' : 'Dark mode' }}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</header>

				<!-- Page content — flex-1 ensures it fills remaining space -->
				<div class="flex-1 p-4 sm:p-6 pb-24">
					<slot />
				</div>

				<!-- Footer sentinel for intersection observer -->
				<div ref="footerSentinelRef" class="h-1" />

				<!-- Footer — always at bottom thanks to flex column layout -->
				<footer
					:class="[
						'transition-all duration-300 ease-out',
						isAtBottom
							? 'relative bg-card border-t px-4 sm:px-6 py-4'
							: 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card/70 backdrop-blur-xl border shadow-lg rounded-full px-6 py-2',
					]"
				>
					<div
						:class="[
							'flex items-center gap-4 text-muted-foreground',
							isAtBottom ? 'justify-between' : 'justify-center',
						]"
					>
						<p class="text-xs">Conduit Admin v1.0.0</p>
						<template v-if="isAtBottom">
							<div class="flex items-center gap-4 text-xs">
								<a href="https://github.com/AnoRebel/Conduit#readme" target="_blank" rel="noopener noreferrer" class="hover:text-foreground transition-colors">Documentation</a>
								<a href="https://github.com/AnoRebel/Conduit" target="_blank" rel="noopener noreferrer" class="hover:text-foreground transition-colors">GitHub</a>
								<a href="https://github.com/AnoRebel/Conduit/issues" target="_blank" rel="noopener noreferrer" class="hover:text-foreground transition-colors">Support</a>
							</div>
						</template>
					</div>
				</footer>
			</div>
		</SidebarInset>
	</SidebarProvider>

	<!-- Connection Settings Sheet -->
	<Sheet v-model:open="showConnectionSheet">
		<SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
			<SheetHeader>
				<SheetTitle>Connection Settings</SheetTitle>
				<SheetDescription>
					Change the server connection or credentials.
				</SheetDescription>
			</SheetHeader>
			<div class="mt-6">
				<ConnectionDialog @connected="onConnectionChanged" />
				<div v-if="connection.isConfigured.value" class="mt-4 flex justify-center">
					<Button
						variant="ghost"
						size="sm"
						class="text-destructive hover:text-destructive"
						@click="handleDisconnect"
					>
						Disconnect
					</Button>
				</div>
			</div>
		</SheetContent>
	</Sheet>

	<Toaster rich-colors />

	<!-- Tour Guide Manager (client-only: registered via v-tour-guide.client plugin) -->
	<ClientOnly>
		<TourGuideManager
			ref="tourManagerRef"
			:steps="currentSteps"
			highlight
			@complete="onTourComplete"
			@skip="onTourSkip"
		/>
	</ClientOnly>
</template>
