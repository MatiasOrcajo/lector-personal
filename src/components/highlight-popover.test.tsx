import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HighlightPopover } from "./highlight-popover"

function renderPopover(onSelect = vi.fn(), onClose = vi.fn()) {
  render(
    <HighlightPopover x={300} y={500} onSelect={onSelect} onClose={onClose} />
  )
  return { onSelect, onClose }
}

describe("HighlightPopover", () => {
  it("renders the five highlight colors", () => {
    renderPopover()
    expect(screen.getByLabelText("Resaltar en amarillo")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en verde")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en azul")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en rosa")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en naranja")).toBeInTheDocument()
  })

  it("calls onSelect with the chosen color", async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPopover()
    await user.click(screen.getByLabelText("Resaltar en azul"))
    expect(onSelect).toHaveBeenCalledWith("blue")
  })

  it("closes with the close button", async () => {
    const user = userEvent.setup()
    const { onClose } = renderPopover()
    await user.click(screen.getByLabelText("Cerrar"))
    expect(onClose).toHaveBeenCalled()
  })

  it("closes on Escape", () => {
    const { onClose } = renderPopover()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("closes on click outside", () => {
    const { onClose } = renderPopover()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it("does not close on right-click outside (keeps text selection for copy)", () => {
    const { onClose } = renderPopover()
    fireEvent.mouseDown(document.body, { button: 2 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("is placed above the selection when there is room", () => {
    render(
      <HighlightPopover x={300} y={500} bottom={520} onSelect={vi.fn()} onClose={vi.fn()} />
    )
    const toolbar = screen.getByRole("toolbar", { name: "Resaltar selección" })
    expect(parseFloat(toolbar.style.top)).toBeLessThan(500)
  })

  it("moves below the selection when it would not fit above", () => {
    render(
      <HighlightPopover x={300} y={20} bottom={40} onSelect={vi.fn()} onClose={vi.fn()} />
    )
    const toolbar = screen.getByRole("toolbar", { name: "Resaltar selección" })
    expect(parseFloat(toolbar.style.top)).toBeGreaterThanOrEqual(40)
  })

  it("stays inside the viewport horizontally", () => {
    render(
      <HighlightPopover x={window.innerWidth} y={500} onSelect={vi.fn()} onClose={vi.fn()} />
    )
    const toolbar = screen.getByRole("toolbar", { name: "Resaltar selección" })
    expect(parseFloat(toolbar.style.left)).toBeLessThan(window.innerWidth - 200)
  })
})