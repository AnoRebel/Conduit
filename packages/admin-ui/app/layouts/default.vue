<script setup lang="ts">
import {
	BarChart3,
	FileText,
	LayoutDashboard,
	Menu,
	Moon,
	Settings,
	Sun,
	Users,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const colorMode = useColorMode();
const isSidebarOpen = ref(true);

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

function toggleSidebar() {
	isSidebarOpen.value = !isSidebarOpen.value;
}

// Scroll tracking with VueUse
const mainContentRef = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(mainContentRef);
const { height: windowHeight } = useWindowSize();

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

// Auto-start tour for first-time visitors on each page
const route = useRoute();
watch(
	() => route.path,
	async () => {
		await nextTick();
		// Small delay to ensure DOM is ready
		setTimeout(() => {
			if (hasTourForCurrentPage.value && !hasSeenCurrentTour.value && tourManagerRef.value) {
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
	<div class="min-h-screen bg-background">
		<!-- Sidebar -->
		<aside
			:class="[
				'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card/80 backdrop-blur-md border-r transition-transform duration-300',
				isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
			]"
		>
			<!-- Logo -->
			<div class="flex h-16 items-center gap-2 px-6 border-b border-border/50">
				<div class="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
					<span class="text-primary-foreground font-bold text-sm">C</span>
				</div>
				<span class="text-lg font-semibold">Conduit Admin</span>
			</div>

			<!-- Navigation -->
			<nav class="flex-1 px-3 py-4 space-y-1" data-tour-guide="nav-sidebar">
				<NuxtLink
					v-for="item in navigation"
					:key="item.name"
					:to="item.href"
					class="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
					active-class="bg-accent text-accent-foreground"
				>
					<component :is="item.icon" class="h-5 w-5" />
					<span>{{ item.name }}</span>
				</NuxtLink>
			</nav>

			<!-- Sidebar Footer - always visible in sidebar -->
			<div class="p-4 border-t border-border/50">
				<p class="text-xs text-muted-foreground">Conduit Admin v0.1.0</p>
			</div>
		</aside>

		<!-- Main content wrapper -->
		<div
			ref="mainContentRef"
			:class="[
				'min-h-screen transition-all duration-300 overflow-auto',
				isSidebarOpen ? 'ml-64' : 'ml-0',
			]"
		>
			<!-- Header -->
			<header
				:class="[
					'sticky top-0 z-40 flex h-16 items-center gap-4 px-6 transition-all duration-300 ease-out',
					isHeaderFloating
						? 'mx-4 mt-2 rounded-xl bg-card/70 backdrop-blur-xl border shadow-lg'
						: 'bg-transparent backdrop-blur-sm border-b border-transparent',
				]"
			>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger as-child>
							<Button variant="ghost" size="icon-sm" @click="toggleSidebar">
								<Menu class="h-5 w-5" />
								<span class="sr-only">Toggle sidebar</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{{ isSidebarOpen ? 'Hide sidebar' : 'Show sidebar' }}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>

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

			<!-- Page content -->
			<main class="p-6 pb-24">
				<slot />
			</main>

			<!-- Footer sentinel for intersection observer -->
			<div ref="footerSentinelRef" class="h-1" />

			<!-- Footer -->
			<footer
				:class="[
					'transition-all duration-300 ease-out',
					isAtBottom
						? 'relative bg-card border-t px-6 py-4'
						: 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card/70 backdrop-blur-xl border shadow-lg rounded-full px-6 py-2',
					isSidebarOpen && !isAtBottom ? 'ml-32' : '',
				]"
			>
				<div
					:class="[
						'flex items-center gap-4 text-muted-foreground',
						isAtBottom ? 'justify-between' : 'justify-center',
					]"
				>
					<p class="text-xs">Conduit Admin v0.1.0</p>
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
	</div>

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
