"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import type { ComponentProps, ReactNode } from "react"

type Props = ComponentProps<typeof ClerkProvider> & { children: ReactNode }

export function ClerkGate({ children, ...clerkProps }: Props) {
  const pathname = usePathname()

  if (pathname.startsWith("/capture/")) {
    return <>{children}</>
  }

  return <ClerkProvider {...clerkProps}>{children}</ClerkProvider>
}
