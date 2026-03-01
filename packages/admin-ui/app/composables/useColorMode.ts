import { useColorMode as _useColorMode } from "@vueuse/core";

/**
 * Color mode composable using VueUse's useColorMode.
 * Provides auto-persistence to localStorage, system preference detection,
 * and automatic DOM class toggling — replacing ~60 lines of custom code.
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

	return {
		get preference() {
			return mode.value;
		},
		set preference(val: "light" | "dark" | "system" | "auto") {
			mode.value = val === "system" ? "auto" : val;
		},
		get value() {
			return mode.value === "auto" || mode.value === "dark" ? "dark" : "light";
		},
	};
}
