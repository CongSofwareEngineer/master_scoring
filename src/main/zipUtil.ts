// Giải nén zip cho runtime (llama-server, MinGW) — không dùng cho bài nộp sinh viên (xem importer/extract.ts).
import { createWriteStream, mkdirSync } from 'fs'
import { dirname, join, normalize, sep } from 'path'
import yauzl from 'yauzl'

export function extractZip(
  zipPath: string,
  destDir: string,
  opts: { flatten?: boolean; stripPrefix?: boolean; onProgress?: (done: number, total: number) => void } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err)
      const total = zip.entryCount
      let done = 0
      let prefix: string | null = null
      zip.readEntry()
      zip.on('entry', (entry: yauzl.Entry) => {
        done++
        opts.onProgress?.(done, total)
        let name = entry.fileName.replace(/\\/g, '/')
        if (opts.stripPrefix) {
          const first = name.split('/')[0] + '/'
          if (prefix === null) prefix = first
          if (name.startsWith(prefix)) name = name.slice(prefix.length)
        }
        if (!name || name.endsWith('/')) return zip.readEntry()
        if (opts.flatten) name = name.split('/').pop()!
        const out = normalize(join(destDir, name))
        if (!out.startsWith(normalize(destDir) + sep)) return zip.readEntry() // chặn zip-slip
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e)
          mkdirSync(dirname(out), { recursive: true })
          rs.pipe(createWriteStream(out))
            .on('finish', () => zip.readEntry())
            .on('error', reject)
        })
      })
      zip.on('end', () => resolve())
      zip.on('error', reject)
    })
  })
}
