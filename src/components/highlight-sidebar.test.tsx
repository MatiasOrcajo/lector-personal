import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HighlightSidebar } from "./highlight-sidebar"
import type { ReaderHighlight } from "@/lib/reader-types"

const highlights: ReaderHighlight[] = [
  {
    id: "h1",
    text: "Un resaltado de ejemplo",
    color: "yellow",
    pageLabel: "Página 4",
    location: "epubcfi(/6/4)",
  },
  {
    id: "h2",
    text: "Otro resaltado largo que supera los 120 caracteres para verificar el truncado del texto en la barra lateral de resaltados.",
    color: "blue",
    pageLabel: "Página 9",
    location: "page:9",
  },
]

function renderSidebar(overrides: {
  open?: boolean
  highlights?: ReaderHighlight[]
  onNavigate?: (h: ReaderHighlight) => void
  onDelete?: (h: ReaderHighlight) => void
} = {}) {
  const onNavigate = overrides.onNavigate ?? vi.fn()
  const onDelete = overrides.onDelete ?? vi.fn()
  render(
    <HighlightSidebar
      open={overrides.open ?? true}
      highlights={overrides.highlights ?? highlights}
      onClose={vi.fn()}
      onNavigate={onNavigate}
      onDelete={onDelete}
    />
  )
  return { onNavigate, onDelete }
}

describe("HighlightSidebar", () => {
  it("renders nothing when closed", () => {
    renderSidebar({ open: false })
    expect(screen.queryByText("Mis Resaltados")).not.toBeInTheDocument()
  })

  it("shows the empty state when there are no highlights", () => {
    renderSidebar({ highlights: [] })
    expect(
      screen.getByText("No hay resaltados. Selecciona texto y elige un color.")
    ).toBeInTheDocument()
  })

  it("renders the highlights with text and page label", () => {
    renderSidebar()
    expect(screen.getByText("Un resaltado de ejemplo")).toBeInTheDocument()
    expect(screen.getByText("Página 4")).toBeInTheDocument()
    expect(screen.getByText("Página 9")).toBeInTheDocument()
  })

  it("truncates texts longer than 120 characters", () => {
    renderSidebar()
    expect(
      screen.getByText(/Otro resaltado largo que supera los 120 caracteres.*…/)
    ).toBeInTheDocument()
  })

  it("navigates when a highlight is clicked", async () => {
    const user = userEvent.setup()
    const { onNavigate } = renderSidebar()
    await user.click(screen.getByText("Un resaltado de ejemplo"))
    expect(onNavigate).toHaveBeenCalledWith(highlights[0])
  })

  it("deletes when the trash button is clicked", async () => {
    const user = userEvent.setup()
    const { onDelete } = renderSidebar()
    const deleteButtons = screen.getAllByLabelText("Eliminar resaltado")
    await user.click(deleteButtons[0])
    expect(onDelete).toHaveBeenCalledWith(highlights[0])
  })

  it("does not navigate when the highlight has no location", async () => {
    const user = userEvent.setup()
    const { onNavigate } = renderSidebar({
      highlights: [
        { id: "h3", text: "Sin ubicacion", color: "green", pageLabel: null, location: "" },
      ],
    })
    await user.click(screen.getByText("Sin ubicacion"))
    expect(onNavigate).not.toHaveBeenCalled()
  })
})