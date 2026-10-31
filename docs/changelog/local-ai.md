# Changelog: Local AI (llama-server + model GGUF)

> Hiện trạng logic: [../instruction/local-ai.md](../instruction/local-ai.md)

- 2026-10-05 | Thêm mới | Local AI: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-06 | Sửa | Thông báo tải runtime/model: bỏ các thông báo tiến trình chi tiết khi tải llama-server, chỉ báo "Đã tải xong llama-server" / "Đã tải xong model" — toast liên tục gây nhiễu
- 2026-10-06 | Thêm mới | Local AI (llama-server + model GGUF): tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Context llama-server: `-c` = min(contextSize, 32K) qua `effectiveContext` — context chung giờ chọn được tới 200K cho Cloud, Local model Qwen2.5-Coder chỉ huấn luyện 32K
- 2026-10-16 | Sửa | Context llama-server: bỏ trần 32K, `-c` = min(contextSize, 200K) giống Cloud — yêu cầu cho phép chỉnh context tới 200K cho cả Local AI lẫn Cloud API
- 2026-10-16 | Sửa | Tham số llama-server: thêm `--jinja` — agent dữ liệu chuyển sang tool calling chuẩn OpenAI, llama-server cần chat template jinja để nhận `tools` (bản runtime cũ chưa bật mặc định)
- 2026-10-31 | Sửa | Đưa model lên GPU (Vulkan): chỉ dùng GPU rời qua `--device` (bỏ iGPU), `gpuLayers = -1` → `-ngl auto --fit on --fit-target 512` để llama.cpp tự đưa lên GPU nhiều layer nhất VRAM chứa được, phần dư chạy RAM; nhãn trạng thái hiện tên GPU + số layer thật (N/M) — trước đó llama.cpp chia layer sang cả iGPU (VRAM của iGPU là RAM máy) và bản Vulkan luôn đẩy toàn bộ layer, thiếu VRAM là rơi hẳn về CPU, nên model ăn RAM chứ không ăn GPU
