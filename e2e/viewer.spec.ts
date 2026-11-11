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
    await expect(page.getByLabel("Página siguiente")).toBeEnabled()
  })

  test("shows the seeded highlight in the sidebar", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    await page.getByRole("button", { name: "Resaltados" }).click()
    const sidebar = page.locator("aside").filter({ hasText: "Mis Resaltados" })
    await expect(sidebar.getByText("Hello PDF")).toBeVisible()
    await expect(sidebar.getByText("Página 1")).toBeVisible()
  })

  test("changes the zoom from the select", async ({ page }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    const zoom = page.getByLabel("Zoom")
    await zoom.selectOption("2")
    await expect(zoom).toHaveValue("2")
  })

  test("shows the thumbnails panel with the current page marked", async ({
    page,
  }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    const panel = page.getByRole("complementary", {
      name: "Miniaturas de páginas",
    })
    await expect(panel).toBeVisible()
    await expect(panel.locator("canvas").first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(panel.locator("[data-thumb-active='true']")).toContainText("1")
  })

  test("navigates by clicking a thumbnail and keeps the active marker", async ({
    page,
  }) => {
    await setAuthCookie(page, userId)
    await page.goto(`/read/${pdfBookId}`)

    const panel = page.getByRole("complementary", {
      name: "Miniaturas de páginas",
    })
    await expect(panel.locator("canvas").first()).toBeVisible({
      timeout: 20_000,
    })
    await panel.getByLabel("Página 4").click()
    await expect(page.getByLabel("Ir a página")).toHaveValue("4")
    await expect(panel.locator("[data-thumb-active='true']")).toContainText("4")
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

  test("applies the saved font size and keeps the theme after toggling flow", async ({
    page,
  }) => {
    await setAuthCookie(page, userId)
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark")
      localStorage.setItem(
        "viewer-settings",
        JSON.stringify({ fontSize: 130, epubFlow: "paginated" })
      )
    })
    await page.goto(`/read/${epubBookId}`)
    const frame = page.frameLocator(".epub-viewer iframe").first()
    await expect(frame.locator("h1")).toBeVisible({ timeout: 20_000 })

    const readBodyStyle = () =>
      page.evaluate(() => {
        const doc = document.querySelector<HTMLIFrameElement>(".epub-viewer iframe")
          ?.contentDocument
        if (!doc?.body) return null
        return {
          bg: doc.defaultView!.getComputedStyle(doc.body).backgroundColor,
          fontSize: doc.body.style.fontSize,
        }
      })

    await expect.poll(readBodyStyle).toEqual({ bg: "rgb(17, 19, 24)", fontSize: "130%" })

    await page.getByRole("button", { name: /Modo de lectura/ }).click()
    await expect(frame.locator("h1")).toBeVisible({ timeout: 20_000 })
    await expect.poll(readBodyStyle).toEqual({ bg: "rgb(17, 19, 24)", fontSize: "130%" })
  })
})