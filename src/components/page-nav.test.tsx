import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PageNav } from "./page-nav"

function renderNav(overrides: {
  currentPage?: number
  totalPages?: number | null
  onNavigate?: (page: number) => void
} = {}) {
  const onNavigate = overrides.onNavigate ?? vi.fn()
  render(
    <PageNav
      currentPage={overrides.currentPage ?? 3}
      totalPages={"totalPages" in overrides ? (overrides.totalPages ?? null) : 10}
      onNavigate={onNavigate}
    />
  )
  return onNavigate
}

describe("PageNav", () => {
  it("shows the current page and the total", () => {
    renderNav({ currentPage: 3, totalPages: 10 })
    expect(screen.getByLabelText("Ir a página")).toHaveValue("3")
    expect(screen.getByText("/ 10")).toBeInTheDocument()
  })

  it("shows a placeholder total when totalPages is null", () => {
    renderNav({ totalPages: null })
    expect(screen.getByText(/\/ \u2014/)).toBeInTheDocument()
  })

  it("disables previous on the first page and next on the last page", () => {
    renderNav({ currentPage: 1, totalPages: 1 })
    expect(screen.getByLabelText("Página anterior")).toBeDisabled()
    expect(screen.getByLabelText("Página siguiente")).toBeDisabled()
  })

  it("enables navigation in the middle of the book", () => {
    renderNav({ currentPage: 3, totalPages: 10 })
    expect(screen.getByLabelText("Página anterior")).toBeEnabled()
    expect(screen.getByLabelText("Página siguiente")).toBeEnabled()
  })

  it("navigates with the prev/next buttons", () => {
    const onNavigate = renderNav({ currentPage: 3, totalPages: 10 })
    fireEvent.click(screen.getByLabelText("Página anterior"))
    expect(onNavigate).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByLabelText("Página siguiente"))
    expect(onNavigate).toHaveBeenCalledWith(4)
  })

  it("navigates to a valid page typed in the input on blur", async () => {
    const user = userEvent.setup()
    const onNavigate = renderNav({ currentPage: 3, totalPages: 10 })
    const input = screen.getByLabelText("Ir a página")
    await user.clear(input)
    await user.type(input, "7")
    fireEvent.blur(input)
    expect(onNavigate).toHaveBeenCalledWith(7)
  })

  it("does not navigate when the typed page is out of range and resets the input", async () => {
    const user = userEvent.setup()
    const onNavigate = renderNav({ currentPage: 3, totalPages: 10 })
    const input = screen.getByLabelText("Ir a página")
    await user.clear(input)
    await user.type(input, "99")
    fireEvent.blur(input)
    expect(onNavigate).not.toHaveBeenCalled()
    expect(input).toHaveValue("3")
  })

  it("does not navigate when the typed page equals the current page", async () => {
    const user = userEvent.setup()
    const onNavigate = renderNav({ currentPage: 3, totalPages: 10 })
    const input = screen.getByLabelText("Ir a página")
    await user.clear(input)
    await user.type(input, "3")
    fireEvent.blur(input)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("commits navigation on Enter", async () => {
    const user = userEvent.setup()
    const onNavigate = renderNav({ currentPage: 3, totalPages: 10 })
    const input = screen.getByLabelText("Ir a página")
    await user.clear(input)
    await user.type(input, "5{Enter}")
    expect(onNavigate).toHaveBeenCalledWith(5)
  })
})