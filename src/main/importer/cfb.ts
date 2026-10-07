// Đọc file OLE / Compound File Binary (định dạng chứa của Office 97-2003: .doc .xls .ppt, và file Office mới có mật khẩu).
// Chỉ cần đọc stream theo tên (WordDocument, 1Table, Workbook, PowerPoint Document...), không ghi.
export class OfficeError extends Error {}

export const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

const END = 0xfffffffe
const FREE = 0xffffffff

export interface Cfb {
  streams: Map<string, Buffer> // tên stream (giữ nguyên hoa/thường) → nội dung; chỉ lấy stream ở mọi cấp, tên trùng lấy cái đầu
}

export function isCfb(buf: Buffer): boolean {
  return buf.length >= 512 && buf.subarray(0, 8).equals(CFB_MAGIC)
}

export function readCfb(buf: Buffer): Cfb {
  if (!isCfb(buf)) throw new OfficeError('Không phải file Office 97-2003')
  const bad = (): never => {
    throw new OfficeError('File Office 97-2003 hỏng')
  }
  const shift = buf.readUInt16LE(0x1e)
  const miniShift = buf.readUInt16LE(0x20)
  if (shift !== 9 && shift !== 12) bad()
  const secSize = 1 << shift
  const miniSize = 1 << miniShift
  const nFat = buf.readUInt32LE(0x2c)
  const firstDir = buf.readUInt32LE(0x30)
  const cutoff = buf.readUInt32LE(0x38)
  const firstMiniFat = buf.readUInt32LE(0x3c)
  let difatSec = buf.readUInt32LE(0x44)
  const maxSec = Math.floor((buf.length - secSize) / secSize) + 1
  const secOff = (n: number): number => (n + 1) * secSize

  // DIFAT: 109 mục trong header + các sector DIFAT nối tiếp
  const fatSecs: number[] = []
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(buf.readUInt32LE(0x4c + i * 4))
  for (let guard = 0; fatSecs.length < nFat && difatSec !== END && difatSec !== FREE; guard++) {
    if (guard > maxSec || difatSec >= maxSec) bad()
    const o = secOff(difatSec)
    const per = secSize / 4 - 1
    for (let i = 0; i < per && fatSecs.length < nFat; i++) fatSecs.push(buf.readUInt32LE(o + i * 4))
    difatSec = buf.readUInt32LE(o + per * 4)
  }
  const fat = new Uint32Array(fatSecs.length * (secSize / 4))
  fatSecs.forEach((s, i) => {
    if (s >= maxSec) bad()
    const o = secOff(s)
    for (let j = 0; j < secSize / 4; j++) fat[i * (secSize / 4) + j] = buf.readUInt32LE(o + j * 4)
  })

  const chain = (start: number, table: Uint32Array, limit: number): number[] => {
    const out: number[] = []
    for (let s = start; s !== END && s !== FREE; s = table[s]) {
      if (s >= limit || out.length > limit) bad()
      out.push(s)
    }
    return out
  }
  const readChain = (start: number, size?: number): Buffer => {
    const parts = chain(start, fat, Math.min(fat.length, maxSec)).map((s) => buf.subarray(secOff(s), secOff(s) + secSize))
    const all = Buffer.concat(parts)
    return size === undefined ? all : all.subarray(0, size)
  }

  const dir = readChain(firstDir)
  const entries: { name: string; type: number; start: number; size: number }[] = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = Math.min(64, dir.readUInt16LE(o + 0x40))
    const name = dir.toString('utf16le', o, o + Math.max(0, nameLen - 2))
    entries.push({ name, type: dir[o + 0x42], start: dir.readUInt32LE(o + 0x74), size: dir.readUInt32LE(o + 0x78) })
  }
  const root = entries[0]
  if (!root || root.type !== 5) bad()
  const miniStream = readChain(root.start, root.size)
  const miniFat = firstMiniFat === END || firstMiniFat === FREE ? new Uint32Array(0) : (() => {
    const b = readChain(firstMiniFat)
    const t = new Uint32Array(b.length / 4)
    for (let i = 0; i < t.length; i++) t[i] = b.readUInt32LE(i * 4)
    return t
  })()

  const streams = new Map<string, Buffer>()
  for (const e of entries.slice(1)) {
    if (e.type !== 2 || streams.has(e.name)) continue
    if (e.size < cutoff) {
      const parts = chain(e.start, miniFat, miniFat.length).map((s) => miniStream.subarray(s * miniSize, (s + 1) * miniSize))
      streams.set(e.name, Buffer.concat(parts).subarray(0, e.size))
    } else streams.set(e.name, readChain(e.start, e.size))
  }
  return { streams }
}

// Số trang trong "\x05SummaryInformation" (PIDSI_PAGECOUNT = 14) — Word ghi khi lưu.
export function summaryPageCount(cfb: Cfb): number | null {
  const s = cfb.streams.get('\x05SummaryInformation')
  if (!s || s.length < 48) return null
  try {
    const sec = s.readUInt32LE(44)
    const count = s.readUInt32LE(sec + 4)
    for (let i = 0; i < count && i < 256; i++) {
      const id = s.readUInt32LE(sec + 8 + i * 8)
      const off = sec + s.readUInt32LE(sec + 12 + i * 8)
      if (id === 14 && s.readUInt16LE(off) === 3) return s.readInt32LE(off + 4) || null
    }
  } catch {
    /* property set hỏng → không có số trang */
  }
  return null
}
