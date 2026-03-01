import { useColorMode as _useColorMode, usePreferredDark } from "@vueuse/core";

/**
 * Color mode composable using VueUse's useColorMode.
 * Provides auto-persistence to localStorage, system preference detection,
 * and automatic DOM class toggling.
 */
export function useColorMode() {
	const mode = _useColorMode({
		selector: "html",
		attribute: "class",
		storageKey: "theme",
		modes: {
			dark: "dark",
			light: "",
		},
	});

	// Track system preference for resolving "auto" mode
	const prefersDark = usePreferredDark();

	return {
		get preference() {
			return mode.value;
		},
		set preference(val: "light" | "dark" | "system" | "auto") {
			mode.value = val === "system" ? "auto" : val;
		},
		/** Resolved value — "dark" or "light" (never "auto") */
		get value(): "dark" | "light" {
			if (mode.value === "auto") {
				return prefersDark.value ? "dark" : "light";
			}
			return mode.value === "dark" ? "dark" : "light";
		},
	};
}
