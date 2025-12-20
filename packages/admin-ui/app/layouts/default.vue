<script setup lang="ts">
import {
	LayoutDashboard,
	Users,
	BarChart3,
	Settings,
	FileText,
	Moon,
	Sun,
	Menu,
} from "lucide-vue-next";

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
	localStorage.setItem("theme", colorMode.preference);
}

function toggleSidebar() {
	isSidebarOpen.value = !isSidebarOpen.value;
}
</script>

<template>
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
		<!-- Sidebar -->
		<aside
			:class="[
				'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300',
				isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
			]"
		>
			<!-- Logo -->
			<div
				class="flex h-16 items-center gap-2 px-6 border-b border-gray-200 dark:border-gray-700"
			>
				<div
					class="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center"
				>
					<span class="text-white font-bold text-sm">C</span>
				</div>
				<span class="text-lg font-semibold text-gray-900 dark:text-white"
					>Conduit Admin</span
				>
			</div>

			<!-- Navigation -->
			<nav class="flex-1 px-4 py-4 space-y-1">
				<NuxtLink
					v-for="item in navigation"
					:key="item.name"
					:to="item.href"
					class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					active-class="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
				>
					<component :is="item.icon" class="h-5 w-5" />
					<span>{{ item.name }}</span>
				</NuxtLink>
			</nav>

			<!-- Footer -->
			<div class="p-4 border-t border-gray-200 dark:border-gray-700">
				<div class="text-xs text-gray-500 dark:text-gray-400">
					Conduit Admin v0.1.0
				</div>
			</div>
		</aside>

		<!-- Main content -->
		<div
			:class="[
				'transition-all duration-300',
				isSidebarOpen ? 'ml-64' : 'ml-0',
			]"
		>
			<!-- Header -->
			<header
				class="sticky top-0 z-40 flex h-16 items-center gap-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6"
			>
				<button
					class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					@click="toggleSidebar"
				>
					<Menu class="h-5 w-5 text-gray-600 dark:text-gray-400" />
				</button>

				<div class="flex-1" />

				<!-- Dark mode toggle -->
				<button
					class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					@click="toggleDarkMode"
				>
					<Sun
						v-if="colorMode.value === 'dark'"
						class="h-5 w-5 text-gray-600 dark:text-gray-400"
					/>
					<Moon v-else class="h-5 w-5 text-gray-600 dark:text-gray-400" />
				</button>
			</header>

			<!-- Page content -->
			<main class="p-6">
				<slot />
			</main>
		</div>
	</div>
</template>
