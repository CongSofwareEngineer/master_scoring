# Cloud AI & client gọi AI

- **Mục đích:** Một client chung (chuẩn OpenAI Chat Completions) cho Local và Cloud. Cloud là **một Cloud API chung** cho
  mỗi giáo viên: chỉ cần URL + API key + model — dùng được DeepSeek, OpenRouter, Kilo, OpenCode, 9Router, Ollama, OpenAI,
  Gemini… (mọi API chuẩn OpenAI).
- **File:** `src/main/ai/client.ts`, `src/main/secrets.ts`, `src/main/ai/manager.ts` (`cloudConfigured`),
  `src/main/ipc.ts` (`ai:cloudConfig|saveCloud|testCloud`), `src/renderer/src/components/AiWidgets.tsx`
  (`CloudConfigForm`, `CloudApiToggle`), `src/renderer/src/pages/AiModels.tsx`, `src/renderer/src/pages/AiSetup.tsx`,
  `src/renderer/src/pages/Assignments.tsx` (backend Cloud API)
- **Changelog:** [../changelog/cloud-ai.md](../changelog/cloud-ai.md)

## Logic chính

- **Cấu hình:** `settings.cloudConfig` (theo user) = `{ url, model }`; API key ở bảng `secrets` tên `cloud:api`, mã hoá
  bằng Electron `safeStorage` (Windows = DPAPI, macOS = Keychain). Key **không bắt buộc** (Ollama / server nội bộ không cần
  key). URL được chuẩn hoá: bỏ `/` cuối và đuôi `/chat/completions` nếu giáo viên dán cả endpoint.
- **"Đã cấu hình"** (`AiStatus.cloudConfigured: boolean`) = có URL và model.
- **Giao diện:** ô tích **"Dùng Cloud API"** (`CloudApiToggle`) ở AI Models và màn hình cấu hình AI lần đầu — tích vào thì
  hiện form URL (có gợi ý URL hay dùng qua datalist), Model, API Key, nút Kiểm tra kết nối / Lưu. Đã cấu hình → mở sẵn.
  Trong Assignment, chọn backend **Cloud API** → hiện ngay form đó (sửa cấu hình chung của giáo viên) + ô đồng ý gửi code.
- **IPC:** `ai:cloudConfig` → `{ url, model, hasKey }`; `ai:saveCloud(url, model, apiKey)` (apiKey `null` = giữ key cũ,
  `''` = xoá); `ai:testCloud(url, model, apiKey)` lưu rồi gửi thử. Cả hai phát `ai:cloud-changed` để renderer tải lại
  trạng thái AI.
- `cloudBackend(userId)` / `localBackend()` trả về `BackendConfig { kind, baseUrl, apiKey, model, label }`; label Cloud =
  `Cloud API: <host>`. Assignment Cloud dùng cấu hình của **chủ assignment**.
- **Chuyển dữ liệu cũ:** bản trước chọn theo nhà cung cấp (`cloud:gemini|openai|anthropic|compatible` +
  `{ compatibleUrl, models }`). Lần đầu đọc `getCloudConfig` mà chưa có `url` → lấy nhà cung cấp đầu tiên có key (thứ tự
  gemini → openai → anthropic → compatible), đổi sang URL + model tương ứng, chép key sang `cloud:api`, xoá key cũ.
- **Gửi request:** `postCompletion(backend, body, signal)` gửi `/chat/completions` và trả `choices[0].message` — dùng chung cho
  `chat()` và khung agent (`src/main/agents/llm.ts`, tool calling). Header `Authorization: Bearer <key>` khi có key; URL host
  `*.anthropic.com` thêm `x-api-key` + `anthropic-version`. `completionBody(backend, maxTokens)` = phần body chung (`model`,
  `temperature 0`, `max_tokens`, `stream: false`, Local thêm `repeat_penalty 1.1`); `messageText(content)` đọc chữ. Body có
  `tools` mà nhà cung cấp trả 4xx nhắc tới tool / function / jinja → lỗi "không hỗ trợ gọi công cụ".
- **`chat(backend, messages, opts)`:**
  - JSON schema: Local dùng `response_format json_schema`; Cloud dùng `json_object` (được nhiều nhà cung cấp hỗ trợ nhất);
    nhà cung cấp trả 400/422 → gửi lại không kèm `response_format`.
  - 429 → chờ theo `Retry-After` hoặc lùi dần (tối đa 5 lần).
  - Timeout: Local 20 phút, Cloud 3 phút. Lỗi HTTP được phân loại (`auth`, `quota`, `model`, `server`…) với thông báo
    tiếng Việt dễ hiểu.
  - Cloud đi qua `netFetch` (ghi nhật ký mạng).
- **Context:** ngân sách prompt của Cloud = `contextSize` trong AI Models (mặc định 32K, chọn được 100K / 150K / 200K —
  `effectiveContext('cloud', …)`, tối đa `MAX_CONTEXT` 200K). Chọn ≤ giới hạn context của model, vượt → nhà cung cấp báo lỗi.
- **Test kết nối:** gửi "Reply with the single word: OK".
- **Quyền riêng tư:** assignment Cloud bắt buộc tick đồng ý gửi code ra ngoài (`cloudConsent`); `anonymizeCloud` (mặc
  định bật) ẩn họ tên / MSSV trước khi gửi (xem `grading-pipeline.md`).

## Lưu ý / giới hạn

- Mỗi giáo viên chỉ có **một** cấu hình Cloud API; mọi assignment Cloud của giáo viên đó dùng chung URL / model.
- Assignment cũ còn field `cloudProvider` / `cloudModel` trong JSON — không còn đọc.
- Key mã hoá theo tài khoản hệ điều hành → backup khôi phục sang máy khác phải nhập lại key.
- Nhà cung cấp không hỗ trợ cả `json_object` lẫn tool calling vẫn chấm được (gửi lại không kèm `response_format`), nhưng
  Trợ lý dữ liệu (tool calling) sẽ báo lỗi.

## Test

`npm run typecheck`. Thủ công: AI Models → tích "Dùng Cloud API" → nhập URL (vd. `https://api.deepseek.com/v1`), model,
key sai → "Sai API key"; key đúng → test trả "OK"; Ollama `http://localhost:11434/v1` không key → test OK. Máy có cấu hình
Gemini cũ → mở app thấy URL Gemini + model cũ, key giữ nguyên. Chấm 1 bài bằng Cloud API → nhật ký mạng có dòng gọi API.
