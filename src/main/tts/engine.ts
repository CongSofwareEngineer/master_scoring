// Tổng hợp giọng nói: văn bản → (chuẩn hoá, tách đoạn) → model VITS ONNX (onnxruntime-node) → ghép đoạn + khoảng lặng
// → đổi cao độ theo giọng Nam / Nữ / Trẻ em → WAV.
import { readFileSync } from 'fs'
import { join } from 'path'
import { TTS_MAX_CHARS, TTS_VOICES } from '@shared/constants'
import type { TtsRequest, TtsResult } from '@shared/types'
import { encodeWav, medianF0, normalizePeak, pitchAndSpeed } from './dsp'
import { installedSource, ttsModelDef, ttsModelDir } from './models'
import { normalizeVietnamese, splitSegments } from './text'

type Ort = typeof import('onnxruntime-node')

interface Loaded {
  modelId: string
  session: import('onnxruntime-node').InferenceSession
  vocab: Record<string, number>
  blankId: number
  addBlank: boolean
  sampleRate: number
}

let ortMod: Ort | null = null
let loaded: Loaded | null = null
let busy: Promise<unknown> = Promise.resolve()
const cancelled = new Set<number>()

async function ort(): Promise<Ort> {
  if (ortMod) return ortMod
  try {
    const m: any = await import('onnxruntime-node')
    ortMod = (m.default ?? m) as Ort
    return ortMod
  } catch (e: any) {
    throw new Error(
      `Không nạp được bộ chạy ONNX (onnxruntime-node) trên máy này (${process.platform}/${process.arch}): ${e?.message ?? e}`
    )
  }
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

async function load(modelId: string): Promise<Loaded> {
  if (loaded?.modelId === modelId) return loaded
  ttsModelDef(modelId)
  if (!installedSource(modelId)) throw new Error('Model chưa được tải — bấm Tải ở danh sách model')
  const dir = ttsModelDir(modelId)
  const vocab = readJson(join(dir, 'vocab.json')) as Record<string, number> | null
  if (!vocab) throw new Error('Model thiếu vocab.json — hãy tải lại model')
  const cfg = readJson(join(dir, 'config.json')) ?? {}
  const tok = readJson(join(dir, 'tokenizer_config.json')) ?? {}
  if (tok.is_uroman || tok.phonemize) {
    throw new Error('Model này cần chuyển chữ sang phiên âm (uroman / phonemizer) — app chưa hỗ trợ')
  }
  const o = await ort()
  await unloadTts()
  const session = await o.InferenceSession.create(join(dir, 'model.onnx'), { graphOptimizationLevel: 'all' })
  if (!session.inputNames.includes('input_ids')) {
    await session.release().catch(() => {})
    throw new Error('File ONNX không phải model VITS (không có đầu vào input_ids)')
  }
  const padToken = typeof tok.pad_token === 'string' ? tok.pad_token : tok.pad_token?.content
  loaded = {
    modelId,
    session,
    vocab,
    blankId: padToken && padToken in vocab ? vocab[padToken] : 0,
    addBlank: tok.add_blank !== false,
    sampleRate: Number(cfg.sampling_rate) || 16000
  }
  return loaded
}

export async function unloadTts(modelId?: string): Promise<void> {
  if (!loaded || (modelId && loaded.modelId !== modelId)) return
  const s = loaded.session
  loaded = null
  await s.release().catch(() => {})
}

function tokenize(m: Loaded, text: string, skipped: Set<string>): number[] {
  const ids: number[] = []
  let lastSpace = true
  for (const ch of text.normalize('NFC').toLowerCase()) {
    const isSpace = /\s/.test(ch)
    if (isSpace) {
      if (!lastSpace && ' ' in m.vocab) ids.push(m.vocab[' '])
      lastSpace = true
      continue
    }
    if (ch in m.vocab) {
      ids.push(m.vocab[ch])
      lastSpace = false
    } else if (/[\p{L}\d]/u.test(ch)) skipped.add(ch)
  }
  while (ids.length && ids[ids.length - 1] === m.vocab[' ']) ids.pop()
  if (!m.addBlank) return ids
  const out = [m.blankId]
  for (const id of ids) out.push(id, m.blankId)
  return out
}

async function runModel(m: Loaded, ids: number[]): Promise<Float32Array> {
  const o = await ort()
  const feeds: Record<string, import('onnxruntime-node').Tensor> = {
    input_ids: new o.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length])
  }
  if (m.session.inputNames.includes('attention_mask')) {
    feeds.attention_mask = new o.Tensor('int64', new BigInt64Array(ids.length).fill(1n), [1, ids.length])
  }
  const out = await m.session.run(feeds)
  const name = m.session.outputNames.includes('waveform') ? 'waveform' : m.session.outputNames[0]
  return Float32Array.from(out[name].data as Float32Array)
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r))

export function cancelTts(userId: number): void {
  cancelled.add(userId)
}

export function synthesize(
  userId: number,
  req: TtsRequest,
  onProgress: (done: number, total: number) => void
): Promise<TtsResult> {
  // Chạy tuần tự (1 phiên ONNX dùng chung)
  const job = busy.then(() => doSynthesize(userId, req, onProgress))
  busy = job.catch(() => {})
  return job
}

async function doSynthesize(userId: number, req: TtsRequest, onProgress: (done: number, total: number) => void): Promise<TtsResult> {
  cancelled.delete(userId)
  const t0 = Date.now()
  const text = String(req.text ?? '')
  if (!text.trim()) throw new Error('Chưa nhập văn bản')
  if (text.length > TTS_MAX_CHARS) throw new Error(`Văn bản quá dài (tối đa ${TTS_MAX_CHARS} ký tự)`)
  const voice = TTS_VOICES[req.voice]
  if (!voice) throw new Error('Giọng không hợp lệ')
  const speed = Math.min(2, Math.max(0.5, Number(req.speed) || 1))
  const semis = Math.min(6, Math.max(-6, Number(req.pitch) || 0))

  const m = await load(String(req.modelId))
  const segments = splitSegments(normalizeVietnamese(text))
  const skipped = new Set<string>()
  const parts: { audio: Float32Array; pause: number }[] = []
  for (let i = 0; i < segments.length; i++) {
    if (cancelled.has(userId)) throw new Error('Đã dừng.')
    onProgress(i, segments.length)
    const ids = tokenize(m, segments[i].text, skipped)
    if (ids.length <= 1) continue
    parts.push({ audio: await runModel(m, ids), pause: segments[i].pauseAfter })
  }
  if (!parts.length) throw new Error('Văn bản không có chữ nào model đọc được')

  // Đo cao độ giọng gốc trên vài đoạn đầu → một hệ số cho cả bài (giọng đồng đều giữa các câu)
  const sr = m.sampleRate
  const probeLen = Math.min(parts.reduce((s, p) => s + p.audio.length, 0), sr * 12)
  const probe = new Float32Array(probeLen)
  let off = 0
  for (const p of parts) {
    if (off >= probeLen) break
    const n = Math.min(p.audio.length, probeLen - off)
    probe.set(p.audio.subarray(0, n), off)
    off += n
  }
  const baseF0 = medianF0(probe, sr)
  const fallback = req.voice === 'male' ? 0.75 : req.voice === 'child' ? 1.5 : 1.1
  const base = baseF0 ? Math.min(voice.max, Math.max(voice.min, voice.targetF0 / baseF0)) : fallback
  const pitchFactor = base * Math.pow(2, semis / 12)
  const finalSpeed = voice.speed * speed

  const processed: Float32Array[] = []
  let total = 0
  for (const p of parts) {
    if (cancelled.has(userId)) throw new Error('Đã dừng.')
    await tick()
    const a = pitchAndSpeed(p.audio, pitchFactor, finalSpeed)
    const silence = new Float32Array(Math.round((p.pause / finalSpeed) * sr))
    processed.push(a, silence)
    total += a.length + silence.length
  }
  onProgress(segments.length, segments.length)
  const lead = Math.round(sr * 0.1)
  const all = new Float32Array(total + lead)
  let pos = lead
  for (const a of processed) {
    all.set(a, pos)
    pos += a.length
  }
  normalizePeak(all)
  const wav = encodeWav(all, sr)
  return {
    wav: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength),
    sampleRate: sr,
    durationSec: all.length / sr,
    elapsedMs: Date.now() - t0,
    segments: parts.length,
    baseF0: baseF0 ? Math.round(baseF0) : null,
    pitchFactor: Math.round(pitchFactor * 100) / 100,
    skipped: [...skipped].slice(0, 30)
  }
}
