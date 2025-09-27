import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const SCAN_DIR = path.join(process.cwd(), '.cache', 'cdk-scans')
const REVIEW_DIR = path.join(process.cwd(), '.cache', 'ai-reviews')

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const cacheKey = params.key
  // Basic key validation (hex md5 typical)
  if (!/^[a-fA-F0-9]{16,64}$/.test(cacheKey)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  }

  const reviewPath = path.join(REVIEW_DIR, `${cacheKey}.json`)
  const scanPath = path.join(SCAN_DIR, `${cacheKey}.json`)

  try {
    const reviewStat = await fs.stat(reviewPath)
    if (reviewStat.isFile()) {
      const content = await fs.readFile(reviewPath, 'utf-8')
      const review = JSON.parse(content)
      return NextResponse.json({ status: 'ready', cacheKey, review })
    }
  } catch {}

  // Not ready; determine if pending or unknown
  try {
    const scanStat = await fs.stat(scanPath)
    if (scanStat.isFile()) {
      return NextResponse.json({ status: 'pending', cacheKey })
    }
  } catch {}

  return NextResponse.json({ status: 'not_found', cacheKey }, { status: 404 })
}

export async function POST(_req: NextRequest, { params }: { params: { key: string } }) {
  const cacheKey = params.key
  if (!/^[a-fA-F0-9]{16,64}$/.test(cacheKey)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 })
  }

  const scanPath = path.join(SCAN_DIR, `${cacheKey}.json`)
  const reviewPath = path.join(REVIEW_DIR, `${cacheKey}.json`)

  try {
    await fs.access(scanPath)
  } catch {
    return NextResponse.json({ error: 'unknown key' }, { status: 404 })
  }

  await fs.mkdir(REVIEW_DIR, { recursive: true })

  // If review already exists, return ready
  try {
    await fs.access(reviewPath)
    const content = await fs.readFile(reviewPath, 'utf-8')
    return NextResponse.json({ status: 'ready', cacheKey, review: JSON.parse(content) })
  } catch {}

  try {
    const reviewerPath = path.join(process.cwd(), 'backend', 'architecture_reviewer.py')
    const openaiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''
    const { spawn } = await import('child_process')
    const args = ['--in', scanPath, '--out', reviewPath]
    if (openaiKey) args.push('--openai-key', openaiKey)
    const child = spawn('python3', [reviewerPath, ...args], {
      stdio: 'ignore',
      env: { ...process.env, OPENAI_KEY: openaiKey },
      detached: true,
    })
    child.unref()
    return NextResponse.json({ status: 'started', cacheKey })
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}
