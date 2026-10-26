# Câu hỏi vấn đáp

- **Mục đích:** AI tự tạo câu hỏi vấn đáp dựa vào bài code của từng sinh viên để giáo viên hỏi trực tiếp, kiểm tra sinh
  viên có hiểu code mình nộp hay không. Bật / tắt **theo từng assignment**.
- **File:** `src/main/integrity/questions.ts`, `src/main/grading/pipeline.ts` (`buildQuestions`, `regenerateQuestions`),
  `src/main/ipc.ts` (`result:aiQuestions`, `assign:save`), `src/shared/types.ts` (`Assignment.questionsEnabled`,
  `questionsMinPercent`), `src/renderer/src/pages/Assignments.tsx` (`InfoTab`),
  `src/renderer/src/pages/CodeReview.tsx` (`QuestionsTab`), `src/renderer/src/pages/Integrity.tsx`
- **Changelog:** [../changelog/ai-questions.md](../changelog/ai-questions.md)

## Logic chính

- Bật trong Assignment → Thông tin, công tắc **"Tự tạo câu hỏi vấn đáp dựa vào bài code"** (`questionsEnabled`, **mặc
  định tắt**); ngưỡng `questionsMinPercent` (mặc định **0** = mọi bài; vd. 60 = chỉ bài nghi dùng AI nhiều), `assign:save`
  làm tròn và giới hạn 0–100. Chỉ hiện với assignment chấm code.
- Khi chấm: assignment bật và % AI ≥ ngưỡng → tạo câu hỏi ngay sau bước ước lượng; lỗi chỉ lưu vào `ai_questions.error`,
  không làm hỏng kết quả chấm.
- Tab Câu hỏi (Code Review) và cột Câu hỏi (Integrity) chỉ hiện khi assignment đang chọn bật tính năng.
- Giáo viên bấm "Tạo câu hỏi / Tạo lại" trong Code Review → `regenerateQuestions` (đọc lại bài từ zip). Bị chặn khi Local
  AI đang chấm hàng đợi, hoặc bài đó đang được tạo câu hỏi.
- Chọn đoạn đưa vào prompt: đoạn nghi AI nhất trước (bỏ code khung), mỗi đoạn tối đa 60 dòng, trong ngân sách token
  (≤ 12k; context theo `effectiveContext` — Local tối đa 32K, Cloud = `contextSize`).
- Chỉ áp dụng cho assignment chấm code: assignment báo cáo bỏ qua bước này, `regenerateQuestions` báo lỗi.
- AI trả JSON `{ questions: [...] }` (3–8 câu, mục tiêu 6), mỗi câu gắn file / dòng; kiểm tra dòng tồn tại, thử lại 1 lần
  nếu không hợp lệ. Ngôn ngữ theo chủ assignment; Cloud + `anonymizeCloud` → ẩn danh như khi chấm.
- Lưu `results.ai_questions = { generatedAt, model, aiPercent, items, error? }`.

## Lưu ý / giới hạn

- Reset & chấm lại xoá câu hỏi đã tạo.
- Trước đây bật chung trong Cài đặt (`aiQuestionsEnabled` / `aiQuestionsMinPercent`) — đã bỏ; giá trị cũ trong DB bị bỏ
  qua, assignment cũ mặc định tắt.

## Test

`npm run typecheck`. Thủ công: Assignment → Thông tin → bật "Tự tạo câu hỏi vấn đáp", ngưỡng 0 → Lưu → chấm 1 bài → tab
Câu hỏi có danh sách câu hỏi trỏ đúng dòng code. Assignment khác (chưa bật) → không có tab Câu hỏi, chấm không tạo câu hỏi.
