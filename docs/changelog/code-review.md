# Changelog: Code Review & sửa điểm / duyệt bài

> Hiện trạng logic: [../instruction/code-review.md](../instruction/code-review.md)

- 2026-10-05 | Thêm mới | Code Review & sửa điểm / duyệt bài: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Đọc code trong Code Review: dùng `loadForGrading`, hiển thị tên profile nhận diện được — khớp bộ lọc lúc chấm
- 2026-10-06 | Thêm mới | Code Review & sửa điểm / duyệt bài: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Code Review: khung Kiểm tra hình thức cho báo cáo .docx, nhãn nguồn chấm theo loại bài, đọc bài theo `gradingProfileId` — hỗ trợ chấm báo cáo
- 2026-10-09 | Thêm mới | Xem trước kiểu Office trong Code Review: nút chuyển Văn bản / Xem trước cho file `.docx`/`.xlsx` của bài báo cáo — Word render bằng `docx-preview`, Excel dựng bảng React bằng `exceljs` (gộp ô, màu, canh lề, áp numFmt ngày/số); lấy bytes gốc qua IPC `review:office` → `readRawFile`; nhấp bằng chứng tự về chế độ Văn bản; file `.doc`/`.xls` / lỗi → báo "Chưa tải được bản xem trước" — giáo viên cần xem đúng bố cục Word/Excel thay vì chỉ văn bản thuần
