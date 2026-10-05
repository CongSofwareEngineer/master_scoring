// Sinh icon ứng dụng (PNG + ICO) bằng Node thuần, không cần thư viện ảnh.
// Thiết kế: nền vuông bo góc gradient Primary → AI, ký hiệu < ✓ > màu trắng.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')
mkdirSync(outDir, { recursive: true })

const C1 = [0x63, 0x66, 0xf1] // #6366F1
const C2 = [0x8b, 0x5c, 0xf6] // #8B5CF6

const strokes = [
  [[0.31, 0.35], [0.19, 0.5], [0.31, 0.65]],
  [[0.69, 0.35], [0.81, 0.5], [0.69, 0.65]],
  [[0.385, 0.515], [0.47, 0.6], [0.625, 0.4]]
]

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function roundRectSdf(px, py, half, r) {
  const qx = Math.abs(px - 0.5) - half + r
  const qy = Math.abs(py - 0.5) - half + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

const clamp = (v) => Math.max(0, Math.min(1, v))

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const aa = 1 / size
  const sw = 0.042
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size
      const bg = clamp(0.5 - roundRectSdf(u, v, 0.46, 0.11) / aa)
      const g = clamp((u + v) / 2)
      let r = C1[0] + (C2[0] - C1[0]) * g
      let gg = C1[1] + (C2[1] - C1[1]) * g
      let b = C1[2] + (C2[2] - C1[2]) * g
      let d = 1e9
      for (const s of strokes) {
        for (let i = 0; i < s.length - 1; i++) {
          d = Math.min(d, distSeg(u, v, s[i][0], s[i][1], s[i + 1][0], s[i + 1][1]))
        }
      }
      const fg = clamp(0.5 - (d - sw) / aa)
      r = r + (255 - r) * fg
      gg = gg + (255 - gg) * fg
      b = b + (255 - b) * fg
      const o = (y * size + x) * 4
      px[o] = Math.round(r)
      px[o + 1] = Math.round(gg)
      px[o + 2] = Math.round(b)
      px[o + 3] = Math.round(bg * 255)
    }
  }
  return px
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const raw = render(size)
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0
    raw.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function ico(sizes) {
  const images = sizes.map((s) => png(s))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = 6 + 16 * sizes.length
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s
    e[1] = s >= 256 ? 0 : s
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(images[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += images[i].length
    return e
  })
  return Buffer.concat([header, ...entries, ...images])
}

writeFileSync(join(outDir, 'icon.png'), png(512))
writeFileSync(join(outDir, 'icon.ico'), ico([256, 64, 48, 32, 24, 16]))
console.log('[icons] build/icon.png, build/icon.ico')
