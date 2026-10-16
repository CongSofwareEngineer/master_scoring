# Changelog: Cloud AI & client gọi AI

> Hiện trạng logic: [../instruction/cloud-ai.md](../instruction/cloud-ai.md)

- 2026-10-05 | Thêm mới | Cloud AI & client gọi AI: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-06 | Thêm mới | Cloud AI & client gọi AI: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Ngân sách context Cloud: lấy theo `contextSize` (mặc định 32K, tuỳ chọn 100K / 150K / 200K) thay vì cố định 120K — giáo viên dùng API LLM cần context lớn và tự chọn theo model
- 2026-10-16 | Sửa | Ngân sách context Cloud: `effectiveContext` giới hạn chung 200K (`MAX_CONTEXT`) cho cả Cloud và Local — thống nhất mức trần context giữa 2 backend
- 2026-10-16 | Sửa | Client gọi AI: tách `postCompletion` (gửi HTTP, header, timeout, 429, bỏ response_format) + `completionBody` + `messageText` khỏi `chat()` — khung agent tool calling dùng chung cùng đường gửi cho Local và Cloud
