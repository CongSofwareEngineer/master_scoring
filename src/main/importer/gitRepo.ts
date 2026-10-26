// Bài nộp dạng link Git: đọc link trong file .txt / .url / .webloc, tải file zip của repo (GitHub / GitLab / Bitbucket).
// - Code lấy tại thời điểm chấm (nhánh mặc định hoặc nhánh trong link), không giới hạn theo commit / hạn nộp.
// - Zip tải về được cache trong w/git/ để Code Review xem đúng bản đã chấm.
import { createHash } from 'crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'fs'
import { join } from 'path'
import { findRepoLink, gitHostLabel, repoArchiveUrl, type RepoLink } from '@shared/gitLink'
import { netFetch } from '../netlog'
import { paths } from '../paths'

const MAX_LINK_FILE = 64 * 1024
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000

export class GitLinkError extends Error {}

export interface RepoArchive {
  zipPath: string
  link: RepoLink
  fetchedAt: string
}

function decodeLinkFile(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le')
  return buf.toString('latin1') // link chỉ có ký tự ASCII; .webloc dạng binary plist vẫn đọc được chuỗi URL
}

/** Đọc link repo trong file link. Không có link hợp lệ → GitLinkError. */
export function readLinkFile(file: string): RepoLink {
  if (statSync(file).size > MAX_LINK_FILE) throw new GitLinkError('File link quá lớn (> 64 KB)')
  const link = findRepoLink(decodeLinkFile(readFileSync(file)))
  if (!link) throw new GitLinkError('Không tìm thấy link GitHub / GitLab / Bitbucket trong file')
  return link
}

// Kiểm tra nhanh khi quét folder: chỉ đọc file, không gọi mạng. Trả về lý do lỗi, null nếu dùng được.
export function quickCheckLink(file: string): string | null {
  try {
    readLinkFile(file)
    return null
  } catch (e: any) {
    return e?.message ?? 'Không đọc được file link'
  }
}

function httpErrorText(status: number, host: string): string {
  if (status === 401 || status === 403 || status === 404) {
    return `Không tải được code từ ${host} (HTTP ${status}) — repo không tồn tại, sai tên nhánh hoặc đang để private. Yêu cầu sinh viên để repo ở chế độ public`
  }
  if (status === 429) return `${host} đang giới hạn số lần tải (HTTP 429) — thử chấm lại sau ít phút`
  return `Không tải được code từ ${host} (HTTP ${status})`
}

async function download(link: RepoLink, dest: string, maxBytes: number): Promise<void> {
  const host = gitHostLabel(link.host)
  let res: Response
  try {
    res = await netFetch(
      repoArchiveUrl(link),
      { headers: { 'User-Agent': 'MasterScoring' }, redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) },
      `Tải code bài nộp từ ${host}`
    )
  } catch (e: any) {
    throw new GitLinkError(`Không kết nối được tới ${host}: ${e?.cause?.message ?? e?.message ?? e}`)
  }
  if (!res.ok || !res.body) throw new GitLinkError(httpErrorText(res.status, host))
  const limitText = `Repo vượt giới hạn dung lượng ${(maxBytes / 1048576).toFixed(0)} MB`
  if (Number(res.headers.get('content-length') || 0) > maxBytes) throw new GitLinkError(limitText)

  const tmp = dest + '.part'
  const fd = openSync(tmp, 'w')
  let size = 0
  let head: Buffer | null = null
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new GitLinkError(limitText)
      }
      if (!head) head = Buffer.from(value.subarray(0, 2))
      writeSync(fd, value)
    }
  } catch (e: any) {
    closeSync(fd)
    rmSync(tmp, { force: true })
    if (e instanceof GitLinkError) throw e
    throw new GitLinkError(`Tải code từ ${host} bị gián đoạn: ${e?.message ?? e}`)
  }
  closeSync(fd)
  if (!head || head.toString('latin1') !== 'PK') {
    rmSync(tmp, { force: true })
    throw new GitLinkError(`${host} không trả về file zip của repo — kiểm tra lại link`)
  }
  renameSync(tmp, dest)
}

/**
 * Lấy file zip của repo trong file link.
 * refresh = true (lúc chấm): luôn tải bản mới nhất. false (Code Review…): dùng bản đã tải nếu link không đổi.
 */
export async function fetchRepoArchive(linkFile: string, opts: { refresh: boolean; maxBytes: number }): Promise<RepoArchive> {
  const link = readLinkFile(linkFile)
  const dir = join(paths.work, 'git')
  mkdirSync(dir, { recursive: true })
  const key = createHash('sha1').update(linkFile).digest('hex').slice(0, 16)
  const zipPath = join(dir, key + '.zip')
  const metaPath = join(dir, key + '.json')
  if (!opts.refresh && existsSync(zipPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
      if (meta.url === link.url) return { zipPath, link, fetchedAt: meta.fetchedAt }
    } catch {
      /* meta hỏng → tải lại */
    }
  }
  await download(link, zipPath, opts.maxBytes)
  const fetchedAt = new Date().toISOString()
  writeFileSync(metaPath, JSON.stringify({ url: link.url, fetchedAt }))
  return { zipPath, link, fetchedAt }
}
