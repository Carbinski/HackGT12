import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const CACHE_DIR = path.join(process.cwd(), '.cache', 'cdk-scans')

export async function GET(_req: NextRequest) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    const files = await fs.readdir(CACHE_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    if (jsonFiles.length === 0) {
      return NextResponse.json({ error: 'no cached scans' }, { status: 404 })
    }

    // Pick newest by mtime
    const stats = await Promise.all(
      jsonFiles.map(async f => ({ name: f, stat: await fs.stat(path.join(CACHE_DIR, f)) }))
    )
    stats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())
    const newest = stats[0].name
    const cacheKey = path.basename(newest, '.json')
    const content = await fs.readFile(path.join(CACHE_DIR, newest), 'utf-8')
    const parsed = JSON.parse(content)
    return NextResponse.json({ ...parsed, cacheKey })
  } catch (err) {
    return NextResponse.json({ error: 'failed to read cache', details: String(err) }, { status: 500 })
  }
}

