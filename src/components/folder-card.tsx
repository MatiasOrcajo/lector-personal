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
    startTransition(async () => {
      const result = await renameFolder(id, trimmed)
      if (result.error) {
        setError(result.error)
      } else {
        setRenameOpen(false)
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteFolder(id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      <div className="relative">
        <Link href={`/?folder=${id}`} className="block">
          <div className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 transition-colors hover:bg-muted/50">
            <Folder className="size-12 text-muted-foreground" />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">
              {bookCount} {bookCount === 1 ? "libro" : "libros"}
            </span>
          </div>
        </Link>
        <div className="absolute right-1 top-1 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="bg-background/80 hover:bg-background"
                />
              }
            >
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setRenameValue(name)
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
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename()
            }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter showCloseButton>
            <Button onClick={handleRename} disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar carpeta</DialogTitle>
            <DialogDescription>
              {bookCount > 0
                ? `Esta carpeta contiene ${bookCount} ${bookCount === 1 ? "libro" : "libros"}. Al eliminarla se borraran todos los archivos.`
                : `Seguro que quieres eliminar "${name}"?`}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
