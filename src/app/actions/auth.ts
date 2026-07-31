"use server"

import { signIn, signOut } from "@/auth"

export async function signInWithGoogle(callbackUrl?: string) {
  const target =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/"

  await signIn("google", { redirectTo: target })
}

export async function logOut() {
  await signOut({ redirectTo: "/login" })
}
