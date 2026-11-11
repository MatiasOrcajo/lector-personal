import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReaderHeader } from "./reader-header"
import { ThemeProvider } from "./theme-provider"

function renderHeader(overrides: {
  title?: string
  currentPage?: number
  totalPages?: number | null
  onNavigate?: (page: number) => void
  onToggleSidebar?: () => void
  children?: React.ReactNode
} = {}) {
  const onNavigate = overrides.onNavigate ?? vi.fn()
  const onToggleSidebar = overrides.onToggleSidebar ?? vi.fn()
  render(
    <ThemeProvider>
      <ReaderHeader
        title={overrides.title ?? "Mi Libro"}
        currentPage={overrides.currentPage ?? 1}
        totalPages={overrides.totalPages ?? 20}
        onNavigate={onNavigate}
        onToggleSidebar={onToggleSidebar}
      >
        {overrides.children}
      </ReaderHeader>
    </ThemeProvider>
  )
  return { onNavigate, onToggleSidebar }
}

describe("ReaderHeader", () => {
  it("renders the title, back link and page navigation", () => {
    renderHeader()
    expect(screen.getByRole("heading", { name: "Mi Libro" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/")
    expect(screen.getByLabelText("Ir a página")).toHaveValue("1")
    expect(screen.getByText("/ 20")).toBeInTheDocument()
  })

  it("renders format-specific controls passed as children", () => {
    renderHeader({ children: <button type="button">Zoom</button> })
    expect(screen.getByRole("button", { name: "Zoom" })).toBeInTheDocument()
  })

  it("toggles the sidebar from the highlights button", async () => {
    const user = userEvent.setup()
    const { onToggleSidebar } = renderHeader()
    await user.click(screen.getByRole("button", { name: "Resaltados" }))
    expect(onToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it("navigates pages from the shared PageNav", async () => {
    const user = userEvent.setup()
    const { onNavigate } = renderHeader({ currentPage: 5, totalPages: 20 })
    await user.click(screen.getByLabelText("Página anterior"))
    expect(onNavigate).toHaveBeenCalledWith(4)
    await user.click(screen.getByLabelText("Página siguiente"))
    expect(onNavigate).toHaveBeenCalledWith(6)
  })

  it("shows the theme toggle with the three modes", () => {
    renderHeader()
    expect(screen.getByTitle("Claro")).toBeInTheDocument()
    expect(screen.getByTitle("Oscuro")).toBeInTheDocument()
    expect(screen.getByTitle("Intermedio")).toBeInTheDocument()
  })

  it("offers a compact theme button that cycles modes (mobile)", async () => {
    const user = userEvent.setup()
    renderHeader()
    const cycle = screen.getByRole("button", { name: /^Tema: Claro/ })
    await user.click(cycle)
    expect(screen.getByRole("button", { name: /^Tema: Oscuro/ })).toBeInTheDocument()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("shows the full title on hover when truncated", () => {
    renderHeader({ title: "Un título muy largo" })
    expect(screen.getByRole("heading", { name: "Un título muy largo" })).toHaveAttribute(
      "title",
      "Un título muy largo"
    )
  })
})