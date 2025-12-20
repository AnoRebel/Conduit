<script setup lang="ts">
const colorMode = useColorMode();

// Initialize dark mode from localStorage or system preference
onMounted(() => {
	const savedTheme = localStorage.getItem("theme");
	if (savedTheme === "dark") {
		colorMode.preference = "dark";
	} else if (savedTheme === "light") {
		colorMode.preference = "light";
	}
});
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
