<script setup lang="ts">
import { BarChart3, FileText, LayoutDashboard, Moon, Settings, Sun, Users } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

const navigation = [
	{ name: "Dashboard", href: "/", icon: LayoutDashboard },
	{ name: "Clients", href: "/clients", icon: Users },
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

// Current page title for header
const currentPageTitle = computed(() => {
	const nav = navigation.find(n => isNavActive(n.href));
	return nav?.name ?? "Dashboard";
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
const store = useAdminStore();
const api = useAdminApi();

watch(
	() => route.path,
	async () => {
		await nextTick();
		// Only auto-start tour when authenticated — otherwise the tour overlay
		// blocks pointer events on the auth form
		useTimeoutFn(() => {
			if (
				api.isAuthenticated.value &&
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

			<!-- Sidebar Footer -->
			<SidebarFooter class="border-t border-sidebar-border/50">
				<p class="text-xs text-sidebar-foreground/50 px-2 py-1 group-data-[collapsible=icon]:hidden">
					Conduit Admin v1.0.0
				</p>
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
								<a href="#" class="hover:text-foreground transition-colors">Documentation</a>
								<a href="#" class="hover:text-foreground transition-colors">GitHub</a>
								<a href="#" class="hover:text-foreground transition-colors">Support</a>
							</div>
						</template>
					</div>
				</footer>
			</div>
		</SidebarInset>
	</SidebarProvider>

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
