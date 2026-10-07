# Mục lục logic — Master Scoring

Mỗi logic có đúng 1 file hiện trạng trong `instruction/` và 1 file lịch sử cùng tên trong `changelog/`.
Quy tắc: xem [../CLAUDE.md](../CLAUDE.md).

## Nền tảng

| Logic | Instruction | Changelog |
| --- | --- | --- |
| Cửa sổ app & khung giao diện (sidebar, top bar) | [instruction/app-shell.md](instruction/app-shell.md) | [changelog/app-shell.md](changelog/app-shell.md) |
| IPC main ↔ renderer & phân quyền | [instruction/ipc.md](instruction/ipc.md) | [changelog/ipc.md](changelog/ipc.md) |
| Database & thư mục dữ liệu | [instruction/database.md](instruction/database.md) | [changelog/database.md](changelog/database.md) |
| Tài khoản & đăng nhập | [instruction/auth.md](instruction/auth.md) | [changelog/auth.md](changelog/auth.md) |
| Cài đặt (theo máy / theo giáo viên) | [instruction/settings.md](instruction/settings.md) | [changelog/settings.md](changelog/settings.md) |
| Sao lưu / khôi phục / dung lượng | [instruction/backup.md](instruction/backup.md) | [changelog/backup.md](changelog/backup.md) |
| Nhật ký kết nối mạng | [instruction/netlog.md](instruction/netlog.md) | [changelog/netlog.md](changelog/netlog.md) |
| Đa ngôn ngữ (Tiếng Việt / English) | [instruction/i18n.md](instruction/i18n.md) | [changelog/i18n.md](changelog/i18n.md) |
| Build, version & ký số bộ cài | [instruction/build-release.md](instruction/build-release.md) | [changelog/build-release.md](changelog/build-release.md) |

## Assignment & bài nộp

| Logic | Instruction | Changelog |
| --- | --- | --- |
| Assignment, rubric, test case, rubric mẫu | [instruction/assignment.md](instruction/assignment.md) | [changelog/assignment.md](changelog/assignment.md) |
| Quét folder bài nộp & quy tắc tên file | [instruction/submission-scan.md](instruction/submission-scan.md) | [changelog/submission-scan.md](changelog/submission-scan.md) |
| Danh sách lớp (Excel/CSV) | [instruction/class-list.md](instruction/class-list.md) | [changelog/class-list.md](changelog/class-list.md) |
| Giải nén bài nộp an toàn | [instruction/zip-extract.md](instruction/zip-extract.md) | [changelog/zip-extract.md](changelog/zip-extract.md) |
| Tech Profile & tự động nhận diện công nghệ | [instruction/tech-profiles.md](instruction/tech-profiles.md) | [changelog/tech-profiles.md](changelog/tech-profiles.md) |

## Chấm điểm

| Logic | Instruction | Changelog |
| --- | --- | --- |
| Pipeline chấm 1 sinh viên | [instruction/grading-pipeline.md](instruction/grading-pipeline.md) | [changelog/grading-pipeline.md](changelog/grading-pipeline.md) |
| Chấm báo cáo (Word / Excel / PowerPoint) | [instruction/report-grading.md](instruction/report-grading.md) | [changelog/report-grading.md](changelog/report-grading.md) |
| Hàng đợi chấm | [instruction/grading-queue.md](instruction/grading-queue.md) | [changelog/grading-queue.md](changelog/grading-queue.md) |
| Phân tích tĩnh | [instruction/static-analysis.md](instruction/static-analysis.md) | [changelog/static-analysis.md](changelog/static-analysis.md) |
| Biên dịch & chạy test C/C++ | [instruction/cpp-compile-test.md](instruction/cpp-compile-test.md) | [changelog/cpp-compile-test.md](changelog/cpp-compile-test.md) |
| Local AI (llama-server + model GGUF) | [instruction/local-ai.md](instruction/local-ai.md) | [changelog/local-ai.md](changelog/local-ai.md) |
| Cloud AI & client gọi AI | [instruction/cloud-ai.md](instruction/cloud-ai.md) | [changelog/cloud-ai.md](changelog/cloud-ai.md) |

## Liêm chính & kết quả

| Logic | Instruction | Changelog |
| --- | --- | --- |
| Ước lượng % code AI & trừ điểm | [instruction/ai-estimate.md](instruction/ai-estimate.md) | [changelog/ai-estimate.md](changelog/ai-estimate.md) |
| Câu hỏi vấn đáp | [instruction/ai-questions.md](instruction/ai-questions.md) | [changelog/ai-questions.md](changelog/ai-questions.md) |
| So sánh trùng lặp (Integrity) | [instruction/similarity.md](instruction/similarity.md) | [changelog/similarity.md](changelog/similarity.md) |
| Code Review & sửa điểm / duyệt bài | [instruction/code-review.md](instruction/code-review.md) | [changelog/code-review.md](changelog/code-review.md) |
| Dashboard thống kê | [instruction/dashboard.md](instruction/dashboard.md) | [changelog/dashboard.md](changelog/dashboard.md) |
| Xuất báo cáo (Excel / CSV / PDF) | [instruction/reports.md](instruction/reports.md) | [changelog/reports.md](changelog/reports.md) |
| Trang Hướng dẫn sử dụng | [instruction/help-page.md](instruction/help-page.md) | [changelog/help-page.md](changelog/help-page.md) |
