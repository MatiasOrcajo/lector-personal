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
import { Button } from "@/components/ui/button"
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
  DialogFooter,
} from "@/components/ui/dialog"
import { BookCover } from "@/components/book-cover"
import { deleteBook, renameBook, moveBookToFolder } from "@/app/actions/library"

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
  const [renameValue, setRenameValue] = useState(displayTitle ?? title)
  const [error, setError] = useState<string | null>(null)

  const shownTitle = displayTitle ?? title

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBook(id)
      if (result.error) setError(result.error)
    })
  }

  function handleRename() {
    const trimmed = renameValue.trim()
    if (!trimmed) return
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
      <Card size="sm">
        <div className="relative">
          <BookCover
            id={id}
            title={shownTitle}
            format={format}
            coverUrl={coverUrl}
            blobUrl={blobUrl}
          />
          <div className="absolute right-1 top-1">
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
                  onClick={() => {
                    setRenameValue(displayTitle ?? title)
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
                  onClick={handleDelete}
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
          <CardTitle className="truncate text-sm">{shownTitle}</CardTitle>
          <CardDescription className="uppercase text-xs">
            {format}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/read/${id}`}>
            <Button variant="outline" size="sm" className="w-full">
              Leer
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar</DialogTitle>
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
    </>
  )
}
