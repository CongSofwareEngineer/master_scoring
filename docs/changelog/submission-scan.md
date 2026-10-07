# Changelog: Quét folder bài nộp & quy tắc tên file

> Hiện trạng logic: [../instruction/submission-scan.md](../instruction/submission-scan.md)

- 2026-10-05 | Thêm mới | Quét folder bài nộp: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Tách tên file bài nộp: gom vào `src/shared/submissionName.ts` (`parseSubmissionName`, `checkSubmissionName`) — dùng chung với trang Hướng dẫn
- 2026-10-05 | Sửa | Quy tắc tên file: chỉ cần `<HọTên>_<MSSV>.zip`, tách theo `_` cuối, không ràng buộc định dạng MSSV — MSSV các trường khác nhau
- 2026-10-06 | Thêm mới | Quét folder bài nộp & quy tắc tên file: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Quét folder bài nộp: nhận mọi đuôi trong `SUPPORTED_EXTS` (.zip .rar .7z .tar.gz .iso .dmg .arj…), kiểm tra bằng `quickCheckArchive`; `unsupported` chỉ còn khi máy thiếu 7-Zip; tách tên bỏ cả đuôi kép `.tar.gz` — hỗ trợ đọc nhiều định dạng nén
- 2026-10-07 | Sửa | Quét folder: assignment báo cáo nhận file `.docx` nộp thẳng (`isSubmissionFile`), bỏ file `~$*`, kiểm tra nhanh .docx — hỗ trợ chấm báo cáo
- 2026-10-07 | Sửa | Quét folder: assignment báo cáo nhận file .doc .docx .xls .xlsx .ppt .pptx .rtf nộp thẳng, kiểm tra nhanh bằng `quickCheckOffice` (theo nội dung file) — .doc / .docx đều là Word, thêm Excel / PowerPoint
