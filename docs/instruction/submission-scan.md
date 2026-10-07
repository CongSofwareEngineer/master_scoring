# Quét folder bài nộp & quy tắc tên file

- **Mục đích:** Đọc folder chứa file nén bài nộp (.zip, .rar, .7z, .tar.gz, .iso, .dmg…), nhận diện sinh viên theo tên file, xử lý nộp trùng / sai tên / hỏng /
  chưa nộp.
- **File:** `src/main/importer/scan.ts`, `src/shared/submissionName.ts`, `src/main/importer/extract.ts`
  (`quickCheckArchive`), `src/main/ipc.ts` (`assign:scan|summary`, `students:assign|chooseFile`),
  `src/renderer/src/pages/Assignments.tsx` (tab Bài nộp), `src/renderer/src/pages/Students.tsx`
- **Changelog:** [../changelog/submission-scan.md](../changelog/submission-scan.md)

## Logic chính

- **Quy tắc tên file:** `<HọTên>_<MSSV>.<đuôi nén>` (vd `HoDienCong_23546.zip`, `HoDienCong_23546.rar`,
  `HoDienCong_23546.tar.gz` — đuôi kép `.tar.gz/.tar.bz2/.tar.xz/.tar.zst` được bỏ cả 2 khi tách tên). Tách theo dấu `_` **cuối cùng**; chỉ cần có
  `_`, **không ràng buộc định dạng MSSV**. Họ tên được làm đẹp: `_` → khoảng trắng, tách CamelCase
  (`HoDienCong` → `Ho Dien Cong`), chuẩn hoá NFC. Logic tập trung ở `parseSubmissionName` (dùng chung với trang Hướng
  dẫn qua `checkSubmissionName`).
- Assignment báo cáo (`kind = 'report'`): `isSubmissionFile(name, kind)` nhận thêm file Office nộp thẳng
  (`REPORT_EXTS`: .docx .doc .xlsx .xls .pptx .ppt .rtf, vd `<HọTên>_<MSSV>.docx`), bỏ file khoá `~$*`; kiểm tra bằng
  `quickCheckOffice` (đọc theo nội dung file, hỏng / mật khẩu / không có chữ → `broken`). Assignment code bỏ qua các
  file này. Ghi chú sai tên ghi đuôi theo loại bài. Xem [report-grading.md](report-grading.md).
- Chỉ quét file ở cấp đầu của folder (không đệ quy). Nhận các đuôi trong `SUPPORTED_EXTS`
  (`src/shared/submissionName.ts`: .zip .rar .7z .tar .tgz .tbz .tbz2 .txz .gz .bz2 .xz .zst .iso .dmg .arj .cab .lzh
  .lha .arc .pak); đuôi khác bỏ qua. Cách đọc từng định dạng: xem [zip-extract.md](zip-extract.md).
- **Trạng thái (`scan_status`):**
  - `valid` — bài chính của 1 MSSV.
  - `duplicate_old` — cùng MSSV nộp nhiều lần: mặc định dùng file mới nhất (mtime), giữ lựa chọn cũ nếu giáo viên đã
    chọn file khác (`chooseAlternateFile`).
  - `needs_assign` — sai định dạng tên, giáo viên gán MSSV + họ tên tay (`assignManually`, ghi chú "Gán tay", được giữ
    qua các lần quét).
  - `broken` — file nén hỏng / rỗng / có mật khẩu / 7-Zip không mở được (vd .arc kiểu cũ) (`quickCheckArchive`).
  - `unsupported` — định dạng ngoài .zip nhưng máy không có 7-Zip (`NoSevenZipError`).
  - `missing` — có trong danh sách lớp nhưng chưa nộp.
- Có danh sách lớp → tên chính thức lấy theo MSSV trong danh sách.
- **Quét lại:** khớp dòng cũ theo đường dẫn zip; file đổi (mtime / MSSV) hoặc mới thành `valid` → xoá kết quả để chấm
  lại; dòng không còn → xoá; bài không `valid` → xoá kết quả. Tất cả trong 1 transaction.
- Tiến trình quét gửi qua sự kiện `scan:progress`; xong phát `students:changed` và xoá cache Code Review.

## Lưu ý / giới hạn

- Đổi quy tắc tên file: sửa `src/shared/submissionName.ts` (cả `parseSubmissionName` và `checkSubmissionName`), cập nhật
  ghi chú lỗi trong `scan.ts`, `EN_PATTERNS` trong `i18n.ts` và trang Hướng dẫn.
- Gán tay MSSV đã có bài `valid` khác → báo lỗi.

## Test

Thủ công: folder gồm `A_1.zip`, `A_1 (1).zip`… (nộp lại), `KhongCoGachDuoi.zip`, `B_2.rar`, `C_3.tar.gz`, `D_4.dmg`,
`E_5.arc` không phải file nén, zip / 7z có mật khẩu → quét và
kiểm tra từng trạng thái; dùng trang Hướng dẫn → "Quy tắc đặt tên file" để thử tên.
