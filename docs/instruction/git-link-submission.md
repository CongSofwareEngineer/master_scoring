# Bài nộp dạng link Git (GitHub / GitLab / Bitbucket)

- **Mục đích:** Cho sinh viên nộp **link repo** thay vì nén code: chỉ cần một file `.txt` / `.url` / `.webloc` chứa
  link, đặt tên như file nén (`<HọTên>_<MSSV>.txt`). Khi chấm, app tải code của repo **ngay lúc đó** về rồi chấm như
  một bài nộp zip bình thường. Mỗi Assignment tự chọn nhận file nén, link Git hay cả hai.
- **File:** `src/shared/gitLink.ts` (`findRepoLink`, `parseRepoLink`, `repoArchiveUrl`), `src/shared/submissionName.ts`
  (`LINK_EXTS`, `isLinkFile`, `isSubmissionFile(name, kind, source)`, `checkSubmissionName`), `src/shared/types.ts`
  (`SubmissionSource`, `Assignment.submissionSource`), `src/main/importer/gitRepo.ts` (`readLinkFile`,
  `quickCheckLink`, `fetchRepoArchive`), `src/main/importer/extract.ts` (`loadSubmission`, `quickCheckArchive`),
  `src/main/analysis/detect.ts` (`loadForGrading` truyền `LoadOptions`), `src/main/grading/pipeline.ts`,
  `src/main/importer/scan.ts`, `src/main/repo.ts` (`DEFAULT_ASSIGNMENT`, `rowToAssignment`),
  `src/renderer/src/pages/Assignments.tsx` (`SourceField`, tab Bài nộp), `src/shared/i18n.ts`
- **Changelog:** [../changelog/git-link-submission.md](../changelog/git-link-submission.md)

## Logic chính

- **Nguồn bài nộp (`Assignment.submissionSource`):** chọn ở form Tạo assignment và tab Thông tin (`SourceField`):
  - `archive` (mặc định, như cũ): chỉ nhận file nén (và file Office với assignment báo cáo).
  - `link`: chỉ nhận file link `.txt` `.url` `.webloc` (`LINK_EXTS`), bỏ qua file nén.
  - `both`: nhận cả hai. Cùng MSSV nộp cả zip và link → coi như nộp nhiều lần, mặc định dùng file mới nhất.
  - Assignment cũ không có field → `archive` (`rowToAssignment`).
- **File link:** tên theo quy tắc `<HọTên>_<MSSV>.<đuôi>` như file nén (xem `submission-scan.md`). Nội dung đọc dạng
  văn bản (`decodeText`, file ≤ 64 KB), tìm **link đầu tiên** thuộc host hỗ trợ (`findRepoLink`) — nên `.txt` có thêm
  chữ khác, `.url` của Windows (`URL=...`) và `.webloc` của macOS (plist XML / binary) đều đọc được.
- **Link hỗ trợ (`parseRepoLink`):**
  - GitHub: `github.com/<owner>/<repo>`, `/tree/<nhánh>/<thư mục>`, `/blob/<nhánh>/...`, `/commit/<sha>`.
  - GitLab: `gitlab.com/<group>/<subgroup…>/<repo>`, `/-/tree/<nhánh>/<thư mục>`; GitLab tự host nhận khi tên host
    chứa `gitlab` hoặc đường dẫn có `/-/`.
  - Bitbucket: `bitbucket.org/<workspace>/<repo>`, `/src/<nhánh>/<thư mục>`.
  - Nhận cả link không có `https://`, có `www.`, đuôi `.git`, dạng SSH `git@github.com:owner/repo.git`. Bỏ dấu câu
    dính cuối link.
  - Nhánh / thư mục: phần sau `tree/` (hoặc `src/`) — đoạn đầu là nhánh, phần còn lại là thư mục con chỉ chấm thư mục
    đó. Nhánh có dấu `/` sẽ bị hiểu sai (giới hạn đã biết).
- **Tải code (`fetchRepoArchive`):** tải file zip của repo qua `netFetch` (ghi vào tab Kết nối mạng, purpose
  "Tải code bài nộp từ <host>"):
  - GitHub: `https://github.com/<o>/<r>/archive/<nhánh | HEAD>.zip` (HEAD = nhánh mặc định).
  - GitLab: `<origin>/api/v4/projects/<path mã hoá>/repository/archive.zip[?sha=<nhánh>]`.
  - Bitbucket: `https://bitbucket.org/<ws>/<r>/get/<nhánh | HEAD>.zip`.
  - **Lấy code tại thời điểm chấm, không giới hạn theo hạn nộp / commit.** Chấm lại = tải lại bản mới nhất.
  - Giới hạn dung lượng tải = `maxUnzipMb` trong Cài đặt; quá 5 phút → lỗi. File tải về phải là zip (`PK`).
  - Lỗi HTTP 401/403/404 → "repo không tồn tại, sai tên nhánh hoặc đang để private — yêu cầu sinh viên để repo
    public"; 429 → "đang giới hạn số lần tải, thử lại sau"; lỗi mạng → "Không kết nối được tới <host>".
- **Cache:** zip tải về lưu ở `paths.work/git/<sha1(đường dẫn file link)>.zip` + `.json` (`url`, `fetchedAt`).
  - Chấm (`gradeStudent`) luôn tải mới (`LoadOptions.refreshGit = true`).
  - Code Review / tạo lại câu hỏi vấn đáp dùng bản cache (đúng bản đã chấm); chưa có cache hoặc link trong file đã
    đổi → tải mới.
  - Dọn thư mục làm việc (Sao lưu / dung lượng) xoá luôn cache — mở Code Review sau đó sẽ tải lại bản mới nhất.
- **Đọc code:** zip tải về đi qua `walkZip` như bài nộp zip (cùng bộ lọc, giới hạn, an toàn — xem `zip-extract.md`).
  Bỏ thư mục gốc của archive (`<repo>-<sha>/`), có thư mục con thì chỉ giữ file trong đó. Thư mục con không có file →
  lỗi "Không tìm thấy thư mục … trong repo".
- Kết quả chấm có thêm 1 dòng trong cảnh báo: `Code lấy từ <link> lúc <giờ>` để giáo viên biết bản code đã chấm.
- **Quét folder (`quickCheckLink`):** chỉ đọc file link, không gọi mạng. Không có link hợp lệ → `broken` với ghi chú
  "Không tìm thấy link GitHub / GitLab / Bitbucket trong file". Sửa file link (mtime đổi) → xoá kết quả, chấm lại.

## Lưu ý / giới hạn

- Chỉ đọc repo **public** (chưa hỗ trợ token cho repo private).
- Chưa hỗ trợ Gitea / Gitee / Azure DevOps / link Google Drive.
- Không giữ mã commit: chấm lại vào giờ khác có thể ra code khác nếu sinh viên push thêm.
- Đường dẫn file link nằm trong `students.zip_path` (dùng chung cột với file nén).

## Test

`npm run typecheck`. Thủ công trong `npm run dev`: assignment chọn nguồn "Link Git", folder gồm
`A_1.txt` (`https://github.com/<public repo>`), `B_2.url` (shortcut Windows), `C_3.webloc` (kéo link từ Safari),
`D_4.txt` (link GitLab có `/-/tree/main/src`), `E_5.txt` (link bitbucket), `F_6.txt` (không có link), `G_7.txt` (repo
private / không tồn tại), `H_8.zip` → quét: A–E, G hợp lệ, F hỏng, H bị bỏ qua; chấm → A–E có code trong Code Review,
dòng "Code lấy từ …" trong cảnh báo, G lỗi "… đang để private"; tab Cài đặt → Kết nối mạng có dòng "Tải code bài nộp
từ …". Đổi nguồn sang "Cả hai" → H được nhận. Assignment cũ vẫn chỉ nhận file nén.
