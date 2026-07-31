import { redirect } from "next/navigation"
import { BookOpen } from "lucide-react"
import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { signInWithGoogle } from "@/app/actions/auth"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) {
    redirect("/")
  }

  const { callbackUrl } = await searchParams

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center gap-2">
        <BookOpen className="size-6 text-primary" />
        <h1 className="text-xl font-semibold">Lector Personal</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Inicia sesión para acceder a tu biblioteca
      </p>
      <form action={signInWithGoogle.bind(null, callbackUrl)}>
        <Button size="lg">
          Iniciar sesión con Google
        </Button>
      </form>
    </div>
  )
}
