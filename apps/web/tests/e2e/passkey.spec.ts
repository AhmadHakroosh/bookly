import { expect, test } from "@playwright/test";
import { STORAGE } from "./helpers";

/**
 * Passkeys end to end with Chromium's virtual authenticator: register one from the profile
 * page while signed in, sign out, and sign back in with it alone. No password involved.
 */
test("a passkey registers on the profile page and signs in without a password", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: STORAGE });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  // Unique per run: an aborted earlier run may have left its passkey behind.
  const name = `CI authenticator ${Date.now().toString(36)}`;
  try {
    await page.goto("/admin/account");
    await page.getByLabel("Passkey name").fill(name);
    await page.getByRole("button", { name: "Add a passkey" }).click();
    await expect(page.getByText(name)).toBeVisible();

    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);
    // The login page offers saved passkeys through the email field's autofill; the virtual
    // authenticator answers that request by itself, so the sign-in may already have happened.
    // Otherwise the explicit button does the same through a modal prompt.
    const viaAutofill = await page
      .waitForURL(/\/admin/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!viaAutofill) {
      await page.getByRole("button", { name: "Sign in with a passkey" }).click();
      await expect(page).toHaveURL(/\/admin/);
    }

    await page.goto("/admin/account");
    await page
      .getByRole("listitem")
      .filter({ hasText: name })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(page.getByText(name)).toHaveCount(0);
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    await context.close();
  }
});
