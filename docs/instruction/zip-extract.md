# Giải nén bài nộp an toàn

- **Mục đích:** Đọc mã nguồn trong file nén sinh viên nộp (.zip, .rar, .7z, .tar(.gz/.bz2/.xz), .iso, .dmg, .arj,
  .cab, .lzh…) vào bộ nhớ một cách an toàn và chỉ lấy file cần chấm.
- **File:** `src/main/importer/extract.ts`, `src/main/importer/sevenZip.ts` (gọi 7-Zip),
  `src/shared/submissionName.ts` (`SUPPORTED_EXTS`, `COMPRESS_ONLY_EXTS`, `isArchiveName`, `stripExtension`),
  `src/shared/constants.ts` (`BLOCKED_EXT`), `scripts/fetch-runtime.mjs` (tải 7-Zip đóng gói), `src/main/zipUtil.ts`
  (chỉ cho runtime, không dùng cho bài nộp)
- **Changelog:** [../changelog/zip-extract.md](../changelog/zip-extract.md)

## Logic chính

- **Chế độ báo cáo** (`profile.id === REPORT_PROFILE_ID`): file Office nộp thẳng (`REPORT_EXTS`: .docx .doc .xlsx .xls
  .pptx .ppt .rtf) → `officeToText` (lỗi = cả bài lỗi); trong file nén `classify` chỉ trả `docx` cho file có đuôi trong
  `REPORT_EXTS` ≤ 100 MB (còn lại bỏ; `.pdf .odt .ods .odp .pages .numbers .key` → cảnh báo), văn bản lưu dưới tên file
  gốc, thống kê ở `Submission.docs`. `quickCheckArchive` với file Office → `quickCheckOffice`. Xem [report-grading.md](report-grading.md).
- `loadSubmission(path, profile, limits)` chọn cách đọc theo đuôi file:
  - **`.zip`** → `walkZip`: đọc bằng `yauzl` **vào RAM** (`Map<path, Buffer>`), không ghi ra đĩa.
  - **Đuôi khác** → `walk7z`: dùng 7-Zip (`sevenZip.ts`):
    1. `7z l -slt -ba` liệt kê file (đường dẫn, dung lượng, cờ mật khẩu).
    2. Áp cùng bộ lọc như zip (bên dưới) trên danh sách → chỉ chọn file cần chấm.
    3. `7z x … -spd @listfile` giải nén **đúng các file đã chọn** ra thư mục tạm `paths.work/x-*`.
    4. Đọc từng file vào RAM (`lstat`: chỉ file thường, không đi theo symlink, phải nằm trong thư mục tạm) → xoá
       thư mục tạm (`finally`, kể cả khi lỗi).
  - Chỉ ghi ra đĩa thêm khi cần compile — `writeFilesTo`.
- **Bộ lọc dùng chung (`classify`)** cho mọi định dạng: bỏ đường dẫn khớp `profile.ignore` + `ALWAYS_IGNORE`
  (node_modules, build, .git, lock file, README/LICENSE, file cấu hình công cụ, `*.min.js`, file AppleDouble `._*`…);
  chỉ lấy file văn bản theo đuôi của các profile; bỏ file > 512 KB và file nhị phân (có byte 0).
- **Tìm 7-Zip (`findSevenZip`, nhớ kết quả trong phiên):** bản đóng gói `<resources>/runtime/7zip/7z.exe` (Windows) /
  `7zz` (macOS) → dev macOS: `resources/runtime-mac/<arch>/7zip/7zz` → Windows: `Program Files\7-Zip\7z.exe` →
  `7zz` / `7z` trong PATH. Không có → `NoSevenZipError` (quét đánh dấu bài là `unsupported`).
- **.tar.gz / .tgz / .tar.bz2 / .tar.xz / .gz…:** 7-Zip chỉ thấy 1 file `.tar` bên trong → bóc thêm lớp đó (không tính
  là "lồng"). File `.xz` không lưu tên bên trong → tên suy từ tên file nén (`A_1.tar.xz` → `A_1.tar`).
- **DMG / ISO:** 7-Zip tự mở phân vùng HFS/APFS/ISO9660 bên trong, liệt kê như thư mục thường.
- **An toàn:**
  - zip-slip: bỏ đường dẫn tuyệt đối hoặc chứa `..` (cả zip và 7-Zip); 7-Zip còn tự chặn symlink trỏ ra ngoài.
  - zip bomb: tổng dung lượng (theo danh sách, chỉ tính file không bị bỏ qua) ≤ `maxUnzipMb` (mặc định 500 MB) và số
    file ≤ `maxFiles` (20 000); lớp `.tar` trong `.tar.gz` lớn hơn giới hạn → lỗi ngay, không giải nén.
  - Có mật khẩu → lỗi "Zip có mật khẩu" / "File nén có mật khẩu". 7-Zip luôn được truyền mật khẩu giả (`-p…`) để
    không dừng lại hỏi mật khẩu.
  - File thực thi (`.exe .bat .cmd .ps1 .dll .msi .com .scr .vbs`) không giải nén.
- **File nén lồng bên trong bài nộp** (`.zip .rar .7z .tar .tgz .tbz .tbz2 .txz`, `.tar.gz`…): giải thêm **1 cấp**
  (≤ 200 MB), nội dung đặt dưới thư mục cùng tên bỏ đuôi. Zip lồng hỏng → lỗi như trước; định dạng khác lồng bên trong
  hỏng / thiếu 7-Zip → chỉ cảnh báo. Không coi `.iso .dmg .pak .arc .cab` bên trong là file nén lồng.
- **Lỗi 7-Zip (`ArchiveError`)** → thông báo: "File nén có mật khẩu", "Không mở được file nén (định dạng không hỗ trợ
  hoặc file hỏng)", "File nén hỏng: <chi tiết>".
- **Tên file tiếng Việt (zip):** có cờ UTF-8 → UTF-8; không → thử UTF-8 → CP1258 → CP437. Định dạng khác: 7-Zip xuất
  UTF-8 (`-sccUTF-8`).
- Chỉ có 1 thư mục gốc chung → tự bỏ (tối đa 3 cấp). Kết quả sắp xếp theo đường dẫn.
- `decodeText(buf)`: UTF-16 BOM → UTF-8 (bỏ BOM) → fallback CP1258.
- Cảnh báo (`warnings`) được lưu vào kết quả chấm để giáo viên xem.
- **Kiểm tra nhanh khi quét folder:** `quickCheckArchive` — `.zip` → `quickCheckZip` (chỉ đọc central directory);
  khác → `7z l` (rỗng / mật khẩu / không mở được). Không giải nén.

## Lưu ý / giới hạn

- File bị lọc sẽ không có trong Code Review và không gửi cho AI.
- **.arc / .pak** (định dạng DOS cổ): 7-Zip không có bộ đọc riêng — chỉ mở được khi bên trong thực chất là
  zip/7z/rar… (7-Zip nhận diện theo nội dung, không theo đuôi); ngược lại bài bị đánh dấu `broken`.
- 7-Zip đóng gói: bản 25.01 từ 7-zip.org (`SEVEN_ZIP_VER` trong `fetch-runtime.mjs`), Windows lấy `7z.exe + 7z.dll`
  từ bộ cài chính thức, macOS lấy `7zz` (universal). Giấy phép LGPL + unRAR (kèm `License.txt`).
- Đọc qua 7-Zip chậm hơn zip một chút (chạy tiến trình con + ghi file tạm), nhưng chỉ giải nén file cần chấm.
- Windows: tên file có ký tự không hợp lệ (vd `:` từ DMG/tar macOS) không giải nén được → cảnh báo "Không giải nén
  được", bỏ qua file đó.

## Test

`npm run typecheck`. Chuẩn bị 7-Zip: `npm run fetch:runtime:mac` (macOS) / `npm run fetch:runtime` (Windows).
Thủ công trong `npm run dev`: folder bài nộp gồm `A_1.zip` có `node_modules`, zip lồng zip / lồng .7z, zip có
`../evil.txt`, zip tên file tiếng Việt tạo trên Windows cũ, `A_2.rar`, `A_3.7z`, `A_4.tar.gz`, `A_5.tar.xz`, `A_6.iso`,
`A_7.dmg`, `A_8.7z` có mật khẩu, `A_9.arc` không phải file nén → quét + chấm, kiểm tra danh sách file trong Code Review,
phần cảnh báo, trạng thái `broken` của 2 file cuối, và thư mục `w/` trong thư mục dữ liệu không còn `x-*` / `n-*`.
