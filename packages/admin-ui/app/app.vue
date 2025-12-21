<script setup lang="ts">
// Color mode is initialized by the useColorMode composable
useColorMode();
</script>

<template>
	<NuxtLayout>
		<NuxtPage
			:transition="{
				name: 'page',
				mode: 'out-in',
			}"
		/>
	</NuxtLayout>
</template>
