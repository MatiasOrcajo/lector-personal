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
    expect(screen.getByLabelText("Resaltar en yellow")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en green")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en blue")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en pink")).toBeInTheDocument()
    expect(screen.getByLabelText("Resaltar en orange")).toBeInTheDocument()
  })

  it("calls onSelect with the chosen color", async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPopover()
    await user.click(screen.getByLabelText("Resaltar en blue"))
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
})