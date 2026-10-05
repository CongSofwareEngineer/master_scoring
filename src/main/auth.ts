// Xác thực tài khoản local, offline. Tách thành AuthProvider để sau này thay bằng đăng nhập qua server.
// Lần chạy đầu tiên tự tạo tài khoản mặc định admin / admin (đổi được trong Cài đặt → Tài khoản).
import bcrypt from 'bcryptjs'
import type { User } from '@shared/types'
import { get, nowIso, run } from './db'

export const DEFAULT_USERNAME = 'admin'
export const DEFAULT_PASSWORD = 'admin'

const USERNAME_RE = /^[\p{L}\p{N}._-]{3,32}$/u
const USERNAME_MSG = 'Tên đăng nhập 3–32 ký tự, chỉ gồm chữ, số, dấu . _ -'

export interface AuthProvider {
  register(username: string, password: string, displayName: string): Promise<User>
  login(username: string, password: string): Promise<User>
  hasAnyUser(): boolean
}

interface UserRow {
  id: number
  username: string
  password_hash: string
  display_name: string
  default_pw: number
}

function toUser(r: UserRow): User {
  return { id: r.id, username: r.username, displayName: r.display_name, defaultPassword: !!r.default_pw }
}

class LocalAuthProvider implements AuthProvider {
  hasAnyUser(): boolean {
    return !!get('SELECT id FROM users LIMIT 1')
  }

  async register(username: string, password: string, displayName: string): Promise<User> {
    username = username.trim()
    if (!USERNAME_RE.test(username)) throw new Error(USERNAME_MSG)
    if (password.length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự')
    if (get('SELECT id FROM users WHERE username = ?', [username])) throw new Error('Tên đăng nhập đã tồn tại')
    const hash = await bcrypt.hash(password, 11)
    const { lastId } = run('INSERT INTO users (username, password_hash, display_name, created_at, default_pw) VALUES (?, ?, ?, ?, 0)', [
      username,
      hash,
      displayName.trim() || username,
      nowIso()
    ])
    return { id: lastId, username, displayName: displayName.trim() || username, defaultPassword: false }
  }

  async login(username: string, password: string): Promise<User> {
    const row = get<UserRow>('SELECT * FROM users WHERE username = ?', [username.trim()])
    if (!row || !(await bcrypt.compare(password, row.password_hash))) throw new Error('Sai tên đăng nhập hoặc mật khẩu')
    return toUser(row)
  }
}

export const auth: AuthProvider = new LocalAuthProvider()

// Lần đầu mở app: chưa có tài khoản nào → tạo admin / admin.
export async function ensureDefaultAccount(): Promise<void> {
  if (auth.hasAnyUser()) return
  run('INSERT INTO users (username, password_hash, display_name, created_at, default_pw) VALUES (?, ?, ?, ?, 1)', [
    DEFAULT_USERNAME,
    await bcrypt.hash(DEFAULT_PASSWORD, 11),
    'Administrator',
    nowIso()
  ])
}

// Màn hình đăng nhập chỉ gợi ý admin/admin khi tài khoản này vẫn dùng mật khẩu mặc định.
export function defaultAccountHint(): string | null {
  const row = get<{ username: string }>('SELECT username FROM users WHERE default_pw = 1 LIMIT 1')
  return row ? row.username : null
}

let currentUser: User | null = null

export function setCurrentUser(u: User | null): void {
  currentUser = u
}

export function getCurrentUser(): User | null {
  return currentUser
}

export function requireUser(): User {
  if (!currentUser) throw new Error('Chưa đăng nhập')
  return currentUser
}

function reloadCurrent(userId: number): User {
  const row = get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  if (!row) throw new Error('Không tìm thấy tài khoản')
  const u = toUser(row)
  if (currentUser?.id === userId) currentUser = u
  return u
}

export async function changePassword(userId: number, oldPw: string, newPw: string): Promise<User> {
  const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId])
  if (!row || !(await bcrypt.compare(oldPw, row.password_hash))) throw new Error('Mật khẩu hiện tại không đúng')
  if (newPw.length < 6) throw new Error('Mật khẩu mới tối thiểu 6 ký tự')
  if (newPw === oldPw) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại')
  run('UPDATE users SET password_hash = ?, default_pw = 0 WHERE id = ?', [await bcrypt.hash(newPw, 11), userId])
  return reloadCurrent(userId)
}

export function updateProfile(userId: number, username: string, displayName: string): User {
  username = username.trim()
  displayName = displayName.trim()
  if (!USERNAME_RE.test(username)) throw new Error(USERNAME_MSG)
  if (get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId])) throw new Error('Tên đăng nhập đã tồn tại')
  run('UPDATE users SET username = ?, display_name = ? WHERE id = ?', [username, displayName || username, userId])
  return reloadCurrent(userId)
}
