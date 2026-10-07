# Changelog: Giải nén bài nộp an toàn

> Hiện trạng logic: [../instruction/zip-extract.md](../instruction/zip-extract.md)

- 2026-10-05 | Thêm mới | Giải nén bài nộp an toàn: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Danh sách bỏ qua chung: mở rộng `ALWAYS_IGNORE` (vendor, venv, dist, lock file, README/LICENSE, cấu hình công cụ, *.min.js…) và export dùng chung — chỉ chấm code sinh viên tự viết
- 2026-10-06 | Thêm mới | Giải nén bài nộp an toàn: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Giải nén bài nộp an toàn: đọc thêm .rar .7z .tar(.gz/.bz2/.xz/.zst) .iso .dmg .arj .cab .lzh (.arc/.pak nếu bên trong là định dạng 7-Zip nhận được) qua 7-Zip đóng gói (`sevenZip.ts`, liệt kê → chỉ giải nén file cần chấm ra thư mục tạm → đọc vào RAM → xoá); tách bộ lọc dùng chung `classify`; file nén lồng giải 1 cấp cho mọi định dạng; bỏ qua file AppleDouble `._*` — giáo viên muốn nhận bài nộp mọi định dạng nén phổ biến, không chỉ .zip
- 2026-10-07 | Sửa | Đọc bài nộp: chế độ báo cáo chỉ lấy `.docx` (nộp thẳng hoặc trong file nén), chuyển thành văn bản bằng `docx.ts`, cảnh báo .doc/.pdf — hỗ trợ chấm báo cáo
- 2026-10-07 | Sửa | Đọc bài nộp (chế độ báo cáo): lấy mọi file trong `REPORT_EXTS` (.doc .docx .xls .xlsx .ppt .pptx .rtf) qua `officeToText` thay vì chỉ .docx; cảnh báo còn .pdf .odt .ods .odp .pages .numbers .key — hỗ trợ chấm báo cáo Word / Excel / PowerPoint
