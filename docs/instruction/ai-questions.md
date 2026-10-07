# Câu hỏi vấn đáp

- **Mục đích:** Với bài có % code AI cao, AI đề xuất câu hỏi để giáo viên hỏi trực tiếp, kiểm tra sinh viên có hiểu code
  mình nộp hay không.
- **File:** `src/main/integrity/questions.ts`, `src/main/grading/pipeline.ts` (`buildQuestions`, `regenerateQuestions`),
  `src/main/ipc.ts` (`result:aiQuestions`), `src/renderer/src/pages/CodeReview.tsx` (`QuestionsTab`),
  `src/renderer/src/pages/Integrity.tsx`
- **Changelog:** [../changelog/ai-questions.md](../changelog/ai-questions.md)

## Logic chính

- Bật trong Cài đặt → Chung (`aiQuestionsEnabled`, **mặc định tắt**); ngưỡng `aiQuestionsMinPercent` (mặc định 60%).
- Khi chấm: % AI ≥ ngưỡng → tạo câu hỏi ngay sau bước ước lượng; lỗi chỉ lưu vào `ai_questions.error`, không làm hỏng
  kết quả chấm.
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

## Test

Thủ công: bật tính năng, ngưỡng 0% → chấm 1 bài → tab Câu hỏi có danh sách câu hỏi trỏ đúng dòng code.
