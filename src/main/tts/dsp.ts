// Xử lý âm thanh cho TTS: đo cao độ (F0), đổi cao độ giữ nguyên thời lượng (WSOLA + resample),
// chuẩn hoá biên độ, ghi WAV PCM 16-bit mono. Không dùng thư viện ngoài.

/** Cao độ trung vị (Hz) của các khung có tiếng — thuật toán YIN. null nếu không đo được. */
export function medianF0(x: Float32Array, sr: number, maxSeconds = 12): number | null {
  const W = Math.round(sr * 0.04)
  const hop = Math.round(sr * 0.02)
  const minLag = Math.floor(sr / 450)
  const maxLag = Math.ceil(sr / 60)
  const end = Math.min(x.length, Math.round(sr * maxSeconds)) - W - maxLag - 2
  const found: number[] = []
  const d = new Float32Array(maxLag + 2)
  for (let s = 0; s < end; s += hop) {
    let e = 0
    for (let i = 0; i < W; i++) e += x[s + i] * x[s + i]
    if (e / W < 2e-4) continue // khung lặng
    // Hàm hiệu bình phương + chuẩn hoá trung bình tích luỹ (CMNDF)
    let run = 0
    let lagFound = 0
    for (let t = 1; t <= maxLag + 1; t++) {
      let a = 0
      for (let i = 0; i < W; i++) {
        const q = x[s + i] - x[s + i + t]
        a += q * q
      }
      run += a
      d[t] = run > 0 ? (a * t) / run : 1
    }
    for (let t = minLag; t <= maxLag; t++) {
      if (d[t] < 0.15) {
        while (t + 1 <= maxLag && d[t + 1] < d[t]) t++
        lagFound = t
        break
      }
    }
    if (lagFound) found.push(sr / lagFound)
  }
  if (found.length < 5) return null
  found.sort((a, b) => a - b)
  return found[Math.floor(found.length / 2)]
}

/** WSOLA: kéo giãn thời lượng (ratio = độ dài ra / độ dài vào) mà không đổi cao độ. */
export function timeStretch(x: Float32Array, ratio: number): Float32Array {
  const outLen = Math.round(x.length * ratio)
  if (Math.abs(ratio - 1) < 1e-3 || x.length < 2048) return x.slice()
  const N = 512
  const Hs = N / 2
  const Ha = Hs / ratio
  const tol = 128
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
  const out = new Float32Array(outLen + N)
  const norm = new Float32Array(outLen + N)
  const at = (i: number): number => (i >= 0 && i < x.length ? x[i] : 0)
  let prev = 0
  for (let k = 0; ; k++) {
    const outPos = k * Hs
    if (outPos >= outLen) break
    const nominal = Math.round(k * Ha)
    let pos = nominal
    if (k > 0) {
      const natural = prev + Hs
      let bestC = -Infinity
      const lo = Math.max(0, nominal - tol)
      const hi = Math.min(x.length - 1, nominal + tol)
      for (let p = lo; p <= hi; p++) {
        let c = 0
        for (let i = 0; i < N; i += 4) c += at(p + i) * at(natural + i)
        if (c > bestC) {
          bestC = c
          pos = p
        }
      }
    }
    for (let i = 0; i < N; i++) {
      out[outPos + i] += at(pos + i) * win[i]
      norm[outPos + i] += win[i]
    }
    prev = pos
  }
  const res = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0
  return res
}

function lowPass(x: Float32Array, cutoff: number): Float32Array {
  // FIR windowed-sinc, cutoff = tỉ lệ so với tần số lấy mẫu (0..0.5)
  const taps = 63
  const half = (taps - 1) / 2
  const h = new Float32Array(taps)
  let sum = 0
  for (let i = 0; i < taps; i++) {
    const n = i - half
    const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1))
    h[i] = sinc * w
    sum += h[i]
  }
  for (let i = 0; i < taps; i++) h[i] /= sum
  const y = new Float32Array(x.length)
  for (let n = 0; n < x.length; n++) {
    let acc = 0
    for (let i = 0; i < taps; i++) {
      const j = n + i - half
      if (j >= 0 && j < x.length) acc += x[j] * h[i]
    }
    y[n] = acc
  }
  return y
}

/** Đọc tín hiệu với bước `factor` (>1 = nhanh hơn / cao hơn), nội suy Catmull-Rom. */
export function resample(x: Float32Array, factor: number): Float32Array {
  if (Math.abs(factor - 1) < 1e-3) return x
  const src = factor > 1 ? lowPass(x, 0.48 / factor) : x
  const outLen = Math.floor(src.length / factor)
  const y = new Float32Array(outLen)
  const at = (i: number): number => src[Math.min(src.length - 1, Math.max(0, i))]
  for (let n = 0; n < outLen; n++) {
    const p = n * factor
    const i = Math.floor(p)
    const t = p - i
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    y[n] = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  }
  return y
}

/** Đổi cao độ ×pitch và tốc độ ×speed (độ dài ra = độ dài vào / speed). */
export function pitchAndSpeed(x: Float32Array, pitch: number, speed: number): Float32Array {
  if (Math.abs(pitch - 1) < 1e-3 && Math.abs(speed - 1) < 1e-3) return x
  return resample(timeStretch(x, pitch / speed), pitch)
}

export function normalizePeak(x: Float32Array, target = 0.9): void {
  let peak = 0
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]))
  if (peak < 1e-4) return
  const g = target / peak
  for (let i = 0; i < x.length; i++) x[i] *= g
}

export function encodeWav(x: Float32Array, sr: number): Buffer {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0, 'ascii')
  b.writeUInt32LE(36 + x.length * 2, 4)
  b.write('WAVE', 8, 'ascii')
  b.write('fmt ', 12, 'ascii')
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(sr, 24)
  b.writeUInt32LE(sr * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36, 'ascii')
  b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]))
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return b
}
