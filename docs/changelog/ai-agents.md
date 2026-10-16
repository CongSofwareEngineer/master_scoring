# Changelog: Kiến trúc agent AI (tool calling)

> Hiện trạng logic: [../instruction/ai-agents.md](../instruction/ai-agents.md)

- 2026-10-16 | Thêm mới | Kiến trúc agent AI: khung `src/main/agents/` (base / llm / runAgent / constants, registry `agents/` + `tools/`), body gọi Local và Cloud theo tool calling chuẩn OpenAI (`tools`, `tool_calls`, `role: tool`, `tool_choice`), nhận tool call dạng chữ của model Local nhỏ, vòng cuối `tool_choice: none` — cấu trúc agent cũ (JSON `{action}` trong nội dung, kết quả gửi lại dạng lượt user) chưa chuyên nghiệp; làm lại theo mẫu folder `agents` của giat-say-sieu-sach-client
- 2026-10-16 | Sửa | Quy ước prompt agent: hướng dẫn riêng của công cụ đặt ở `description` công cụ / tham số, không lặp lại trong system prompt (áp dụng cho `data_analyst` + `draw_chart`) — giảm token gửi mỗi vòng
