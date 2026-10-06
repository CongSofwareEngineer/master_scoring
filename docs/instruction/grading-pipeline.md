# Pipeline chấm 1 sinh viên

- **Mục đích:** Chấm trọn vẹn một bài nộp: giải nén → kiểm tra tự động → AI chấm theo rubric → ước lượng % code AI →
  tổng điểm → fingerprint → lưu kết quả.
- **File:** `src/main/grading/pipeline.ts`, `src/main/grading/prompt.ts`, `src/main/repo.ts` (`computeTotal`,
  `updateResult`, `setStatus`), `src/shared/constants.ts` (`STATUS_META`, `SOURCE_LABEL`)
- **Changelog:** [../changelog/grading-pipeline.md](../changelog/grading-pipeline.md)

## Logic chính

`gradeStudent(student, assignment, signal, onStep, onStatus)`:

1. **Giải nén** (`extracting`): `loadForGrading` lọc theo profile / tự nhận diện (xem `tech-profiles.md`,
   `zip-extract.md`). Không còn file → lỗi "Không tìm thấy mã nguồn".
2. **Kiểm tra tự động** (`analyzing`): `runStatic` (xem `static-analysis.md`); nếu rubric có tiêu chí `compile`/`test`:
   C/C++ → `compileAndTest`; Android → `gradle assembleDebug` (chỉ khi profile bật build và có SDK/JDK, dùng Gradle của
   máy giáo viên, không chạy `gradlew` của sinh viên); Next.js / khác → bỏ qua kèm lý do.
3. **Điểm tiêu chí tự động:** `compile` = đạt max / 0; `test` = max × số test đạt / tổng; `static` = `staticScore`;
   `teacher` để trống cho giáo viên chấm.
4. **AI chấm** (`ai_grading`, chỉ khi có tiêu chí `ai`):
   - `backendFor(a)`: Cloud cần `cloudConsent`; Local cần llama-server `ready`.
   - Cloud + `anonymizeCloud`: thay họ tên / MSSV (có dấu, không dấu, viết liền, gạch dưới) bằng `SV-xxxxxx` trong code,
     đường dẫn và mô tả đề; khôi phục đường dẫn gốc sau khi nhận kết quả.
   - Ngân sách token = context (Local: `contextSize`; Cloud: 120k) − 1800 output − prompt. File sắp theo mức quan trọng
     (`importance` theo profile). Vượt ngân sách → tóm tắt từng file (≤ 300 token) rồi thêm toàn văn file quan trọng
     còn vừa.
   - Prompt yêu cầu JSON theo `gradingSchema` (criteria + evidence file/dòng, issues, summary, aiSignal, aiHint), viết
     theo ngôn ngữ của **chủ assignment**. Thử tối đa 3 lần: JSON hỏng / `validateAi` lỗi (thiếu tiêu chí, điểm ngoài
     0..max, bằng chứng trỏ dòng không tồn tại) → gửi lỗi lại cho AI sửa. Lần 3 nới kiểm tra bằng chứng. Vẫn hỏng →
     `failed` "Hãy chấm tay".
5. Gắn issue tự động vào tiêu chí cùng nguồn.
6. **Ước lượng % code AI** + điểm trừ theo chính sách, **câu hỏi vấn đáp** nếu bật và % AI ≥ ngưỡng (lỗi bước này không
   làm hỏng kết quả) — xem `ai-estimate.md`, `ai-questions.md`.
7. **Tổng điểm** = Σ điểm tiêu chí (ưu tiên điểm giáo viên đã sửa còn hợp lệ) − điểm trừ AI (nếu áp), không âm.
8. **Fingerprint** cho so sánh trùng lặp.
9. **Lưu:** status `completed` (giữ `reviewed` nếu đã duyệt), backend (`Local` / `Cloud` / `Tự động`), model, criteria,
   issues, summary, auto, cảnh báo, profile nhận diện, thời gian chấm.

- Huỷ / tạm dừng (`signal.aborted`) → bài về `pending` và ném lỗi cho hàng đợi; lỗi khác → `failed` + `error`.
- Luôn xoá thư mục làm việc `w/<studentId>` sau khi chấm.

## Lưu ý / giới hạn

- Trạng thái chấm: `pending → extracting → analyzing → ai_grading → completed / failed / cancelled`, `reviewed` khi
  giáo viên duyệt.
- Chuỗi lý do tự động lưu tiếng Việt — nếu thêm chuỗi có tham số cần thêm pattern trong `i18n.ts`.
- Model nhỏ (1.5B) dễ trả JSON lỗi → đã có `repeat_penalty` và chỉ gửi lại 600 ký tự phản hồi hỏng.

## Test

`npm run typecheck`. Thủ công: chấm 1 bài C++ có test case với Local AI và với Cloud AI; bài zip rỗng → `failed` có lý
do; bấm tạm dừng giữa lúc AI chấm → bài về "Chờ chấm".
