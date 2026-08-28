import { expect, test } from "@playwright/test"
import { readState, setAuthCookie } from "./helpers/auth"

test.describe("PDF viewer", () => {
  let pdfBookId: string
  let userId: string

  test.beforeAll(() => {
    const state = readState()
    pdfBookId = state.pdfBookId
    userId = state.userId
  })

  test("loads the book with header, page nav and zoom", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    await expect(
      page.getByRole("heading", { name: "[E2E] PDF Sample" })
    ).toBeVisible()
    await expect(page.getByLabel("Ir a página")).toHaveValue("1")
    await expect(page.getByLabel("Zoom")).toBeVisible()
    await expect(page.locator("canvas").first()).toBeVisible()
    await expect(page.getByLabel("Página anterior")).toBeDisabled()
    await expect(page.getByLabel("Página siguiente")).toBeDisabled()
  })

  test("shows the seeded highlight in the sidebar", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    await page.getByRole("button", { name: "Resaltados" }).click()
    await expect(page.getByText("Hello PDF")).toBeVisible()
    await expect(page.getByText("Página 1")).toBeVisible()
  })

  test("changes the zoom from the select", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    const zoom = page.getByLabel("Zoom")
    await zoom.selectOption("2")
    await expect(zoom).toHaveValue("2")
  })

  test("keeps the reader state after a reload (progress)", async ({
    page,
  }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)
    await expect(page.locator("canvas").first()).toBeVisible()
    await page.reload()
    await expect(page.getByLabel("Ir a página")).toHaveValue("1")
  })
})

test.describe("EPUB viewer", () => {
  let epubBookId: string
  let userId: string

  test.beforeAll(() => {
    const state = readState()
    epubBookId = state.epubBookId
    userId = state.userId
  })

  test("loads the book and renders the epub.js iframe", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${epubBookId}`)

    await expect(
      page.getByRole("heading", { name: "[E2E] EPUB Sample" })
    ).toBeVisible()
    await expect(page.locator(".epub-viewer iframe").first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByLabel("Ir a página")).toHaveValue("1")
    await expect(
      page.getByRole("button", { name: "Reducir fuente" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Aumentar fuente" })
    ).toBeVisible()
  })

  test("shows the epub-specific controls in the header", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${epubBookId}`)

    await expect(page.locator(".epub-viewer iframe").first()).toBeVisible({
      timeout: 20_000,
    })
    const flowButton = page.getByRole("button", {
      name: /(Páginas|Desplazar|Pag|Scr)/,
    })
    await expect(flowButton).toBeVisible()
    await flowButton.click()
    await expect(flowButton).toContainText(/Desplazar|Scr/)
  })
})