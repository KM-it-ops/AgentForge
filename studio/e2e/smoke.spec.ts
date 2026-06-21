import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("AgentForge Studio smoke", () => {
  test("loads, compiles cursor, shows .mdc output", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "AgentForge Studio" })).toBeVisible();
    await expect(page.getByText("Loading spec from repo…")).toBeHidden({ timeout: 30_000 });

    await page.getByRole("button", { name: "Compile" }).click();
    await expect(page.getByText("Compiling with real adapter emitter…")).toBeHidden({
      timeout: 60_000,
    });

    await expect(page.getByText(".cursor/rules/identity.mdc").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("files", { exact: false }).first()).toBeVisible();
  });

  test("doctor returns checks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Loading spec from repo…")).toBeHidden({ timeout: 30_000 });

    await page.getByRole("button", { name: "Run doctor" }).click();
    await expect(page.getByText("node >=18")).toBeVisible({ timeout: 30_000 });
  });

  test("passes basic a11y on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AgentForge Studio" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toEqual([]);
  });
});
