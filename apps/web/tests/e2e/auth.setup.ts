import { test as setup } from "@playwright/test";
import { signIn, STORAGE } from "./helpers";

/** Signs in once; admin tests reuse the saved session (Better Auth rate-limits repeated sign-ins). */
setup("sign in as the demo host", async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: STORAGE });
});
