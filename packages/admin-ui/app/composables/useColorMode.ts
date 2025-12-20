export function useColorMode() {
	const preference = useState<"light" | "dark" | "system">(
		"colorMode",
		() => "system",
	);
	const value = useState<"light" | "dark">("colorModeValue", () => "light");

	function updateDOM(mode: "light" | "dark") {
		if (import.meta.client) {
			document.documentElement.classList.toggle("dark", mode === "dark");
		}
	}

	function getSystemPreference(): "light" | "dark" {
		if (import.meta.client) {
			return window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}
		return "light";
	}

	function update() {
		if (preference.value === "system") {
			value.value = getSystemPreference();
		} else {
			value.value = preference.value;
		}
		updateDOM(value.value);
	}

	// Watch preference changes
	watch(preference, () => {
		update();
		if (import.meta.client) {
			localStorage.setItem("theme", preference.value);
		}
	});

	// Initialize on client
	onMounted(() => {
		// Load saved preference
		const saved = localStorage.getItem("theme") as
			| "light"
			| "dark"
			| "system"
			| null;
		if (saved) {
			preference.value = saved;
		}

		update();

		// Listen for system preference changes
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", () => {
			if (preference.value === "system") {
				update();
			}
		});
	});

	return {
		preference,
		value: readonly(value),
	};
}
