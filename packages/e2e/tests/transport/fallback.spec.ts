import { expect, test } from "@playwright/test";

test.describe("WebSocket Fallback Transport", () => {
	test("should connect using WebSocket transport directly", async ({ browser }) => {
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();

		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();

		try {
			await alicePage.goto("/alice.html");
			await bobPage.goto("/bob.html");

			// Connect both to server
			await alicePage.fill("#myId", "alice-ws");
			await alicePage.click("#connect-server");
			await expect(alicePage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			await bobPage.fill("#myId", "bob-ws");
			await bobPage.click("#connect-server");
			await expect(bobPage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Select WebSocket transport
			await alicePage.selectOption("#transport", "websocket");

			// Connect to Bob
			await alicePage.fill("#remoteId", "bob-ws");
			await alicePage.click("#connect-remote");

			// Wait for connection
			await expect(alicePage.locator("#log")).toContainText("Data connection open", {
				timeout: 15000,
			});

			// Send message
			await alicePage.fill("#message", "Hello via WebSocket!");
			await alicePage.click("#send");

			// Verify received
			await expect(bobPage.locator("#log")).toContainText("Hello via WebSocket!", {
				timeout: 5000,
			});
		} finally {
			await aliceContext.close();
			await bobContext.close();
		}
	});

	test("should connect using WebRTC transport directly", async ({ browser }) => {
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();

		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();

		try {
			await alicePage.goto("/alice.html");
			await bobPage.goto("/bob.html");

			// Connect both to server
			await alicePage.fill("#myId", "alice-rtc");
			await alicePage.click("#connect-server");
			await expect(alicePage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			await bobPage.fill("#myId", "bob-rtc");
			await bobPage.click("#connect-server");
			await expect(bobPage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Select WebRTC transport
			await alicePage.selectOption("#transport", "webrtc");

			// Connect to Bob
			await alicePage.fill("#remoteId", "bob-rtc");
			await alicePage.click("#connect-remote");

			// Wait for connection
			await expect(alicePage.locator("#log")).toContainText("Data connection open", {
				timeout: 15000,
			});

			// Send message
			await alicePage.fill("#message", "Hello via WebRTC!");
			await alicePage.click("#send");

			// Verify received
			await expect(bobPage.locator("#log")).toContainText("Hello via WebRTC!", {
				timeout: 5000,
			});
		} finally {
			await aliceContext.close();
			await bobContext.close();
		}
	});

	test("should use auto transport (default)", async ({ browser }) => {
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();

		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();

		try {
			await alicePage.goto("/alice.html");
			await bobPage.goto("/bob.html");

			// Connect both to server
			await alicePage.fill("#myId", "alice-auto");
			await alicePage.click("#connect-server");
			await expect(alicePage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			await bobPage.fill("#myId", "bob-auto");
			await bobPage.click("#connect-server");
			await expect(bobPage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Keep auto transport (default)
			await alicePage.selectOption("#transport", "auto");

			// Connect to Bob
			await alicePage.fill("#remoteId", "bob-auto");
			await alicePage.click("#connect-remote");

			// Wait for connection (should establish via WebRTC first, or fallback)
			await expect(alicePage.locator("#log")).toContainText("Data connection open", {
				timeout: 20000,
			});

			// Send message
			await alicePage.fill("#message", "Hello via Auto transport!");
			await alicePage.click("#send");

			// Verify received
			await expect(bobPage.locator("#log")).toContainText("Hello via Auto transport!", {
				timeout: 5000,
			});
		} finally {
			await aliceContext.close();
			await bobContext.close();
		}
	});
});
