import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PdfThumbnails } from "./pdf-thumbnails"

vi.mock("react-pdf", () => ({
  Page: () => <div data-testid="thumb-page" />,
}))

const pageSizes = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 612, height: 792 },
]

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver)
})

function renderThumbs(overrides: {
  currentPage?: number
  onNavigate?: (page: number) => void
} = {}) {
  const onNavigate = overrides.onNavigate ?? vi.fn()
  render(
    <PdfThumbnails
      pageSizes={pageSizes}
      currentPage={overrides.currentPage ?? 1}
      onNavigate={onNavigate}
    />
  )
  return { onNavigate }
}

describe("PdfThumbnails", () => {
  it("renders a thumbnail per page with its number", () => {
    renderThumbs()
    expect(screen.getAllByTestId("thumb-page")).toHaveLength(4)
    for (let page = 1; page <= 4; page++) {
      expect(
        screen.getByRole("button", { name: `Página ${page}` })
      ).toBeInTheDocument()
      expect(screen.getByText(String(page))).toBeInTheDocument()
    }
  })

  it("marks the current page by default", () => {
    renderThumbs({ currentPage: 3 })
    const active = screen.getByRole("button", { name: "Página 3" })
    expect(active).toHaveAttribute("data-thumb-active", "true")
    expect(active).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByRole("button", { name: "Página 1" })
    ).not.toHaveAttribute("data-thumb-active")
  })

  it("navigates to the page when a thumbnail is clicked", async () => {
    const user = userEvent.setup()
    const { onNavigate } = renderThumbs({ currentPage: 2 })
    await user.click(screen.getByRole("button", { name: "Página 4" }))
    expect(onNavigate).toHaveBeenCalledWith(4)
  })
})