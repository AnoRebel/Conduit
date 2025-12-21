export function useColorMode() {
	const _preference = useState<"light" | "dark" | "system">("colorMode", () => "system");
	const _value = useState<"light" | "dark">("colorModeValue", () => "light");

	function updateDOM(mode: "light" | "dark") {
		if (import.meta.client) {
			document.documentElement.classList.toggle("dark", mode === "dark");
		}
	}

	function getSystemPreference(): "light" | "dark" {
		if (import.meta.client) {
			return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
		}
		return "light";
	}

	function update() {
		if (_preference.value === "system") {
			_value.value = getSystemPreference();
		} else {
			_value.value = _preference.value;
		}
		updateDOM(_value.value);
	}

	// Watch preference changes
	watch(_preference, () => {
		update();
		if (import.meta.client) {
			localStorage.setItem("theme", _preference.value);
		}
	});

	// Initialize on client
	onMounted(() => {
		// Load saved preference
		const saved = localStorage.getItem("theme") as "light" | "dark" | "system" | null;
		if (saved) {
			_preference.value = saved;
		}

		update();

		// Listen for system preference changes
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", () => {
			if (_preference.value === "system") {
				update();
			}
		});
	});

	// Return API compatible with @nuxtjs/color-mode
	return {
		get preference() {
			return _preference.value;
		},
		set preference(val: "light" | "dark" | "system") {
			_preference.value = val;
		},
		get value() {
			return _value.value;
		},
	};
}
