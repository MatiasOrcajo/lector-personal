import { expect, test } from "@playwright/test"
import { readState, setAuthCookie } from "./helpers/auth"

test("unauthenticated access to the library redirects to login", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
  await expect(
    page.getByRole("heading", { name: "Lector Personal" })
  ).toBeVisible()
})

test("unauthenticated access to a reader redirects to login", async ({
  page,
}) => {
  await page.goto("/read/00000000-0000-0000-0000-000000000000")
  await expect(page).toHaveURL(/\/login/)
})

test("login page offers Google sign-in", async ({ page }) => {
  await page.goto("/login")
  await expect(
    page.getByRole("button", { name: "Iniciar sesión con Google" })
  ).toBeVisible()
})

test("authenticated user sees their library with the seeded books", async ({
  page,
}) => {
  const state = readState()
  await setAuthCookie(page, state.userId)
  await page.goto("/")
  await expect(page.getByText("Hola, E2E User")).toBeVisible()
  await expect(page.getByRole("link", { name: "Biblioteca" })).toBeVisible()
  await expect(page.getByText("[E2E] PDF Sample").first()).toBeVisible()
  await expect(page.getByText("[E2E] EPUB Sample").first()).toBeVisible()
})