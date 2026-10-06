import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  FolderOpen,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X
} from 'lucide-react'
import { evaluatePenalty } from '@shared/aiPolicy'
import { AUTO_PROFILE_ID, CLOUD_PROVIDERS, DEFAULT_AI_POLICY } from '@shared/constants'
import type { AiConfidence, AiEstimate, AiPenaltyMode, AiPolicy, Assignment, CloudProvider, Criterion, ScanSummary, StudentRow, TestCase } from '@shared/types'
import { call, on } from '../lib/api'
import { cls, uid } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { resetAndRegrade } from '../components/AssignmentFilter'
import { RubricEditor } from '../components/RubricEditor'
import { confirmDialog, Empty, Field, Modal, Switch } from '../components/ui'

type Tab = 'info' | 'rubric' | 'tests' | 'ai' | 'submissions'

export function AssignmentsPage(): JSX.Element {
  const t = useT()
  const assignments = useStore((s) => s.assignments)
  const currentId = useStore((s) => s.currentAssignmentId)
  const setCurrent = useStore((s) => s.setCurrentAssignment)
  const params = useStore((s) => s.params)
  const [creating, setCreating] = useState(params.tab === 'new' || assignments.length === 0)

  useEffect(() => {
    if (params.tab === 'new') setCreating(true)
  }, [params])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Assignments')}</div>
          <div className="meta mt-8">Tạo bài tập, chọn công nghệ, rubric, test case và folder bài nộp</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> {t('Tạo assignment')}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="card flush" style={{ padding: 6 }}>
          {assignments.length === 0 && <div className="meta" style={{ padding: 10 }}>Chưa có assignment</div>}
          {assignments.map((a) => (
            <div
              key={a.id}
              className={cls('list-row clickable', a.id === currentId && !creating && 'active')}
              style={a.id === currentId && !creating ? { background: 'var(--primary-soft)' } : undefined}
              onClick={() => {
                setCreating(false)
                setCurrent(a.id)
              }}
            >
              <div className="grow">
                <div className="truncate" style={{ fontWeight: 500 }}>
                  {a.name}
                </div>
                <div className="meta truncate">
                  {a.className || '—'} · {useStore.getState().profiles.find((p) => p.id === a.profileId)?.name ?? a.profileId}
                  {a.backend === 'cloud' && ' · Cloud'}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          {creating ? (
            <CreateAssignment
              onCreated={(a) => {
                setCreating(false)
                setCurrent(a.id)
              }}
              onCancel={assignments.length ? () => setCreating(false) : undefined}
            />
          ) : currentId ? (
            <AssignmentEditor key={currentId} id={currentId} initialTab={(params.tab as Tab) || 'info'} />
          ) : (
            <Empty title="Chọn một assignment" />
          )}
        </div>
      </div>
    </div>
  )
}

function CreateAssignment({ onCreated, onCancel }: { onCreated: (a: Assignment) => void; onCancel?: () => void }): JSX.Element {
  const t = useT()
  const profiles = useStore((s) => s.profiles)
  const loadAssignments = useStore((s) => s.loadAssignments)
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? 'cpp')
  const create = async (): Promise<void> => {
    const profile = profiles.find((p) => p.id === profileId)
    const a = await attempt(
      () => call<Assignment>('assign:save', { name: name.trim(), className: className.trim(), profileId, rubric: profile?.rubric ?? [] }),
      'Đã tạo assignment'
    )
    if (a) {
      await loadAssignments()
      onCreated(a)
    }
  }
  return (
    <div className="card">
      <div className="card-header">
        <span className="section-title">{t('Tạo assignment')}</span>
        {onCancel && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="form-grid">
        <Field label="Tên assignment">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Lab 3 – Android Login" autoFocus />
        </Field>
        <Field label="Lớp">
          <input className="input" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="VD: ST4 Ca 2" />
        </Field>
        <Field
          label="Loại công nghệ (Tech Profile)"
          hint={
            profileId === AUTO_PROFILE_ID
              ? 'Mỗi bài nộp được nhận diện công nghệ riêng. Rubric chung được điền sẵn, chỉnh sửa được.'
              : 'Rubric mẫu của profile được điền sẵn, chỉnh sửa được. Không nhận diện công nghệ khi chấm.'
          }
        >
          <select className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row mt-16">
        <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>
          <Plus size={15} /> Tạo
        </button>
      </div>
    </div>
  )
}

function AssignmentEditor({ id, initialTab }: { id: number; initialTab: Tab }): JSX.Element {
  const t = useT()
  const assignments = useStore((s) => s.assignments)
  const loadAssignments = useStore((s) => s.loadAssignments)
  const go = useStore((s) => s.go)
  const ai = useStore((s) => s.ai)
  const original = assignments.find((a) => a.id === id)!
  const [draft, setDraft] = useState<Assignment>(original)
  const [tab, setTab] = useState<Tab>(['info', 'rubric', 'tests', 'ai', 'submissions'].includes(initialTab) ? initialTab : 'info')
  const [canStart, setCanStart] = useState<{ ok: boolean; reason?: string }>({ ok: false })
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original])

  useEffect(() => setDraft(original), [original])
  const refreshCanStart = (): void => void call<{ ok: boolean; reason?: string }>('queue:canStart', id).then(setCanStart).catch(() => {})
  useEffect(refreshCanStart, [id, original, ai])
  useEffect(() => on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === id && refreshCanStart()), [id])

  const patch = (p: Partial<Assignment>): void => setDraft({ ...draft, ...p })
  const save = async (): Promise<boolean> => {
    const r = await attempt(() => call<Assignment>('assign:save', draft), 'Đã lưu')
    if (r) await loadAssignments()
    return !!r
  }
  const remove = async (): Promise<void> => {
    if (!(await confirmDialog(`Xoá assignment "${original.name}" cùng toàn bộ kết quả chấm? (File zip bài nộp không bị xoá)`, { danger: true, okLabel: 'Xoá' }))) return
    await attempt(() => call('assign:delete', id), 'Đã xoá assignment')
    await loadAssignments()
  }
  const start = async (): Promise<void> => {
    if (dirty && !(await save())) return
    const r = await attempt(() => call('queue:start', id, [], 'remaining'))
    if (r) go('queue')
  }
  const reset = async (): Promise<void> => {
    if (dirty && !(await save())) return
    if (await resetAndRegrade(original, t)) go('queue')
  }

  return (
    <div className="card">
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="section-title truncate">{original.name}</div>
          <div className="meta">{original.className}</div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={remove} title="Xoá assignment">
            <Trash2 size={14} />
          </button>
          <button className="btn" disabled={!dirty} onClick={save}>
            <Save size={14} /> Lưu{dirty ? ' *' : ''}
          </button>
          <button className="btn" disabled={!canStart.ok} title={canStart.reason ?? t('Xoá kết quả chấm cũ và chấm lại cả lớp')} onClick={reset}>
            <RotateCcw size={14} /> {t('Reset & chấm lại')}
          </button>
          <button className="btn btn-primary" disabled={!canStart.ok} title={canStart.reason} onClick={start}>
            <Play size={14} /> Bắt đầu chấm
          </button>
        </div>
      </div>
      {!canStart.ok && canStart.reason && (
        <div className="callout warning mb-12">
          <AlertTriangle size={16} />
          <span>Chưa thể chấm: {canStart.reason}</span>
        </div>
      )}
      <div className="tabs">
        {(
          [
            ['info', 'Thông tin chung'],
            ['rubric', 'Rubric'],
            ['tests', 'Test case'],
            ['ai', 'Chính sách AI'],
            ['submissions', 'Bài nộp']
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={cls('tab', tab === k && 'active')} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'info' && <InfoTab draft={draft} patch={patch} />}
      {tab === 'rubric' && <RubricTab draft={draft} patch={patch} />}
      {tab === 'tests' && <TestsTab draft={draft} patch={patch} />}
      {tab === 'ai' && <AiPolicyTab draft={draft} patch={patch} />}
      {tab === 'submissions' && <SubmissionsTab assignment={original} onBeforeAction={async () => (dirty ? save() : true)} />}
    </div>
  )
}

function InfoTab({ draft, patch }: { draft: Assignment; patch: (p: Partial<Assignment>) => void }): JSX.Element {
  const profiles = useStore((s) => s.profiles)
  const ai = useStore((s) => s.ai)
  const go = useStore((s) => s.go)
  const cloudOk = ai?.cloudConfigured.includes(draft.cloudProvider)
  return (
    <div className="col gap-16">
      <div className="form-grid">
        <Field label="Tên assignment">
          <input className="input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Lớp">
          <input className="input" value={draft.className} onChange={(e) => patch({ className: e.target.value })} />
        </Field>
        <Field label="Loại công nghệ">
          <select className="select" value={draft.profileId} onChange={(e) => patch({ profileId: e.target.value })}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngưỡng đạt (/10)" hint="Dùng để tính Pass Rate">
          <input
            className="input"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={draft.passThreshold}
            onChange={(e) => patch({ passThreshold: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Đề bài" hint="Dán đề bài để AI chấm tiêu chí “Đúng yêu cầu đề”.">
        <textarea
          className="textarea"
          rows={8}
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Dán nội dung đề bài ở đây..."
        />
      </Field>
      <div>
        <div className="label mb-8">Backend chấm</div>
        <div className="col gap-8">
          <label className="check">
            <input type="radio" checked={draft.backend === 'local'} onChange={() => patch({ backend: 'local' })} />
            Local AI (mặc định) — code sinh viên không rời khỏi máy
          </label>
          <label className="check">
            <input type="radio" checked={draft.backend === 'cloud'} onChange={() => patch({ backend: 'cloud', cloudConsent: false })} />
            Cloud AI — chỉ khi cần model mạnh hơn (project lớn, nhiều file)
          </label>
          {draft.backend === 'cloud' && (
            <div className="choice-card" style={{ marginLeft: 24 }}>
              <div className="form-grid">
                <Field label="Nhà cung cấp">
                  <select className="select" value={draft.cloudProvider} onChange={(e) => patch({ cloudProvider: e.target.value as CloudProvider, cloudConsent: false })}>
                    {(Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => (
                      <option key={p} value={p}>
                        {CLOUD_PROVIDERS[p].name}
                        {ai?.cloudConfigured.includes(p) ? ' ✓' : ' (chưa cấu hình)'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model" hint="Để trống = model mặc định đã lưu trong AI Models">
                  <input
                    className="input"
                    list="assign-cloud-models"
                    value={draft.cloudModel}
                    onChange={(e) => patch({ cloudModel: e.target.value })}
                    placeholder={CLOUD_PROVIDERS[draft.cloudProvider].defaultModel}
                  />
                  <datalist id="assign-cloud-models">
                    {CLOUD_PROVIDERS[draft.cloudProvider].models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Field>
              </div>
              {!cloudOk && (
                <div className="callout error mt-12">
                  <AlertTriangle size={16} />
                  <span>
                    Chưa cấu hình API key cho {CLOUD_PROVIDERS[draft.cloudProvider].name}. <a onClick={() => go('models')}>Mở AI Models</a>
                  </span>
                </div>
              )}
              <div className="callout warning mt-12">
                <AlertTriangle size={16} />
                <div className="col gap-8">
                  <span>Code của sinh viên trong assignment này sẽ được gửi tới máy chủ của nhà cung cấp (họ tên và MSSV được ẩn nếu bật trong Settings).</span>
                  <label className="check">
                    <input type="checkbox" checked={draft.cloudConsent} onChange={(e) => patch({ cloudConsent: e.target.checked })} />
                    <b>Tôi đồng ý</b>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AiPolicyTab({ draft, patch }: { draft: Assignment; patch: (p: Partial<Assignment>) => void }): JSX.Element {
  const policy: AiPolicy = draft.aiPolicy ?? DEFAULT_AI_POLICY
  const set = (p: Partial<AiPolicy>): void => patch({ aiPolicy: { ...policy, ...p } })
  const setTier = (i: number, p: Partial<AiPolicy['tiers'][number]>): void => set({ tiers: policy.tiers.map((t, k) => (k === i ? { ...t, ...p } : t)) })
  const [rows, setRows] = useState<StudentRow[]>([])
  useEffect(() => void call<StudentRow[]>('students:list', draft.id).then(setRows).catch(() => {}), [draft.id])
  // Xem trước: chính sách đang sửa áp lên các bài đã chấm
  const graded = rows.filter((r) => r.aiPercent !== null && r.aiConfidence !== null && (r.status === 'completed' || r.status === 'reviewed'))
  const preview = graded.map((r) => evaluatePenalty(policy, { aiPercent: r.aiPercent!, confidence: r.aiConfidence! } as AiEstimate, null))
  const applied = preview.filter((p) => p?.applied).length
  const suggested = preview.filter((p) => p && p.deduct > 0 && !p.applied).length
  const modes: [AiPenaltyMode, string, string][] = [
    ['auto', 'Tự động trừ', 'Bài vượt bậc và đủ độ tin cậy bị trừ ngay vào tổng điểm; giáo viên bỏ trừ được trong Code Review.'],
    ['suggest', 'Chỉ đề xuất', 'Hiện mức trừ đề xuất, giáo viên bấm "Áp trừ" từng bài.'],
    ['off', 'Không trừ điểm', 'Vẫn ước lượng và hiển thị % code AI, không trừ điểm.']
  ]
  return (
    <div className="col gap-16">
      <div className="callout ai">
        <Sparkles size={16} />
        <span>
          Mỗi bài được ước lượng <b>% code do AI viết</b> và <b>% sinh viên tự viết</b> (bỏ code khung, file IDE sinh sẵn). Đây là ước lượng thống kê, có thể sai —
          nên dùng độ tin cậy tối thiểu từ Trung bình và luôn xem lại các bài bị trừ trước khi công bố điểm.
        </span>
      </div>
      <div>
        <div className="label mb-8">Chế độ trừ điểm</div>
        <div className="col gap-8">
          {modes.map(([k, label, hint]) => (
            <label key={k} className="check" style={{ alignItems: 'flex-start' }}>
              <input type="radio" checked={policy.penaltyMode === k} onChange={() => set({ penaltyMode: k })} />
              <span>
                <b>{label}</b> <span className="meta">— {hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      {policy.penaltyMode !== 'off' && (
        <>
          <div>
            <div className="label mb-8">Bậc trừ điểm (áp bậc cao nhất mà bài đạt tới)</div>
            <div className="col gap-8" style={{ maxWidth: 460 }}>
              <div className="tier-row meta">
                <span>% code AI từ</span>
                <span>Trừ (điểm / 10)</span>
                <span />
              </div>
              {policy.tiers.map((t, i) => (
                <div key={i} className="tier-row">
                  <input className="input input-sm" type="number" min={0} max={100} step={5} value={t.minPercent} onChange={(e) => setTier(i, { minPercent: Number(e.target.value) })} />
                  <input className="input input-sm" type="number" min={0} max={10} step={0.25} value={t.deduct} onChange={(e) => setTier(i, { deduct: Number(e.target.value) })} />
                  <button className="btn btn-ghost btn-icon btn-sm" title="Xoá bậc" onClick={() => set({ tiers: policy.tiers.filter((_, k) => k !== i) })}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const last = policy.tiers[policy.tiers.length - 1]
                    set({ tiers: [...policy.tiers, { minPercent: Math.min(100, (last?.minPercent ?? 30) + 10), deduct: (last?.deduct ?? 0) + 1 }] })
                  }}
                >
                  <Plus size={13} /> Thêm bậc
                </button>
              </div>
              {policy.tiers.length > 0 && <div className="meta">Dưới {Math.min(...policy.tiers.map((t) => t.minPercent))}% code AI: không trừ điểm.</div>}
            </div>
          </div>
          {policy.penaltyMode === 'auto' && (
            <Field label="Chỉ tự động trừ khi độ tin cậy ước lượng ≥" hint="Bài ít code hoặc tín hiệu mơ hồ có độ tin cậy thấp → chỉ đề xuất, không tự trừ.">
              <select className="select" style={{ width: 200 }} value={policy.minConfidence} onChange={(e) => set({ minConfidence: e.target.value as AiConfidence })}>
                <option value="low">Thấp (trừ mọi bài vượt bậc)</option>
                <option value="medium">Trung bình (khuyến nghị)</option>
                <option value="high">Cao</option>
              </select>
            </Field>
          )}
          <div className="row gap-8">
            <button className="btn btn-sm btn-ghost" onClick={() => patch({ aiPolicy: DEFAULT_AI_POLICY })}>
              Khôi phục mặc định
            </button>
          </div>
        </>
      )}
      {graded.length > 0 && (
        <div className="callout info">
          <AlertTriangle size={16} />
          <span>
            Áp lên {graded.length} bài đã chấm: <b>{applied}</b> bài bị trừ tự động{suggested ? `, ${suggested} bài chỉ đề xuất trừ` : ''}. Lưu để cập nhật tổng điểm (bài
            giáo viên đã tự quyết định áp/bỏ trừ được giữ nguyên).
          </span>
        </div>
      )}
    </div>
  )
}

function RubricTab({ draft, patch }: { draft: Assignment; patch: (p: Partial<Assignment>) => void }): JSX.Element {
  const profiles = useStore((s) => s.profiles)
  const toast = useStore((s) => s.toast)
  const [templates, setTemplates] = useState<{ id: number; name: string; profileId: string; rubric: Criterion[] }[]>([])
  const [saveName, setSaveName] = useState<string | null>(null)
  const loadTemplates = (): void => void call('rubric:templates').then(setTemplates as any).catch(() => {})
  useEffect(loadTemplates, [])
  const profile = profiles.find((p) => p.id === draft.profileId)
  const apply = async (rubric: Criterion[]): Promise<void> => {
    if (draft.rubric.length && !(await confirmDialog('Thay rubric hiện tại bằng rubric mẫu?'))) return
    patch({ rubric: rubric.map((c) => ({ ...c })) })
  }
  return (
    <div className="col gap-12">
      <div className="row wrap">
        <span className="meta">Áp dụng mẫu:</span>
        {profile && (
          <button className="btn btn-sm" onClick={() => apply(profile.rubric)}>
            <ListChecks size={13} /> Rubric mẫu {profile.name}
          </button>
        )}
        {templates.length > 0 && (
          <select
            className="select input-sm"
            style={{ width: 220 }}
            value=""
            onChange={(e) => {
              const tpl = templates.find((x) => x.id === Number(e.target.value))
              if (tpl) void apply(tpl.rubric)
            }}
          >
            <option value="">Mẫu đã lưu…</option>
            {templates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
        )}
        <div className="grow" />
        <button className="btn btn-sm" onClick={() => setSaveName(draft.name + ' – rubric')}>
          <Save size={13} /> Lưu làm mẫu
        </button>
      </div>
      <div className="meta">
        Nguồn chấm: <b>Tự động</b> (compile/test/phân tích tĩnh — khách quan), <b>AI</b> (nhận xét của model), <b>Giáo viên</b> (chấm tay trong Code Review).
      </div>
      <RubricEditor value={draft.rubric} onChange={(rubric) => patch({ rubric })} />
      {saveName !== null && (
        <Modal
          title="Lưu rubric làm mẫu"
          onClose={() => setSaveName(null)}
          footer={
            <>
              <button className="btn" onClick={() => setSaveName(null)}>
                Huỷ
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await call('rubric:saveTemplate', saveName, draft.profileId, draft.rubric)
                  toast('Đã lưu rubric mẫu', 'success')
                  setSaveName(null)
                  loadTemplates()
                }}
              >
                Lưu
              </button>
            </>
          }
        >
          <Field label="Tên mẫu">
            <input className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  )
}

function TestsTab({ draft, patch }: { draft: Assignment; patch: (p: Partial<Assignment>) => void }): JSX.Element {
  const isC = draft.profileId === 'c' || draft.profileId === 'cpp'
  const update = (i: number, p: Partial<TestCase>): void => patch({ testCases: draft.testCases.map((tc, k) => (k === i ? { ...tc, ...p } : tc)) })
  return (
    <div className="col gap-12">
      {!isC && (
        <div className="callout info">
          <span>Test case tự động áp dụng cho bài C/C++ (input → output mong đợi). Với Android/Next.js, tiêu chí kiểm thử nên để AI hoặc giáo viên chấm.</span>
        </div>
      )}
      <div className="form-grid">
        <Field label="Giới hạn thời gian mỗi test (ms)">
          <input className="input" type="number" min={100} step={100} value={draft.timeLimitMs} onChange={(e) => patch({ timeLimitMs: Number(e.target.value) })} />
        </Field>
        <Field label="Giới hạn RAM (MB)">
          <input className="input" type="number" min={16} step={16} value={draft.memoryLimitMb} onChange={(e) => patch({ memoryLimitMb: Number(e.target.value) })} />
        </Field>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <Switch checked={draft.ignoreWhitespace} onChange={(v) => patch({ ignoreWhitespace: v })} label="Bỏ qua khoảng trắng thừa khi so sánh" />
        </div>
      </div>
      {draft.testCases.map((tc, i) => (
        <div key={tc.id} className="choice-card">
          <div className="row mb-8">
            <input className="input input-sm" style={{ maxWidth: 260 }} value={tc.name} onChange={(e) => update(i, { name: e.target.value })} />
            <div className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => patch({ testCases: draft.testCases.filter((_, k) => k !== i) })}>
              <Trash2 size={13} /> Xoá
            </button>
          </div>
          <div className="grid-2">
            <Field label="Input (stdin)">
              <textarea className="textarea mono" rows={4} value={tc.input} onChange={(e) => update(i, { input: e.target.value })} />
            </Field>
            <Field label="Output mong đợi">
              <textarea className="textarea mono" rows={4} value={tc.expected} onChange={(e) => update(i, { expected: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <div>
        <button
          className="btn btn-sm"
          onClick={() => patch({ testCases: [...draft.testCases, { id: uid('t'), name: `Case ${draft.testCases.length + 1}`, input: '', expected: '' }] })}
        >
          <Plus size={13} /> Thêm test case
        </button>
      </div>
    </div>
  )
}

function SubmissionsTab({ assignment, onBeforeAction }: { assignment: Assignment; onBeforeAction: () => Promise<boolean> }): JSX.Element {
  const loadAssignments = useStore((s) => s.loadAssignments)
  const toast = useStore((s) => s.toast)
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null)
  const [assignFor, setAssignFor] = useState<StudentRow | null>(null)

  const load = async (): Promise<void> => {
    setSummary(await call<ScanSummary>('assign:summary', assignment.id))
    setStudents(await call<StudentRow[]>('students:list', assignment.id))
  }
  useEffect(() => {
    void load().catch(() => {})
    const offs = [
      on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === assignment.id && void load()),
      on<{ assignmentId: number; done: number; total: number }>('scan:progress', (p) => p.assignmentId === assignment.id && setScanning({ done: p.done, total: p.total }))
    ]
    return () => offs.forEach((f) => f())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id])

  const scan = async (): Promise<void> => {
    if (!(await onBeforeAction())) return
    setScanning({ done: 0, total: 0 })
    const r = await attempt(() => call<ScanSummary>('assign:scan', assignment.id))
    setScanning(null)
    if (r) {
      toast(`Quét xong: ${r.valid} bài hợp lệ / ${r.total} file`, 'success')
      await load()
    }
  }
  const pick = async (): Promise<void> => {
    if (!(await onBeforeAction())) return
    const r = await attempt(() => call('assign:pickFolder', assignment.id))
    if (r) {
      await loadAssignments()
      await scan()
    }
  }
  const importList = async (): Promise<void> => {
    if (!(await onBeforeAction())) return
    const r = await attempt(() => call<Assignment | null>('assign:importClassList', assignment.id))
    if (r) {
      toast(`Đã nhập ${r.classList.length} sinh viên từ danh sách lớp`, 'success')
      await loadAssignments()
      if (assignment.submissionsDir) await scan()
    }
  }
  const pickStarter = async (kind: 'folder' | 'zip'): Promise<void> => {
    if (!(await onBeforeAction())) return
    const r = await attempt(() => call('assign:pickStarter', assignment.id, kind), 'Đã chọn code khung')
    if (r) await loadAssignments()
  }

  const group = (st: string): StudentRow[] => students.filter((s) => s.scanStatus === st)
  const needs = group('needs_assign')
  const dups = students.filter((s) => s.scanStatus === 'valid' && s.altFiles.length)
  const broken = [...group('broken'), ...group('unsupported')]
  const missing = group('missing')

  return (
    <div className="col gap-16">
      <div className="choice-card">
        <div className="row wrap">
          <FolderOpen size={16} className="text-2" />
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="label">Folder chứa file zip bài nộp</div>
            <div className="mono truncate" title={assignment.submissionsDir}>
              {assignment.submissionsDir || <span className="muted">Chưa chọn</span>}
            </div>
          </div>
          <button className="btn" onClick={pick}>
            <FolderOpen size={14} /> Chọn folder <span className="kbd">Ctrl+O</span>
          </button>
          <button className="btn btn-primary" disabled={!assignment.submissionsDir || !!scanning} onClick={scan}>
            {scanning ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : <ScanSearch size={14} />}
            {scanning ? `Đang quét ${scanning.done}/${scanning.total}` : 'Quét lại'}
          </button>
        </div>
        <div className="meta mt-8">
          Quy ước tên file: <code>&lt;TenSV&gt;_&lt;MSSV&gt;.zip</code> — ví dụ <code>HoDienCong_23546.zip</code>. Tách theo dấu “_” cuối cùng.
        </div>
      </div>

      {summary && summary.total + summary.missing > 0 && (
        <div className="grid-4">
          <div className="card stat">
            <div className="stat-label">
              <CheckCircle2 size={14} className="success" /> Hợp lệ
            </div>
            <div className="stat-value">{summary.valid}</div>
            <div className="stat-sub">trên {summary.total} file</div>
          </div>
          <div className="card stat">
            <div className="stat-label">
              <UserPlus size={14} className="warning" /> Cần gán MSSV
            </div>
            <div className="stat-value">{summary.needsAssign}</div>
            <div className="stat-sub">sai định dạng tên</div>
          </div>
          <div className="card stat">
            <div className="stat-label">
              <RefreshCw size={14} className="warning" /> Nộp lại (trùng MSSV)
            </div>
            <div className="stat-value">{summary.duplicates}</div>
            <div className="stat-sub">mặc định lấy file mới nhất</div>
          </div>
          <div className="card stat">
            <div className="stat-label">
              <FileWarning size={14} className="error" /> Zip lỗi / không hỗ trợ
            </div>
            <div className="stat-value">{summary.broken + summary.unsupported}</div>
            <div className="stat-sub">{summary.missing ? `${summary.missing} SV chưa nộp` : 'hỏng, mật khẩu, .rar/.7z'}</div>
          </div>
        </div>
      )}

      {needs.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <span className="card-title">Cần gán ({needs.length})</span>
          </div>
          <table className="table">
            <tbody>
              {needs.map((s) => (
                <tr key={s.id}>
                  <td className="mono truncate" style={{ maxWidth: 380 }}>
                    {s.zipPath.split(/[\\/]/).pop()}
                  </td>
                  <td className="meta">{s.scanNote}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => setAssignFor(s)}>
                      <UserPlus size={13} /> Gán MSSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dups.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <span className="card-title">Nộp nhiều lần ({dups.length})</span>
          </div>
          <table className="table">
            <tbody>
              {dups.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.mssv}</td>
                  <td>{s.name}</td>
                  <td className="meta truncate" style={{ maxWidth: 260 }} title={s.zipPath}>
                    Đang dùng: {s.zipPath.split(/[\\/]/).pop()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <select
                      className="select input-sm"
                      style={{ width: 260 }}
                      value=""
                      onChange={async (e) => {
                        if (!e.target.value) return
                        await attempt(() => call('students:chooseFile', s.id, e.target.value), 'Đã đổi file bài nộp')
                        await load()
                      }}
                    >
                      <option value="">Chọn file khác…</option>
                      {s.altFiles.map((f) => (
                        <option key={f} value={f}>
                          {f.split(/[\\/]/).pop()}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {broken.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <span className="card-title">Zip lỗi / không hỗ trợ ({broken.length})</span>
          </div>
          <table className="table">
            <tbody>
              {broken.map((s) => (
                <tr key={s.id}>
                  <td className="mono truncate" style={{ maxWidth: 360 }}>
                    {s.zipPath.split(/[\\/]/).pop()}
                  </td>
                  <td className="error">{s.scanNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid-2">
        <div className="choice-card">
          <div className="card-title">Danh sách lớp (tuỳ chọn)</div>
          <div className="meta mt-8">Import Excel/CSV để đối chiếu MSSV → tên chuẩn và phát hiện sinh viên chưa nộp.</div>
          <div className="row mt-12">
            <button className="btn btn-sm" onClick={importList}>
              <Upload size={13} /> Import danh sách lớp
            </button>
            {assignment.classList.length > 0 && (
              <span className="meta">
                {assignment.classList.length} sinh viên · {missing.length} chưa nộp
              </span>
            )}
          </div>
        </div>
        <div className="choice-card">
          <div className="card-title">Code khung (starter code)</div>
          <div className="meta mt-8">Phần code giáo viên phát được loại trừ khi so sánh trùng lặp.</div>
          <div className="row mt-12 wrap">
            <button className="btn btn-sm" onClick={() => pickStarter('folder')}>
              Chọn folder
            </button>
            <button className="btn btn-sm" onClick={() => pickStarter('zip')}>
              Chọn file zip
            </button>
            {assignment.starterDir && (
              <span className="meta mono truncate" style={{ maxWidth: 220 }} title={assignment.starterDir}>
                {assignment.starterDir.split(/[\\/]/).pop()}
              </span>
            )}
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="card flush">
          <div className="card-header">
            <span className="card-title">Chưa nộp ({missing.length})</span>
          </div>
          <table className="table">
            <tbody>
              {missing.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.mssv}</td>
                  <td>{s.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignFor && <AssignDialog student={assignFor} classList={assignment.classList} onClose={() => setAssignFor(null)} onDone={load} />}
    </div>
  )
}

function AssignDialog({
  student,
  classList,
  onClose,
  onDone
}: {
  student: StudentRow
  classList: Assignment['classList']
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const [mssv, setMssv] = useState('')
  const [name, setName] = useState('')
  const submit = async (): Promise<void> => {
    try {
      await call('students:assign', student.id, mssv, name)
      useStore.getState().toast('Đã gán MSSV', 'success')
      onDone()
      onClose()
    } catch (e: any) {
      useStore.getState().toast(e.message, 'error')
    }
  }
  return (
    <Modal
      title="Gán MSSV cho bài nộp"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" disabled={!mssv || !name} onClick={submit}>
            Gán
          </button>
        </>
      }
    >
      <div className="col gap-12">
        <div className="meta mono">{student.zipPath.split(/[\\/]/).pop()}</div>
        {classList.length > 0 && (
          <Field label="Chọn từ danh sách lớp">
            <select
              className="select"
              value=""
              onChange={(e) => {
                const c = classList.find((x) => x.mssv === e.target.value)
                if (c) {
                  setMssv(c.mssv)
                  setName(c.name)
                }
              }}
            >
              <option value="">—</option>
              {classList.map((c) => (
                <option key={c.mssv} value={c.mssv}>
                  {c.mssv} · {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="MSSV">
          <input className="input mono" value={mssv} onChange={(e) => setMssv(e.target.value)} autoFocus />
        </Field>
        <Field label="Họ tên">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
