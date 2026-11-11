"use client"

import { useState, useTransition } from "react"
import { MoreVertical, Trash2, Pencil, FolderInput } from "lucide-react"
import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
import { BookCover } from "@/components/book-cover"
import { deleteBook, renameBook, moveBookToFolder } from "@/app/actions/library"
import { TEXT_INPUT_CLASS } from "@/lib/utils"

type Folder = { id: string; name: string }

type BookCardProps = {
  id: string
  title: string
  displayTitle: string | null
  format: string
  coverUrl: string | null
  blobUrl: string
  folderId: string | null
  folders: Folder[]
}

export function BookCard({
  id,
  title,
  displayTitle,
  format,
  coverUrl,
  blobUrl,
  folderId,
  folders,
}: BookCardProps) {
  const [isPending, startTransition] = useTransition()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(displayTitle ?? title)
  const [error, setError] = useState<string | null>(null)

  const shownTitle = displayTitle ?? title

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBook(id)
      if (result.error) {
        setError(result.error)
      } else {
        setDeleteOpen(false)
      }
    })
  }

  function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    if (trimmed === shownTitle) {
      setRenameOpen(false)
      return
    }
    startTransition(async () => {
      const result = await renameBook(id, trimmed)
      if (result.error) {
        setError(result.error)
      } else {
        setRenameOpen(false)
      }
    })
  }

  function handleMove(targetFolderId: string | null) {
    startTransition(async () => {
      const result = await moveBookToFolder(id, targetFolderId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      <Card size="sm" className={isPending ? "opacity-60 transition-opacity" : undefined}>
        <div className="relative">
          {/* La portada también abre el libro: antes solo el botón "Leer". */}
          <Link href={`/read/${id}`} aria-label={`Leer ${shownTitle}`} tabIndex={-1}>
            <BookCover
              id={id}
              title={shownTitle}
              format={format}
              coverUrl={coverUrl}
              blobUrl={blobUrl}
            />
          </Link>
          <div className="absolute right-1 top-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="bg-background/80 shadow-xs hover:bg-background"
                    aria-label={`Opciones de ${shownTitle}`}
                  />
                }
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(shownTitle)
                    setError(null)
                    setRenameOpen(true)
                  }}
                  disabled={isPending}
                >
                  <Pencil />
                  Renombrar
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isPending}>
                    <FolderInput />
                    Mover
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {folderId && (
                      <DropdownMenuItem onClick={() => handleMove(null)}>
                        Sin carpeta
                      </DropdownMenuItem>
                    )}
                    {folders
                      .filter((f) => f.id !== folderId)
                      .map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => handleMove(f.id)}
                        >
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    {folders.length === 0 && !folderId && (
                      <DropdownMenuItem disabled>
                        No hay carpetas
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
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
        <CardHeader>
          <CardTitle className="truncate text-sm" title={shownTitle}>
            {shownTitle}
          </CardTitle>
          <CardDescription className="uppercase text-xs">
            {format}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/read/${id}`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
          >
            Leer
          </Link>
          {error && !renameOpen && !deleteOpen && (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar</DialogTitle>
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
              aria-label="Nuevo nombre"
              maxLength={300}
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

      {/* Antes "Eliminar" borraba el libro (archivo y resaltados) sin confirmar. */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar libro</DialogTitle>
            <DialogDescription>
              Se eliminará &ldquo;{shownTitle}&rdquo; junto con sus resaltados.
              Esta acción no se puede deshacer.
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
