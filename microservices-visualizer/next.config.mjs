import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from parent directory (HackGT12 root)
config({ path: resolve(process.cwd(), '../.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    OPENAI_KEY: process.env.OPENAI_KEY,
  },
}

export default nextConfig
