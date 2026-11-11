"use client"

import { useState, useTransition } from "react"
import { Folder, MoreVertical, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { renameFolder, deleteFolder } from "@/app/actions/library"
import { TEXT_INPUT_CLASS } from "@/lib/utils"

type FolderCardProps = {
  id: string
  name: string
  bookCount: number
}

export function FolderCard({ id, name, bookCount }: FolderCardProps) {
  const [isPending, startTransition] = useTransition()
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(name)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    if (trimmed === name) {
      setRenameOpen(false)
      return
    }
    startTransition(async () => {
      const result = await renameFolder(id, trimmed)
      if (result.error) {
        setError(result.error)
      } else {
        setRenameOpen(false)
      }
    })
  }

  function handleDelete(deleteBooks: boolean) {
    startTransition(async () => {
      const result = await deleteFolder(id, { deleteBooks })
      if (result.error) {
        setError(result.error)
      } else {
        setDeleteOpen(false)
      }
    })
  }

  const booksLabel = `${bookCount} ${bookCount === 1 ? "libro" : "libros"}`

  return (
    <>
      <div className={isPending ? "relative opacity-60 transition-opacity" : "relative"}>
        <Link href={`/?folder=${id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <div className="group flex items-center gap-3 rounded-xl bg-muted/30 py-3 pl-4 pr-10 transition-colors hover:bg-muted/50">
            <Folder className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={name}>{name}</p>
              <p className="text-xs text-muted-foreground">{booksLabel}</p>
            </div>
          </div>
        </Link>
        <div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-background"
                  aria-label={`Opciones de la carpeta ${name}`}
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setRenameValue(name)
                  setError(null)
                  setRenameOpen(true)
                }}
                disabled={isPending}
              >
                <Pencil />
                Renombrar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setError(null)
                  setDeleteOpen(true)
                }}
                disabled={isPending}
              >
                <Trash2 />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar carpeta</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleRename()
            }}
            className="grid gap-4"
          >
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className={TEXT_INPUT_CLASS}
              aria-label="Nombre de la carpeta"
              maxLength={100}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter showCloseButton>
              <Button type="submit" disabled={isPending || !renameValue.trim()}>
                {isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar carpeta</DialogTitle>
            <DialogDescription>
              {bookCount > 0
                ? `"${name}" contiene ${booksLabel}. Puedes eliminar solo la carpeta (los libros vuelven a la biblioteca) o eliminarla junto con sus libros.`
                : `¿Seguro que quieres eliminar "${name}"?`}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter showCloseButton>
            {bookCount > 0 && (
              <Button
                variant="destructive"
                onClick={() => handleDelete(true)}
                disabled={isPending}
              >
                Eliminar carpeta y libros
              </Button>
            )}
            <Button
              variant={bookCount > 0 ? "default" : "destructive"}
              onClick={() => handleDelete(false)}
              disabled={isPending}
            >
              {isPending
                ? "Eliminando..."
                : bookCount > 0
                  ? "Eliminar solo la carpeta"
                  : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
