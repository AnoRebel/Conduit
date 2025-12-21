<script setup lang="ts">
import { ChevronRight, Home } from "lucide-vue-next";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbNavItem {
	label: string;
	href?: string;
}

defineProps<{
	items: BreadcrumbNavItem[];
}>();
</script>

<template>
	<Breadcrumb class="mb-4">
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbLink as-child>
					<NuxtLink to="/" class="flex items-center gap-1">
						<Home class="h-4 w-4" />
						<span class="sr-only">Home</span>
					</NuxtLink>
				</BreadcrumbLink>
			</BreadcrumbItem>

			<template v-for="(item, index) in items" :key="index">
				<BreadcrumbSeparator>
					<ChevronRight class="h-4 w-4" />
				</BreadcrumbSeparator>
				<BreadcrumbItem>
					<BreadcrumbLink v-if="item.href" as-child>
						<NuxtLink :to="item.href">
							{{ item.label }}
						</NuxtLink>
					</BreadcrumbLink>
					<BreadcrumbPage v-else>
						{{ item.label }}
					</BreadcrumbPage>
				</BreadcrumbItem>
			</template>
		</BreadcrumbList>
	</Breadcrumb>
</template>
