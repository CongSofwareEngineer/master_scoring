# Kiến trúc agent AI (tool calling)

- **Mục đích:** Khung chung để xây các trợ lý AI có "công cụ" (tool) — AI tự quyết định gọi công cụ nào (chạy SQL, vẽ
  biểu đồ…), app thực thi ở main và gửi kết quả lại, tới khi AI trả lời bằng chữ. Thay cách cũ "bắt AI trả JSON
  `{action:…}` trong nội dung rồi tự parse". Dùng **tool calling chuẩn OpenAI Chat Completions** (`tools` / `tool_calls` /
  `role: 'tool'`) nên một định dạng body chạy được cho Local AI (llama-server `--jinja`) và Cloud (OpenAI, Gemini, Anthropic,
  OpenAI-compatible). Cấu trúc theo mẫu folder `agents/` của dự án `giat-say-sieu-sach-client`.
- **File:**
  - `src/main/agents/base.ts` — kiểu dữ liệu: `AgentMessage`, `AgentToolCall`, `AgentTool<S>`, `AgentDefinition<S>`,
    `AgentContext<S>`, `ToolParameter`, `AgentReply`; `toConversation` (lọc lịch sử).
  - `src/main/agents/llm.ts` — `callLlm(backend, request)`: dựng body, gửi, đọc `content` + `tool_calls`.
  - `src/main/agents/runAgent.ts` — `runAgent(backend, agent, history, ctx)`: vòng gọi công cụ.
  - `src/main/agents/constants.ts` — `AGENT_NAME`, `TOOL_NAME`.
  - `src/main/agents/agents/` — registry agent (`index.ts`: `AGENT_REGISTRY`, `getAgent`), `dataAnalyst.ts` (agent kế toán).
  - `src/main/agents/tools/` — registry công cụ (`index.ts`), `sql.ts` (`run_sql`), `chart.ts` (`draw_chart`),
    `dataShared.ts` (`DataAgentState` + định dạng kết quả dùng chung).
  - `src/main/agents/index.ts` — export công khai của khung.
  - `src/main/ai/client.ts` — `postCompletion` / `completionBody` / `messageText` (đường gửi HTTP dùng chung, xem `cloud-ai.md`).
  - Nơi dùng: `src/main/datachat/ask.ts` (Trợ lý dữ liệu — `data-chat.md`).
- **Changelog:** [../changelog/ai-agents.md](../changelog/ai-agents.md)

## Logic chính

- **Các lớp** (giống mẫu tham chiếu):
  | Lớp | Vai trò |
  | --- | --- |
  | `base.ts` | Kiểu dữ liệu, không phụ thuộc chức năng cụ thể. Dữ liệu riêng của agent đi qua `ctx.state` (generic `S`). |
  | `llm.ts` | Chuyển `AgentMessage[]` + công cụ → body OpenAI; phản hồi → `{ text, toolCalls }`. |
  | `runAgent.ts` | Vòng: gọi LLM → thực thi công cụ → gửi lượt `tool` → lặp tới khi có câu trả lời chữ. |
  | `agents/*.ts` | Mỗi agent = `name`, `description`, `systemPrompt` (chuỗi hoặc hàm theo `ctx`), `tools`, `maxToolRounds`, `maxTokens`. |
  | `tools/*.ts` | Mỗi công cụ = `name`, `description`, `parameters` (JSON Schema), `execute(args, ctx) → string`. |

  Hướng dẫn riêng của một công cụ (cách dùng tham số, chọn loại…) đặt trong `description` của công cụ / tham số, **không lặp lại**
  trong system prompt — schema công cụ luôn được gửi kèm mỗi vòng, lặp lại chỉ tốn token.
- **Body gửi AI** (`callLlm` → `postCompletion`, cùng định dạng cho Local và Cloud):
  ```jsonc
  {
    "model": "…", "temperature": 0, "max_tokens": 4096, "stream": false, "repeat_penalty": 1.1, // repeat_penalty chỉ Local
    "messages": [
      { "role": "system", "content": "<system prompt của agent>" },
      { "role": "user", "content": "…" },
      { "role": "assistant", "content": null,
        "tool_calls": [{ "id": "call_1", "type": "function", "function": { "name": "run_sql", "arguments": "{\"sql\":\"…\"}" } }] },
      { "role": "tool", "tool_call_id": "call_1", "content": "KẾT QUẢ (1 dòng): …" }
    ],
    "tools": [{ "type": "function", "function": { "name": "run_sql", "description": "…", "parameters": { "type": "object", … } } }],
    "tool_choice": "auto" // vòng cuối: "none"
  }
  ```
  - Lượt assistant chỉ gọi công cụ gửi `content: null` (chuỗi rỗng bị một số nhà cung cấp coi là khối text rỗng → lỗi).
  - Lượt `tool` chỉ gửi `tool_call_id` + `content` (không gửi `name` — trường lạ với OpenAI).
  - Không gửi `response_format` cùng `tools`.
- **Đọc phản hồi:** `content` (chuỗi hoặc mảng part) + `tool_calls[].function.{name, arguments}` (arguments là chuỗi JSON →
  parse an toàn, lỗi → `{}`). Thiếu `id` → tự sinh `call_…` để ghép với lượt `tool`.
  - **Tool call dạng chữ** (model Local nhỏ, vd Qwen2.5-Coder trả ```` ```json {"name":"run_sql","arguments":{…}} ```` trong
    `content` thay vì `tool_calls`): nếu không có `tool_calls` thì nhận `<tool_call>{…}</tool_call>` hoặc cả nội dung là JSON
    `{name, arguments}` — chỉ khi `name` trùng công cụ đã khai báo và `tool_choice` ≠ `none`.
- **Vòng gọi công cụ (`runAgent`):**
  1. Mỗi vòng báo tiến trình qua `ctx.onStep` ("AI đang phân tích câu hỏi…" vòng đầu, "AI đang đọc kết quả…" các vòng sau).
  2. AI trả `tool_calls` → thêm lượt assistant (kèm tool calls) → chạy lần lượt từng công cụ; công cụ không tồn tại / ném lỗi
     → nội dung lượt `tool` là thông báo `LỖI …` để AI tự sửa (vòng không dừng). Đã bấm huỷ (`ctx.signal`) → dừng ngay.
  3. AI trả chữ (không gọi công cụ) → kết thúc, `AgentReply { text, messages, exhausted: false }`.
  4. Hết `maxToolRounds` (mặc định 6) → thêm lượt user nhắc "Đã hết lượt gọi công cụ…", gửi vẫn kèm `tools` nhưng
     `tool_choice: 'none'` (Anthropic bắt buộc khai báo tools khi hội thoại có tool call), lấy chữ trả về, `exhausted: true`.
- **Lịch sử:** `toConversation(history, message, max)` chỉ giữ lượt user / assistant có chữ (bỏ lượt tool và lượt chỉ có tool
  call), lấy `max` lượt gần nhất rồi thêm câu hỏi mới. Lượt tool chỉ sống trong một lần `runAgent`.
- **Công cụ ghi kết quả phụ vào `ctx.state`** (vd `run_sql` đẩy `DataQuery` vào `state.queries`, `draw_chart` đẩy `DataChart`
  vào `state.charts`) để nơi gọi lưu / hiển thị — chuỗi trả về chỉ dành cho AI đọc.
- **Thêm agent / công cụ mới:** tạo file trong `tools/` → export ở `tools/index.ts` → đặt tên trong `constants.ts`
  (`TOOL_NAME`, chỉ `a-z0-9_`) → tạo agent trong `agents/` (system prompt + danh sách tools) → đăng ký `AGENT_REGISTRY` →
  nơi dùng gọi `runAgent(backend, getAgent(…), toConversation(…), ctx)`.
- **Agent hiện có:**
  | Agent | Công cụ | Dùng ở |
  | --- | --- | --- |
  | `data_analyst` — kế toán trưởng | `run_sql`, `draw_chart` | Trợ lý dữ liệu (`data-chat.md`) |

## Lưu ý / giới hạn

- Chưa có agent điều phối (router) như mẫu tham chiếu — hiện chỉ một agent nên gọi thẳng, tránh tốn thêm một lượt AI (Local
  chậm). Khi có ≥ 2 agent cùng một khung chat thì thêm `agents/router.ts` (công cụ `route_to_agent`, enum = tên agent).
- Local AI cần llama-server chạy với `--jinja` (thêm sẵn trong `llama.ts`); model không hỗ trợ tool calling vẫn chạy được nhờ
  nhận dạng tool call dạng chữ, nhưng kém ổn định hơn Cloud.
- Nhà cung cấp Cloud / OpenAI-compatible không hỗ trợ `tools` → lỗi "Model / nhà cung cấp AI này không hỗ trợ gọi công cụ".
- Phần chấm điểm (`grading/`, `integrity/questions.ts`, `reports/translate.ts`) vẫn dùng `chat()` + JSON schema (một lượt,
  không cần công cụ).

## Test

`npm run typecheck`. Thủ công (`npm run dev`): trang Phân tích dữ liệu → hỏi bằng Local AI và từng Cloud đã cấu hình:
"Tổng số tiền là bao nhiêu?" (mở "Truy vấn đã chạy" thấy SQL), "Vẽ biểu đồ cột doanh thu theo chi nhánh" (có biểu đồ), câu
chào hỏi không liên quan (trả lời không chạy truy vấn), bấm Dừng giữa chừng ("Đã dừng."). Kiểm tra body bằng nhật ký mạng
(Cloud). Kiểm tra nhanh llama-server: chạy `llama-server -m <gguf> --jinja` rồi POST body mẫu ở trên tới `/v1/chat/completions`.
