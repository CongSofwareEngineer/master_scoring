# Changelog: Local AI (llama-server + model GGUF)

> Hiện trạng logic: [../instruction/local-ai.md](../instruction/local-ai.md)

- 2026-10-05 | Thêm mới | Local AI: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-06 | Sửa | Thông báo tải runtime/model: bỏ các thông báo tiến trình chi tiết khi tải llama-server, chỉ báo "Đã tải xong llama-server" / "Đã tải xong model" — toast liên tục gây nhiễu
- 2026-10-06 | Thêm mới | Local AI (llama-server + model GGUF): tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Context llama-server: `-c` = min(contextSize, 32K) qua `effectiveContext` — context chung giờ chọn được tới 200K cho Cloud, Local model Qwen2.5-Coder chỉ huấn luyện 32K
