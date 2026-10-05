// Tính điểm trừ do dùng AI theo chính sách của assignment (dùng chung main + renderer).
import { CONFIDENCE_LABEL, CONFIDENCE_RANK, DEFAULT_AI_POLICY, round2 } from './constants'
import type { AiEstimate, AiPenalty, AiPolicy } from './types'

export function normalizePolicy(p: Partial<AiPolicy> | undefined): AiPolicy {
  const base = { ...DEFAULT_AI_POLICY, ...(p ?? {}) }
  const tiers = (Array.isArray(base.tiers) ? base.tiers : [])
    .map((t) => ({
      minPercent: Math.max(0, Math.min(100, Math.round(Number(t.minPercent) || 0))),
      deduct: Math.max(0, Math.min(10, round2(Number(t.deduct) || 0)))
    }))
    .filter((t) => t.deduct > 0)
    .sort((a, b) => a.minPercent - b.minPercent)
  return {
    penaltyMode: ['off', 'suggest', 'auto'].includes(base.penaltyMode) ? base.penaltyMode : 'auto',
    tiers,
    minConfidence: base.minConfidence in CONFIDENCE_RANK ? base.minConfidence : 'medium'
  }
}

/**
 * prev: điểm trừ đã lưu. Nếu giáo viên đã quyết định (decidedBy = 'teacher') thì giữ quyết định áp / không áp,
 * chỉ cập nhật số điểm theo % mới.
 */
export function evaluatePenalty(policy: AiPolicy, est: AiEstimate | undefined | null, prev: AiPenalty | null): AiPenalty | null {
  if (!est || policy.penaltyMode === 'off') return null
  const tier = [...policy.tiers].reverse().find((t) => est.aiPercent >= t.minPercent) ?? null
  const deduct = tier?.deduct ?? 0
  const confOk = CONFIDENCE_RANK[est.confidence] >= CONFIDENCE_RANK[policy.minConfidence]
  let note: string
  if (!tier) note = `AI ~${est.aiPercent}% — dưới ngưỡng trừ điểm`
  else if (policy.penaltyMode === 'suggest') note = `AI ~${est.aiPercent}% ≥ ${tier.minPercent}% → đề xuất trừ ${deduct} điểm (giáo viên quyết định)`
  else if (!confOk)
    note = `AI ~${est.aiPercent}% ≥ ${tier.minPercent}% nhưng độ tin cậy ${CONFIDENCE_LABEL[est.confidence]} < ${CONFIDENCE_LABEL[policy.minConfidence]} → chỉ đề xuất trừ ${deduct} điểm`
  else note = `AI ~${est.aiPercent}% ≥ ${tier.minPercent}% → trừ ${deduct} điểm`
  const byPolicy = policy.penaltyMode === 'auto' && deduct > 0 && confOk
  const teacher = prev?.decidedBy === 'teacher'
  if (teacher && deduct > 0) note = prev!.applied ? `Giáo viên quyết định trừ ${deduct} điểm (AI ~${est.aiPercent}%)` : `Giáo viên bỏ trừ điểm (AI ~${est.aiPercent}%)`
  return {
    aiPercent: est.aiPercent,
    confidence: est.confidence,
    tierPercent: tier?.minPercent ?? null,
    deduct,
    applied: deduct > 0 && (teacher ? prev!.applied : byPolicy),
    decidedBy: teacher ? 'teacher' : 'policy',
    note
  }
}
