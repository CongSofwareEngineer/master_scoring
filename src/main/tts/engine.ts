// Tổng hợp giọng nói: văn bản → (chuẩn hoá, tách đoạn) → model ONNX (onnxruntime-node) → ghép đoạn + khoảng lặng
// → đổi cao độ theo giọng Nam / Nữ / Trẻ em → WAV.
// Hai định dạng model: VITS transformers.js (chữ cái → vocab.json) và Piper (chữ → phiên âm IPA → phoneme_id_map).
import { readFileSync } from 'fs'
import { join } from 'path'
import { TTS_MAX_CHARS, TTS_VOICES } from '@shared/constants'
import type { TtsRequest, TtsResult, TtsSpeaker, TtsVoice } from '@shared/types'
import { encodeWav, medianF0, normalizePeak, pitchAndSpeed } from './dsp'
import { installedSource, ttsModelDef, ttsModelDir, ttsSpeakers } from './models'
import { vietnameseToIpa } from './phonemize'
import { normalizeVietnamese, splitSegments } from './text'

type Ort = typeof import('onnxruntime-node')

interface LoadedBase {
  modelId: string
  session: import('onnxruntime-node').InferenceSession
  sampleRate: number
}
interface LoadedVits extends LoadedBase {
  format: 'vits'
  vocab: Record<string, number>
  blankId: number
  addBlank: boolean
}
interface LoadedPiper extends LoadedBase {
  format: 'piper'
  idMap: Record<string, number[]>
  noiseScale: number
  lengthScale: number
  noiseW: number
  speakers: TtsSpeaker[]
}
type Loaded = LoadedVits | LoadedPiper

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
  const src = installedSource(modelId)
  if (!src) throw new Error('Model chưa được tải — bấm Tải ở danh sách model')
  if (src.format === 'piper') return loadPiper(modelId)
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
    format: 'vits',
    modelId,
    session,
    vocab,
    blankId: padToken && padToken in vocab ? vocab[padToken] : 0,
    addBlank: tok.add_blank !== false,
    sampleRate: Number(cfg.sampling_rate) || 16000
  }
  return loaded
}

async function loadPiper(modelId: string): Promise<Loaded> {
  const dir = ttsModelDir(modelId)
  const cfg = readJson(join(dir, 'piper.json'))
  if (!cfg?.phoneme_id_map) throw new Error('Model Piper thiếu file cấu hình (piper.json) — hãy tải lại model')
  const type = String(cfg.phoneme_type ?? 'espeak')
  const voice = String(cfg.espeak?.voice ?? '')
  if (type !== 'espeak' || (voice && !voice.startsWith('vi'))) {
    throw new Error(`Model Piper này không phải giọng tiếng Việt đọc phiên âm espeak (phoneme_type=${type}, voice=${voice || '?'}) — app chưa hỗ trợ`)
  }
  const o = await ort()
  await unloadTts()
  const session = await o.InferenceSession.create(join(dir, 'model.onnx'), { graphOptimizationLevel: 'all' })
  if (!session.inputNames.includes('input') || !session.inputNames.includes('scales')) {
    await session.release().catch(() => {})
    throw new Error('File ONNX không phải model Piper (thiếu đầu vào input / scales)')
  }
  const inf = cfg.inference ?? {}
  loaded = {
    format: 'piper',
    modelId,
    session,
    sampleRate: Number(cfg.audio?.sample_rate) || 22050,
    idMap: cfg.phoneme_id_map,
    noiseScale: Number(inf.noise_scale ?? 0.667),
    lengthScale: Number(inf.length_scale ?? 1),
    noiseW: Number(inf.noise_w ?? 0.8),
    speakers: ttsSpeakers(modelId)
  }
  return loaded
}

export async function unloadTts(modelId?: string): Promise<void> {
  if (!loaded || (modelId && loaded.modelId !== modelId)) return
  const s = loaded.session
  loaded = null
  await s.release().catch(() => {})
}

function tokenize(m: LoadedVits, text: string, skipped: Set<string>): number[] {
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

async function runModel(m: LoadedVits, ids: number[]): Promise<Float32Array> {
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

/** Phiên âm → id kiểu Piper: ^ _ (id _)* $ (xen ký hiệu pad "_" sau mỗi ký hiệu). */
function piperIds(m: LoadedPiper, ipa: string): number[] {
  const map = m.idMap
  const pad = map['_']?.[0] ?? 0
  const ids = [...(map['^'] ?? [1]), pad]
  for (const ch of ipa) {
    const v = map[ch]
    if (v) ids.push(...v, pad)
  }
  ids.push(...(map['$'] ?? [2]))
  return ids
}

async function runPiper(m: LoadedPiper, ids: number[], speaker: number | null, speed: number): Promise<Float32Array> {
  const o = await ort()
  const feeds: Record<string, import('onnxruntime-node').Tensor> = {
    input: new o.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]),
    input_lengths: new o.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    // tốc độ đổi trực tiếp trong model (length_scale) — tự nhiên hơn giãn thời gian bằng DSP
    scales: new o.Tensor('float32', Float32Array.from([m.noiseScale, m.lengthScale / speed, m.noiseW]), [3])
  }
  if (m.session.inputNames.includes('sid')) {
    feeds.sid = new o.Tensor('int64', BigInt64Array.from([BigInt(speaker ?? 0)]), [1])
  }
  const out = await m.session.run(feeds)
  return Float32Array.from(out[m.session.outputNames[0]].data as Float32Array)
}

/** Người đọc: chọn tay (req.speaker) hoặc tự chọn theo giọng — Nam → người đọc nam, Nữ / Trẻ em → người đọc nữ. */
function pickSpeaker(speakers: TtsSpeaker[], voice: TtsVoice, wanted: unknown): TtsSpeaker | null {
  if (!speakers.length) return null
  const id = Number(wanted)
  if (wanted !== undefined && wanted !== null && Number.isInteger(id) && id >= 0) {
    const s = speakers.find((x) => x.id === id)
    if (s) return s
  }
  const gender = voice === 'male' ? 'male' : 'female'
  return speakers.find((s) => s.gender === gender) ?? speakers[0]
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
  const finalSpeed = voice.speed * speed
  const speaker = m.format === 'piper' ? pickSpeaker(m.speakers, req.voice, req.speaker) : null
  const segments = splitSegments(normalizeVietnamese(text))
  const skipped = new Set<string>()
  const parts: { audio: Float32Array; pause: number }[] = []
  for (let i = 0; i < segments.length; i++) {
    if (cancelled.has(userId)) throw new Error('Đã dừng.')
    onProgress(i, segments.length)
    const seg = segments[i]
    if (m.format === 'piper') {
      const ipa = vietnameseToIpa(seg.text, skipped)
      if (!ipa) continue
      const punct = seg.punct || (i === segments.length - 1 ? '.' : '')
      parts.push({ audio: await runPiper(m, piperIds(m, ipa + punct), speaker?.id ?? null, finalSpeed), pause: seg.pauseAfter })
    } else {
      const ids = tokenize(m, seg.text, skipped)
      if (ids.length <= 1) continue
      parts.push({ audio: await runModel(m, ids), pause: seg.pauseAfter })
    }
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
  // Người đọc thật đúng giới tính (model Piper nhiều giọng / có ghi giới tính) → giữ giọng gốc, không đổi cao độ
  const native = !!speaker?.gender && req.voice !== 'child' && speaker.gender === req.voice
  const base = native ? 1 : baseF0 ? Math.min(voice.max, Math.max(voice.min, voice.targetF0 / baseF0)) : fallback
  const pitchFactor = base * Math.pow(2, semis / 12)
  // Piper đã đổi tốc độ trong model → DSP chỉ đổi cao độ
  const dspSpeed = m.format === 'piper' ? 1 : finalSpeed

  const processed: Float32Array[] = []
  let total = 0
  for (const p of parts) {
    if (cancelled.has(userId)) throw new Error('Đã dừng.')
    await tick()
    const a = pitchAndSpeed(p.audio, pitchFactor, dspSpeed)
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
    skipped: [...skipped].slice(0, 30),
    speaker: speaker && m.format === 'piper' && m.speakers.length > 1 ? speaker.name : null
  }
}
