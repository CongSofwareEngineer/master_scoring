// Nhận diện link repo Git sinh viên nộp (GitHub / GitLab / Bitbucket) và URL tải file zip của repo.
// Dùng chung main + renderer — không import Node.

export type GitHost = 'github' | 'gitlab' | 'bitbucket'

export interface RepoLink {
  host: GitHost
  origin: string // https://github.com, https://gitlab.truong.edu.vn...
  project: string // owner/repo, group/subgroup/repo
  ref: string // nhánh / tag / commit — rỗng = nhánh mặc định
  subdir: string // chỉ chấm thư mục con này — rỗng = cả repo
  url: string // link đã chuẩn hoá để hiển thị
}

const HOST_LABEL: Record<GitHost, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' }

export function gitHostLabel(h: GitHost): string {
  return HOST_LABEL[h]
}

function stripGit(s: string): string {
  return s.replace(/\.git$/i, '')
}

/** Phân tích 1 link. Trả về null nếu không phải link repo của host hỗ trợ. */
export function parseRepoLink(raw: string): RepoLink | null {
  let s = raw.trim().replace(/[)\].,;:!?'"`>]+$/, '')
  const ssh = s.match(/^git@([^:/\s]+):(.+)$/)
  if (ssh) s = `https://${ssh[1]}/${ssh[2]}`
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  const hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  let segs: string[]
  try {
    segs = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
  const origin = `${u.protocol}//${hostname}${u.port ? ':' + u.port : ''}`
  let host: GitHost
  let project: string
  let rest: string[]
  if (hostname === 'github.com' || hostname === 'bitbucket.org') {
    if (segs.length < 2) return null
    host = hostname === 'github.com' ? 'github' : 'bitbucket'
    project = `${segs[0]}/${stripGit(segs[1])}`
    rest = segs.slice(2)
  } else if (hostname.includes('gitlab') || segs.includes('-')) {
    const dash = segs.indexOf('-')
    const proj = dash >= 0 ? segs.slice(0, dash) : segs
    if (proj.length < 2) return null
    host = 'gitlab'
    project = [...proj.slice(0, -1), stripGit(proj[proj.length - 1])].join('/')
    rest = dash >= 0 ? segs.slice(dash + 1) : []
  } else return null
  if (!project.split('/').every(Boolean)) return null

  // tree/<nhánh>/<thư mục> (Bitbucket: src/<nhánh>/<thư mục>); blob / commit chỉ lấy nhánh / commit
  let ref = ''
  let subdir = ''
  const treeWord = host === 'bitbucket' ? 'src' : 'tree'
  if (rest[1] && (rest[0] === treeWord || rest[0] === 'blob' || rest[0] === 'commit' || rest[0] === 'commits')) {
    ref = rest[1]
    if (rest[0] === treeWord) subdir = rest.slice(2).join('/')
  }
  const url = `${origin}/${project}` + (ref ? (host === 'gitlab' ? '/-' : '') + `/${treeWord}/${ref}` + (subdir ? '/' + subdir : '') : '')
  return { host, origin, project, ref, subdir, url }
}

/** Tìm link repo đầu tiên trong nội dung file (.txt, .url của Windows, .webloc của macOS…). */
export function findRepoLink(text: string): RepoLink | null {
  const re = /(?:https?:\/\/|git@)[^\s"'<>]+|(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[^\s"'<>]+/gi
  for (const m of text.matchAll(re)) {
    const link = parseRepoLink(m[0])
    if (link) return link
  }
  return null
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

/** URL tải file zip của repo (nhánh mặc định khi không chỉ định nhánh). */
export function repoArchiveUrl(l: RepoLink): string {
  if (l.host === 'gitlab') {
    return `${l.origin}/api/v4/projects/${encodeURIComponent(l.project)}/repository/archive.zip` + (l.ref ? `?sha=${encodeURIComponent(l.ref)}` : '')
  }
  const ref = l.ref ? encodePath(l.ref) : 'HEAD'
  if (l.host === 'bitbucket') return `${l.origin}/${encodePath(l.project)}/get/${ref}.zip`
  return `${l.origin}/${encodePath(l.project)}/archive/${ref}.zip`
}
