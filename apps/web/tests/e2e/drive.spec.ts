import { expect, test, type Page } from "@playwright/test";
import { bookFirstSlot, STORAGE } from "./helpers";

test.use({ storageState: STORAGE });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const run = Date.now().toString(36).slice(-5);

/** Picks files through the page's "Upload" button (the file chooser, after hydration). */
async function upload(page: Page, button: ReturnType<Page["getByRole"]>, name: string) {
  await page.waitForLoadState("networkidle");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
  await chooser.setFiles({ name, mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText(`${name} uploaded`)).toBeVisible({ timeout: 15_000 });
}

const menu = (page: Page, name: string) =>
  page.getByRole("button", { name: `Actions for ${name}` });

test.describe("files", () => {
  test("My files: folder, upload, rename, move, trash and restore", async ({ page }) => {
    const folder = `Contracts ${run}`;
    const file = `proposal-${run}.pdf`;
    const renamed = `proposal-${run}-v2.pdf`;
    await page.goto("/admin/files?view=my");
    await expect(page.getByRole("heading", { name: /^Files/, level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill(folder);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", { name: folder })).toBeVisible();

    await upload(page, page.getByRole("button", { name: "Upload", exact: true }), file);
    await expect(page.getByRole("link", { name: file })).toBeVisible();

    await menu(page, file).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill(renamed);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", { name: renamed })).toBeVisible();

    await menu(page, renamed).click();
    await page.getByRole("menuitem", { name: "Move", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Folder" }).click();
    await page.getByRole("option", { name: folder }).click();
    await dialog.getByRole("button", { name: "Move here" }).click();
    await expect(page.getByRole("link", { name: renamed })).toHaveCount(0);
    await page.getByRole("link", { name: folder }).click();
    await expect(page.getByRole("link", { name: renamed })).toBeVisible();

    // The pane previews the PDF and says where the file is.
    await page.getByRole("link", { name: renamed }).click();
    const pane = page.locator('[data-slot="sheet-content"]');
    await expect(pane.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();
    await expect(pane.locator(`iframe[title="${renamed}"]`)).toBeVisible();
    await page.keyboard.press("Escape");

    await menu(page, renamed).click();
    await page.getByRole("menuitem", { name: "Move to trash" }).click();
    await expect(page.getByRole("link", { name: renamed })).toHaveCount(0);
    await page.goto("/admin/files?view=trash");
    await page.waitForLoadState("networkidle");
    const row = page
      .getByRole("list", { name: "Trash" })
      .getByRole("listitem")
      .filter({ hasText: renamed });
    const restored = page.waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
    await row.getByRole("button", { name: "Restore" }).click();
    await restored;
    await expect(page.getByText("Restored")).toBeVisible();
    await page.goto("/admin/files?view=recent");
    await expect(page.getByRole("link", { name: renamed })).toBeVisible();
  });

  test("a file on a contact's task lands in their folder and timeline, and goes out with a follow-up", async ({
    browser,
    page,
  }) => {
    const task = `Send the contract ${run}`;
    const file = `contract-${run}.pdf`;
    await bookFirstSlot(page, { name: "Drive Guest", email: `drive-guest-${run}@example.com` });
    const admin = await (await browser.newContext({ storageState: STORAGE })).newPage();
    await admin.goto("/admin/contacts");
    await admin
      .getByRole("link", { name: /Drive Guest/ })
      .first()
      .click();
    await expect(admin.getByRole("heading", { name: "Timeline" })).toBeVisible();
    const contactUrl = new URL(admin.url()).pathname;

    // A task for this contact, then a file uploaded on it.
    await admin.getByPlaceholder("Add a task…").fill(task);
    await admin.getByRole("button", { name: "Add", exact: true }).last().click();
    await expect(admin.getByText(task).first()).toBeVisible();
    await admin.goto("/admin/tasks?view=all&layout=list");
    await admin.getByRole("link", { name: new RegExp(task) }).click();
    const pane = admin.locator('[data-slot="sheet-content"]');
    await expect(pane.getByRole("heading", { name: task, level: 1 })).toBeVisible();
    await upload(admin, pane.getByRole("button", { name: "Upload", exact: true }), file);
    await expect(pane.getByRole("list", { name: "Task files" })).toContainText(file);

    // It is in the contact's folder and on their timeline, linked to the task.
    await admin.goto(contactUrl);
    await expect(admin.getByText(`File added to “${task}”: ${file}`)).toBeVisible();
    await expect(admin.getByRole("region", { name: "Files" })).toContainText(file);

    // Sent from the drive with a follow-up: the email's timeline entry lists it.
    await admin.waitForLoadState("networkidle");
    await admin.getByRole("button", { name: "Follow-up" }).click();
    await admin.getByRole("button", { name: "Attach from Files" }).click();
    const picker = admin.getByRole("dialog");
    await picker.getByRole("checkbox").first().check();
    await picker.getByRole("button", { name: /^Add 1 file/ }).click();
    await expect(admin.getByRole("list", { name: "Files to send" })).toContainText(file);
    await admin.getByRole("button", { name: "Preview email" }).click();
    await admin.getByRole("button", { name: "Send follow-up" }).click();
    await expect(admin.getByRole("link", { name: /^Follow-up sent/ })).toBeVisible({
      timeout: 15_000,
    });
    await admin.reload();
    const sentEntry = admin
      .getByRole("listitem")
      .filter({ has: admin.getByRole("link", { name: /^Follow-up sent/ }) })
      .first();
    await expect(sentEntry.getByRole("list", { name: "Attachments" })).toContainText(file);
  });
});
