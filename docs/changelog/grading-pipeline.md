# Changelog: Pipeline chấm 1 sinh viên

> Hiện trạng logic: [../instruction/grading-pipeline.md](../instruction/grading-pipeline.md)

- 2026-10-05 | Thêm mới | Pipeline chấm 1 sinh viên: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Bước giải nén trong pipeline: dùng `loadForGrading`, lưu `detected_profile`, cảnh báo khi không nhận diện được — hỗ trợ profile tự động
- 2026-10-06 | Thêm mới | Pipeline chấm 1 sinh viên: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Ngân sách token chấm AI: dùng `effectiveContext` (Cloud = contextSize thay vì 120K); thêm nhánh assignment báo cáo (.docx) — kiểm tra hình thức, prompt báo cáo, tóm tắt từng đoạn, `estimateAiText` — hỗ trợ chấm báo cáo
- 2026-10-09 | Sửa | Bước kiểm tra tự động: thêm nhánh Solidity chạy `compileSolidity` (`solc`) rồi `testSolidity` (`forge test`) — chấm tiêu chí compile/test bài smart contract
- 2026-10-26 | Sửa | Bước giải nén: gọi `loadForGrading(..., { refreshGit: true })` để bài nộp link Git luôn tải code mới nhất lúc chấm — chấm theo code trên repo tại thời điểm chấm
- 2026-10-26 | Sửa | Bước câu hỏi vấn đáp: đọc cờ / ngưỡng từ assignment thay vì Cài đặt; `backendFor` gọi `cloudBackend(owner)` (Cloud API chung) — câu hỏi theo từng assignment, Cloud 1 URL chung
