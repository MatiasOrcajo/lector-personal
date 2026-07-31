import { BookOpen } from "lucide-react"
import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/prisma"

export async function BookGrid({ userId }: { userId: string }) {
  const books = await prisma.book.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="size-12 text-muted-foreground/40" />
        <p className="mt-4 text-lg text-muted-foreground">
          Your library is empty
        </p>
        <p className="text-sm text-muted-foreground/60">
          Upload a PDF or EPUB to get started
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {books.map((book) => (
        <Card key={book.id} size="sm">
          <CardHeader>
            <CardTitle className="truncate text-sm">{book.title}</CardTitle>
            <CardDescription className="uppercase text-xs">
              {book.format}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/read/${book.id}`}>
              <Button variant="outline" size="sm" className="w-full">
                Read
              </Button>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
