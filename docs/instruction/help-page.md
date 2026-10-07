# Trang Hướng dẫn sử dụng

- **Mục đích:** Hướng dẫn giáo viên ngay trong app: tổng quan, quy tắc đặt tên file nộp, quy trình, khắc phục sự cố.
- **File:** `src/renderer/src/pages/Help.tsx`, `src/shared/submissionName.ts` (`checkSubmissionName`),
  `src/renderer/src/components/Shell.tsx`, `src/renderer/src/lib/store.ts` (page `help`)
- **Changelog:** [../changelog/help-page.md](../changelog/help-page.md)

## Logic chính

- Tab Tổng quan có mục "Chấm báo cáo / bài viết (Word / Excel / PowerPoint)"; mục "Định dạng file nén" có ghi chú
  assignment báo cáo nhận file Office nộp thẳng (.doc .docx .xls .xlsx .ppt .pptx .rtf; .doc = .docx vì nhận diện theo
  nội dung). `checkSubmissionName` coi các đuôi trong `REPORT_EXTS` là hợp lệ (đúng với assignment báo cáo).
- Mục "Định dạng file nén" liệt kê đuôi hỗ trợ (.zip .rar .7z .tar(.gz/.bz2/.xz) .iso .dmg .arj .cab .lzh) và không hỗ
  trợ (có mật khẩu, .arc / .pak kiểu cũ) — phải khớp `SUPPORTED_EXTS` và [zip-extract.md](zip-extract.md).
- 4 tab: Tổng quan, Quy tắc đặt tên file (mặc định), Quy trình sử dụng, Khắc phục sự cố. Mở tab cụ thể bằng
  `go('help', { tab })`.
- Tab Quy tắc đặt tên có ô kiểm tra tên file: gọi `checkSubmissionName` — **mô phỏng đúng quyết định của `scan.ts`**
  (`valid`, `unsupported_ext`, `ignored_ext`, `no_separator`, `empty_name`) mà không mở zip.

## Lưu ý / giới hạn

- Đổi quy tắc quét / tên file → cập nhật nội dung trang này cho khớp (xem `submission-scan.md`).
- Chữ trong trang dùng `t('…')` → cần bản English trong `src/shared/i18n.ts`.

## Test

Thủ công: nhập `HoDienCong_23546.zip`, `abc.zip`, `x.rar`, `_123.zip` → kết quả khớp với khi quét folder thật.
