<script setup lang="ts">
import { HelpCircle } from "lucide-vue-next";

const { hasTourForCurrentPage, startTour } = useTour();
</script>

<template>
	<button
		v-if="hasTourForCurrentPage"
		data-tour-guide="tour-help-button"
		class="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
		title="Start page tour"
		@click="startTour"
	>
		<HelpCircle class="h-5 w-5" />
		<span class="hidden sm:inline">Tour</span>
	</button>
</template>
