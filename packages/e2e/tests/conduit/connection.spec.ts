import { expect, test } from "@playwright/test";

test.describe("Conduit Connection", () => {
	test("should connect to signaling server", async ({ page }) => {
		await page.goto("/alice.html");

		// Set conduit ID
		await page.fill("#myId", "test-alice");

		// Connect to server
		await page.click("#connect-server");

		// Wait for connection
		await expect(page.locator("#status")).toHaveClass(/connected/, {
			timeout: 10000,
		});

		// Verify conduit is connected
		const status = await page.locator("#status").textContent();
		expect(status).toContain("test-alice");
	});

	test("should establish data connection between two conduits", async ({ browser }) => {
		// Create two browser contexts (simulating two users)
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();

		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();

		try {
			// Navigate both pages
			await alicePage.goto("/alice.html");
			await bobPage.goto("/bob.html");

			// Connect Alice to server
			await alicePage.fill("#myId", "alice");
			await alicePage.click("#connect-server");
			await expect(alicePage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Connect Bob to server
			await bobPage.fill("#myId", "bob");
			await bobPage.click("#connect-server");
			await expect(bobPage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Alice connects to Bob
			await alicePage.fill("#remoteId", "bob");
			await alicePage.click("#connect-remote");

			// Wait for connection on both sides
			await expect(alicePage.locator("#log")).toContainText("Data connection open", {
				timeout: 15000,
			});
			await expect(bobPage.locator("#log")).toContainText("Incoming connection from: alice", {
				timeout: 15000,
			});

			// Send message from Alice to Bob
			await alicePage.fill("#message", "Hello Bob!");
			await alicePage.click("#send");

			// Verify Bob received the message
			await expect(bobPage.locator("#log")).toContainText("Hello Bob!", {
				timeout: 5000,
			});

			// Send message from Bob to Alice
			await bobPage.fill("#message", "Hello Alice!");
			await bobPage.click("#send");

			// Verify Alice received the message
			await expect(alicePage.locator("#log")).toContainText("Hello Alice!", {
				timeout: 5000,
			});
		} finally {
			await aliceContext.close();
			await bobContext.close();
		}
	});

	test("should handle conduit disconnection gracefully", async ({ browser }) => {
		const aliceContext = await browser.newContext();
		const bobContext = await browser.newContext();

		const alicePage = await aliceContext.newPage();
		const bobPage = await bobContext.newPage();

		try {
			// Setup connection
			await alicePage.goto("/alice.html");
			await bobPage.goto("/bob.html");

			await alicePage.fill("#myId", "alice-disc");
			await alicePage.click("#connect-server");
			await expect(alicePage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			await bobPage.fill("#myId", "bob-disc");
			await bobPage.click("#connect-server");
			await expect(bobPage.locator("#status")).toHaveClass(/connected/, {
				timeout: 10000,
			});

			// Establish connection
			await alicePage.fill("#remoteId", "bob-disc");
			await alicePage.click("#connect-remote");
			await expect(alicePage.locator("#log")).toContainText("Data connection open", {
				timeout: 15000,
			});

			// Close Bob's page (simulating disconnect)
			await bobPage.close();

			// Alice should eventually detect the disconnection
			// (This may take a while depending on heartbeat settings)
			await expect(alicePage.locator("#log")).toContainText(/close|error/i, {
				timeout: 30000,
			});
		} finally {
			await aliceContext.close();
			await bobContext.close();
		}
	});
});
