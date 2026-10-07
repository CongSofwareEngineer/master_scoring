# Local AI (llama-server + model GGUF)

- **Mục đích:** Chấm bằng AI chạy ngay trên máy giáo viên — code sinh viên không rời khỏi máy.
- **File:** `src/main/ai/llama.ts`, `src/main/ai/models.ts`, `src/main/ai/manager.ts`, `src/main/hardware.ts`,
  `src/main/proc.ts`, `src/shared/constants.ts` (`MODELS`), `src/main/ipc.ts` (`ai:*`),
  `src/renderer/src/pages/AiSetup.tsx`, `src/renderer/src/pages/AiModels.tsx`, `src/renderer/src/components/AiWidgets.tsx`
- **Changelog:** [../changelog/local-ai.md](../changelog/local-ai.md)

## Logic chính

- **Trạng thái (`LocalState`):** `not_installed → downloading → verifying → starting → ready` / `stopped` / `error`;
  phát qua sự kiện `ai:local`.
- **Model:** `qwen2.5-coder-1.5b` (mặc định, ~1 GB) và `qwen2.5-coder-7b` (~4.7 GB, khuyến nghị ≥ 16 GB RAM), GGUF
  Q4_K_M từ Hugging Face.
  - Tải vào `modelsDir/<file>.part`, hỗ trợ **tạm dừng / tiếp tục** (HTTP Range), kiểm tra ổ trống trước khi tải,
    xác minh **SHA-256** theo metadata LFS rồi đổi tên.
  - Nhập file `.gguf` có sẵn, xoá model (dừng server nếu đang dùng), đổi thư mục lưu model.
- **llama-server:**
  - Tìm theo thứ tự: runtime đóng gói trong bộ cài → `runtime/llama/<variant>` → (dev macOS)
    `resources/runtime-mac/<arch>` → `PATH` (macOS/Linux). Không có → tự tải từ GitHub `ggml-org/llama.cpp`.
  - Biến thể: Windows `cpu` / `vulkan` (auto chọn Vulkan nếu có GPU rời NVIDIA/AMD; lỗi Vulkan → tự chuyển CPU);
    macOS một bản Metal, Apple Silicon đưa toàn bộ layer lên GPU.
  - Chạy `-m <model> --host 127.0.0.1 --port <cổng trống> -c <context> -np 1 -t threads -ngl gpuLayers`; context =
    `effectiveContext('local', contextSize)` = min(contextSize, `LOCAL_MAX_CONTEXT` 32K — context huấn luyện của Qwen2.5-Coder); chờ
    `/health` tối đa 5 phút.
  - Lỗi khởi động được giải thích (thiếu VC++ Runtime, CPU không hỗ trợ, thiếu RAM/VRAM, model hỏng).
- **Vòng đời:** ghi PID vào `runtime/llama.pid`; watchdog (PowerShell / sh) kill server khi app chết; lần mở sau
  `cleanupStale()` kill tiến trình sót; tắt app → `stopLocalSync()`.
- Đăng nhập → `ensureLocalStarted()` tự khởi động model đang chọn nếu đã cài.
- Màn **AI Configuration** hiện lần đầu khi chưa có Local model và chưa cấu hình Cloud (bỏ qua được).

## Lưu ý / giới hạn

- Chỉ lắng nghe `127.0.0.1`; gọi Local AI không đi qua `netFetch`.
- Thông tin phần cứng chỉ để hiển thị / ước tính, không chặn cài đặt.

## Test

Thủ công: cài model 1.5B → tạm dừng giữa chừng → tiếp tục → xác minh → sẵn sàng; kill llama-server bằng tay → trạng thái
Lỗi, hàng đợi tự tạm dừng; xoá model đang dùng.
