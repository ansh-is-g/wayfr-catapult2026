import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "wayfr Simulator",
  description:
    "A lightweight robotics-style simulator demo built from wayfr's real 3D home annotations and object maps.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
