import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  experimental: {
    optimizePackageImports: ["three", "@react-three/fiber", "@react-three/drei"],
  },
}

export default nextConfig
