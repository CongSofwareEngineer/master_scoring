import { create } from 'zustand'
import type { AiStatus, AppSettings, Assignment, QueueState, TechProfile, User } from '@shared/types'
import { call } from './api'

export type Page =
  | 'dashboard'
  | 'assignments'
  | 'students'
  | 'queue'
  | 'review'
  | 'integrity'
  | 'reports'
  | 'profiles'
  | 'models'
  | 'settings'
  | 'help'

export interface PageParams {
  studentId?: number
  filter?: { status?: string; scoreMin?: number; scoreMax?: number; criterionId?: string; flag?: string }
  tab?: string
}

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error' | 'warning'
  message: string
}

interface State {
  user: User | null
  settings: AppSettings | null
  assignments: Assignment[]
  currentAssignmentId: number | null
  profiles: TechProfile[]
  page: Page
  params: PageParams
  ai: AiStatus | null
  queue: QueueState | null
  toasts: Toast[]
  setUser: (u: User | null) => void
  setSettings: (s: AppSettings) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  go: (page: Page, params?: PageParams) => void
  loadAssignments: () => Promise<void>
  loadProfiles: () => Promise<void>
  setCurrentAssignment: (id: number | null) => void
  setAi: (a: AiStatus) => void
  refreshAi: () => Promise<void>
  setQueue: (q: QueueState) => void
  toast: (message: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let toastId = 0

function readLastAssignment(userId: number): number | null {
  try {
    const v = localStorage.getItem('ms:lastAssignment:' + userId)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export const useStore = create<State>((set, get) => ({
  user: null,
  settings: null,
  assignments: [],
  currentAssignmentId: null,
  profiles: [],
  page: 'dashboard',
  params: {},
  ai: null,
  queue: null,
  toasts: [],
  setUser: (u) => set({ user: u }),
  setSettings: (s) => set({ settings: s }),
  updateSettings: async (patch) => {
    const s = await call<AppSettings>('settings:update', patch)
    set({ settings: s })
  },
  go: (page, params = {}) => set({ page, params }),
  loadAssignments: async () => {
    const list = await call<Assignment[]>('assign:list')
    const { currentAssignmentId, user } = get()
    let current = currentAssignmentId
    if (!current || !list.some((a) => a.id === current)) {
      const last = user ? readLastAssignment(user.id) : null
      current = last && list.some((a) => a.id === last) ? last : (list[0]?.id ?? null)
    }
    set({ assignments: list, currentAssignmentId: current })
  },
  loadProfiles: async () => set({ profiles: await call<TechProfile[]>('profiles:list') }),
  setCurrentAssignment: (id) => {
    const u = get().user
    if (u && id) {
      try {
        localStorage.setItem('ms:lastAssignment:' + u.id, String(id))
      } catch {
        /* bỏ qua */
      }
    }
    set({ currentAssignmentId: id })
  },
  setAi: (a) => set({ ai: a }),
  refreshAi: async () => set({ ai: await call<AiStatus>('ai:status') }),
  setQueue: (q) => set({ queue: q }),
  toast: (message, kind = 'info') => {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, kind, message }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))

export function useCurrentAssignment(): Assignment | null {
  return useStore((s) => s.assignments.find((a) => a.id === s.currentAssignmentId) ?? null)
}

// Bọc thao tác bất đồng bộ: lỗi → toast đỏ
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn()
    if (success) useStore.getState().toast(success, 'success')
    return r
  } catch (e: any) {
    useStore.getState().toast(e?.message ?? String(e), 'error')
    return undefined
  }
}
