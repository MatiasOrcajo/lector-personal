import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReturnButton } from "./return-button"

describe("ReturnButton", () => {
  it("renders nothing when not visible", () => {
    render(<ReturnButton visible={false} onReturn={vi.fn()} />)
    expect(
      screen.queryByText("Volver a la página anterior")
    ).not.toBeInTheDocument()
  })

  it("renders the button when visible", () => {
    render(<ReturnButton visible={true} onReturn={vi.fn()} />)
    expect(
      screen.getByText("Volver a la página anterior")
    ).toBeInTheDocument()
  })

  it("calls onReturn when clicked", async () => {
    const user = userEvent.setup()
    const onReturn = vi.fn()
    render(<ReturnButton visible={true} onReturn={onReturn} />)
    await user.click(screen.getByText("Volver a la página anterior"))
    expect(onReturn).toHaveBeenCalledTimes(1)
  })
})