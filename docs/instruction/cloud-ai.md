# Cloud AI & client gọi AI

- **Mục đích:** Một client chung (chuẩn OpenAI Chat Completions) cho Local và Cloud; cấu hình nhà cung cấp Cloud và API
  key cho từng giáo viên.
- **File:** `src/main/ai/client.ts`, `src/main/secrets.ts`, `src/shared/constants.ts` (`CLOUD_PROVIDERS`),
  `src/main/ipc.ts` (`ai:cloudConfig|saveCloud|testCloud`), `src/renderer/src/pages/AiModels.tsx`,
  `src/renderer/src/pages/AiSetup.tsx`
- **Changelog:** [../changelog/cloud-ai.md](../changelog/cloud-ai.md)

## Logic chính

- **Nhà cung cấp:** Gemini (endpoint OpenAI-compatible của Google), OpenAI, Anthropic, OpenAI-compatible (tự nhập URL).
  Model mặc định và danh sách gợi ý trong `CLOUD_PROVIDERS`.
- **API key:** lưu bảng `secrets` theo user (`cloud:<provider>`), mã hoá bằng Electron `safeStorage` (Windows = DPAPI).
  Model và URL compatible lưu trong `settings.cloudConfig` của user. Key trống → xoá.
- `cloudBackend(userId, provider, model)` / `localBackend()` trả về `BackendConfig { kind, baseUrl, apiKey, model }`.
  Assignment Cloud dùng key của **chủ assignment**.
- **`chat(backend, messages, opts)`:**
  - `temperature 0`; Local thêm `repeat_penalty 1.1`.
  - JSON schema: Local / OpenAI / Gemini dùng `response_format json_schema`; compatible dùng `json_object`;
    nhà cung cấp trả 400/422 → gửi lại không kèm `response_format`.
  - 429 → chờ theo `Retry-After` hoặc lùi dần (tối đa 5 lần).
  - Timeout: Local 20 phút, Cloud 3 phút. Lỗi HTTP được phân loại (`auth`, `quota`, `model`, `server`…) với thông báo
    tiếng Việt dễ hiểu.
  - Cloud đi qua `netFetch` (ghi nhật ký mạng).
- **Test kết nối:** gửi "Reply with the single word: OK".
- **Quyền riêng tư:** assignment Cloud bắt buộc tick đồng ý gửi code ra ngoài (`cloudConsent`); `anonymizeCloud` (mặc
  định bật) ẩn họ tên / MSSV trước khi gửi (xem `grading-pipeline.md`).

## Lưu ý / giới hạn

- Anthropic gọi qua endpoint `/v1/chat/completions` kèm header `x-api-key` + `anthropic-version`.
- Key mã hoá theo tài khoản hệ điều hành → backup khôi phục sang máy khác phải nhập lại key.

## Test

Thủ công: nhập key sai → "Sai API key"; key đúng → test trả "OK"; chấm 1 bài bằng Cloud → nhật ký mạng có dòng gọi API.
