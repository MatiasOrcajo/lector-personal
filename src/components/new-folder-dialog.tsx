"use client"

import { useState, useTransition } from "react"
import { FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { createFolder } from "@/app/actions/library"
import { TEXT_INPUT_CLASS } from "@/lib/utils"

export function NewFolderDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createFolder(trimmed)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setName("")
        setError(null)
      }
    })
  }

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-label="Nueva carpeta"
      >
        <FolderPlus className="size-4" />
        <span className="hidden sm:inline">Nueva carpeta</span>
        <span className="sm:hidden">Carpeta</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva carpeta</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCreate()
            }}
            className="grid gap-4"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la carpeta"
              aria-label="Nombre de la carpeta"
              className={TEXT_INPUT_CLASS}
              maxLength={100}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter showCloseButton>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
