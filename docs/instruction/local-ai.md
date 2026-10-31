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
  - Biến thể: Windows `cpu` / `vulkan` (auto chọn Vulkan nếu Electron thấy GPU NVIDIA/AMD và có bản Vulkan; lỗi Vulkan
    → tự chuyển CPU); macOS một bản Metal, Apple Silicon đưa toàn bộ layer lên GPU.
  - **Chọn GPU cho bản Vulkan (`vulkanPlan`):** chạy `llama-server --list-devices`, phân loại bằng `isIntegratedGpu()`
    (Intel UHD/Iris, AMD "Radeon(TM) Graphics" / "Radeon 780M Graphics", Vega… = GPU tích hợp). Chỉ truyền
    `--device <các GPU rời>` — nếu không, llama.cpp chia layer cho **mọi** GPU theo bộ nhớ trống, mà iGPU báo "VRAM" là
    RAM máy dùng chung (vd. laptop GTX 1650 Ti 4 GB + AMD iGPU "12 GB" → ~3/4 model nằm trong RAM, GPU rời gần như không
    dùng). Chỉ có iGPU: chế độ Tự động → chạy CPU; người dùng ép Vulkan → vẫn dùng iGPU. Không đọc được danh sách →
    không truyền `--device` (như cũ).
  - **Số layer lên GPU:** `gpuLayers = -1` (tự động) + runtime có `--fit` (kiểm tra qua `--help`) → `-ngl auto --fit on
    --fit-target 512`: llama.cpp tự đưa lên GPU nhiều layer nhất VRAM chứa được (chừa 512 MiB), **phần dư chạy RAM**
    (offload từng phần, không còn kiểu tất cả hoặc không có gì). Runtime cũ không có `--fit` → `-ngl = layers + 1` như trước.
    `gpuLayers ≥ 0` → dùng đúng số đó. `-c` luôn truyền nên `--fit` không tự giảm context.
  - Nhãn trạng thái: `GPU Vulkan · <tên GPU> (N/M layer)` — N/M đọc từ dòng log `offloaded N/M layers to GPU`.
  - Chạy `-m <model> --host 127.0.0.1 --port <cổng trống> -c <context> -np 1 --jinja -t threads [--device …] -ngl …`
    (`--jinja` = dùng chat template của model để nhận `tools` / trả `tool_calls` — agent ở `ai-agents.md`); context =
    `effectiveContext('local', contextSize)` = min(contextSize, `MAX_CONTEXT` 200K) — giống Cloud. Lưu ý: model
    Qwen2.5-Coder huấn luyện 32K, chọn lớn hơn tốn nhiều RAM/VRAM (KV cache) và chất lượng đọc phần xa có thể giảm; chờ
    `/health` tối đa 5 phút.
  - Lỗi khởi động được giải thích (thiếu VC++ Runtime, CPU không hỗ trợ, thiếu RAM/VRAM, model hỏng).
- **Vòng đời:** ghi PID vào `runtime/llama.pid`; watchdog (PowerShell / sh) kill server khi app chết; lần mở sau
  `cleanupStale()` kill tiến trình sót; tắt app → `stopLocalSync()`.
- Đăng nhập → `ensureLocalStarted()` tự khởi động model đang chọn nếu đã cài.
- Màn **AI Configuration** hiện lần đầu khi chưa có Local model và chưa cấu hình Cloud (bỏ qua được).

## Lưu ý / giới hạn

- Chỉ lắng nghe `127.0.0.1`; gọi Local AI không đi qua `netFetch`.
- Thông tin phần cứng chỉ để hiển thị / ước tính, không chặn cài đặt.
- Model 7B Q4_K_M (~4.7 GB) + KV cache context 32K (~1.75 GB) không vừa GPU 4 GB → chạy chia GPU + RAM, chậm hơn chạy
  hết trên GPU; model 1.5B (~2 GB tổng ở 32K) vừa trọn GPU 4 GB.
- `isIntegratedGpu()` dựa vào tên thiết bị — GPU lạ có thể bị phân loại sai; khi đó ép Vulkan / chỉnh số layer trong
  AI Models.

## Test

Thủ công: cài model 1.5B → tạm dừng giữa chừng → tiếp tục → xác minh → sẵn sàng; kill llama-server bằng tay → trạng thái
Lỗi, hàng đợi tự tạm dừng; xoá model đang dùng.

GPU (Windows, máy có GPU rời + iGPU): `resources/runtime/llama/vulkan/llama-server.exe --list-devices` phải thấy cả hai;
khởi động model → nhãn hiện `GPU Vulkan · <GPU rời> (N/M layer)`, Task Manager → GPU rời có "Dedicated GPU memory" tăng,
iGPU không tăng "Shared GPU memory". Model 7B trên GPU 4 GB → N < M (một phần chạy RAM) chứ không rơi hẳn về `CPU`.
