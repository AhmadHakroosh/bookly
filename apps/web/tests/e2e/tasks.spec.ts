import { expect, test, type Locator, type Page } from "@playwright/test";
import { STORAGE } from "./helpers";

test.use({ storageState: STORAGE });

const column = (page: Page, name: string) =>
  page.getByRole("region", { name: "Task board" }).getByRole("region", { name, exact: true });

const card = (where: Locator, title: string) =>
  where.getByRole("button", { name: new RegExp(`^${title}\\.`) });

/** A real pointer drag: press, move past the activation distance, glide to the target, release. */
async function drag(page: Page, from: Locator, to: Locator) {
  // The board re-renders when fresh data arrives; measure once it has settled.
  await page.waitForLoadState("networkidle");
  await expect(from).toBeVisible();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 15 });
  await page.mouse.up();
}

const saved = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );

// Unique per run, so a reused test database does not hold two cards with the same title.
const run = Date.now().toString(36).slice(-5);
const DRAG = `Drag me across ${run}`;
const CALL = `Call the accountant ${run}`;

test.describe("task board", () => {
  test("create a task, drag it across columns with the mouse and the keyboard, and it stays", async ({
    page,
  }) => {
    await page.goto("/admin/tasks?view=mine&layout=board");
    await expect(page.getByRole("heading", { name: /^Tasks/, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(column(page, "To do")).toBeVisible();

    // New task from the dialog lands in the default column.
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill(DRAG);
    const created = saved(page);
    await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
    await created;
    await expect(card(column(page, "To do"), DRAG)).toBeVisible();

    // Mouse: To do → In progress.
    const moved = saved(page);
    await drag(page, card(column(page, "To do"), DRAG), column(page, "In progress"));
    await moved;
    await expect(card(column(page, "In progress"), DRAG)).toBeVisible();
    await page.reload();
    await expect(card(column(page, "In progress"), DRAG)).toBeVisible();

    // Keyboard: Space picks it up, → moves to the next column, Space drops.
    const item = card(column(page, "In progress"), DRAG);
    // After a reload, wait for hydration: before it the card has no key handlers yet.
    await page.waitForLoadState("networkidle");
    await item.focus();
    const keyed = saved(page);
    // Each step waits for the screen-reader announcement, as a person would wait for the move.
    const live = page.locator('[id^="DndLiveRegion"]');
    await page.keyboard.press("Space");
    await expect(live).toContainText("In progress, position 1");
    // dnd-kit starts listening for the arrows on the tick after pick-up; a person is never
    // that fast, Playwright is.
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await expect(live).toContainText("Done, position 1");
    await page.keyboard.press("Space");
    await keyed;
    await expect(card(column(page, "Done"), DRAG)).toBeVisible();
    await page.reload();
    await expect(card(column(page, "Done"), DRAG)).toBeVisible();

    // Done tasks leave the open list.
    await page.goto("/admin/tasks?view=mine&layout=list");
    await expect(page.getByRole("region", { name: "Task list" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(DRAG) })).toHaveCount(0);
  });

  test("the pane edits a task and takes comments; statuses can be added", async ({ page }) => {
    await page.goto("/admin/tasks?view=mine&layout=board");
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill(CALL);
    const created = saved(page);
    await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
    await created;

    // Enter on a focused card opens it.
    await page.waitForLoadState("networkidle");
    await card(column(page, "To do"), CALL).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/task=/);
    const pane = page.locator('[data-slot="sheet-content"]');
    await expect(pane.getByRole("heading", { name: CALL, level: 1 })).toBeVisible();
    await pane.getByRole("textbox", { name: "Comment" }).fill("Asked for the Q3 numbers.");
    const commented = saved(page);
    await pane.getByRole("button", { name: "Comment" }).click();
    await commented;
    await expect(pane.getByText("Asked for the Q3 numbers.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/task=/);
    await expect(card(column(page, "To do"), CALL)).toContainText("1");

    // Owners and admins shape the columns.
    await page.getByRole("button", { name: "Statuses" }).click();
    const editor = page.locator('[data-slot="sheet-content"]');
    await editor.getByLabel("New status name").fill("Waiting on client");
    const added = saved(page);
    await editor.getByRole("button", { name: "Add status" }).click();
    await added;
    await page.keyboard.press("Escape");
    await expect(column(page, "Waiting on client")).toBeVisible();

    // Archiving moves its tasks elsewhere and removes the column (and leaves the board as it was).
    await page.getByRole("button", { name: "Statuses" }).click();
    const row = editor.getByRole("listitem").filter({
      has: page
        .getByRole("textbox", { name: "Status name" })
        .and(page.locator('[value="Waiting on client"]')),
    });
    await row.getByRole("button", { name: "Archive" }).click();
    const archived = saved(page);
    await row.getByRole("button", { name: "Archive" }).last().click();
    await archived;
    await page.keyboard.press("Escape");
    await expect(column(page, "Waiting on client")).toHaveCount(0);
  });
});
