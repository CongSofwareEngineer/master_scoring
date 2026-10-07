# Ước lượng % code AI & trừ điểm

- **Mục đích:** Ước lượng phần trăm code do AI viết / sinh viên tự viết cho từng bài, và trừ điểm theo chính sách của
  assignment. Đây là **ước lượng thống kê để giáo viên xem xét, không phải bằng chứng**.
- **File:** `src/main/integrity/aiEstimate.ts`, `src/shared/aiPolicy.ts`, `src/shared/constants.ts`
  (`DEFAULT_AI_POLICY`, `CONFIDENCE_*`), `src/main/integrity/starter.ts`, `src/main/grading/pipeline.ts` (bước 6),
  `src/main/repo.ts` (`computeTotal`, `recomputePenalties`), `src/main/ipc.ts` (`result:aiPenalty`),
  `src/renderer/src/pages/Assignments.tsx` (`AiPolicyTab`), `src/renderer/src/pages/CodeReview.tsx` (`OriginTab`)
- **Changelog:** [../changelog/ai-estimate.md](../changelog/ai-estimate.md)

## Logic chính

- **Ước lượng (`estimateAiCode`):**
  1. Chia mỗi file code (java, kt, js/ts, c/cpp, header) thành đoạn: hàm / khối giữa các hàm, kèm comment ngay trên hàm;
     hàm rất dài tách tiếp 1 cấp; mảnh nhỏ liền nhau gộp lại.
  2. Đặc trưng phong cách → xác suất AI (logistic, trọng số chọn tay). Dấu hiệu AI: comment kiểu chatbot, Javadoc/JSDoc
     đầy đủ, tên biến dài kiểu mô tả, cú pháp vượt mức môn học, format đồng đều tuyệt đối, chuỗi tiếng Anh trau chuốt,
     emoji. Dấu hiệu sinh viên: format lệch, viết dính `for(int i=0;i<n;i++)`, tên/comment tiếng Việt không dấu, code
     comment lại, dấu vết debug, `system("pause")`/`getch()`.
  3. Đoạn lệch phong cách so với phần "giống sinh viên" của chính bài → tăng xác suất (bài trộn).
  4. Dòng trùng **code khung** (k-gram từ `starterDir`, cache theo mtime) và file do IDE/công cụ sinh → loại khỏi phép
     tính.
  5. Trộn nhận định LLM (từ bước AI chấm): `aiPercent = 0.75 × heuristic + 0.25 × LLM`.
  - **Độ tin cậy:** `high` khi ≥ 120 dòng tự viết và tín hiệu rõ; `medium` khi đủ 30–60 dòng; < 20 dòng → `low`;
    heuristic và LLM lệch > 40% → hạ 1 bậc.
  - Kết quả: `aiPercent`, `studentPercent`, `starterPercent`, `confidence`, % theo file, danh sách đoạn kèm lý do.
  - `levelFromEstimate`: ≥ 60% → high, ≥ 30% → medium; độ tin cậy thấp không xếp high.
- **Báo cáo .docx (`estimateAiText`):** không dùng heuristic code; % = `ai_percent` của AI chấm bài, độ tin cậy luôn
  `low` → chế độ tự trừ mặc định (≥ Trung bình) chỉ đề xuất. Xem [report-grading.md](report-grading.md).
- **Chính sách (`AiPolicy` theo assignment):** `penaltyMode` ∈ `off | suggest | auto`, `tiers` (mặc định
  40% → −1, 60% → −2, 80% → −4), `minConfidence` (mặc định `medium`).
- **`evaluatePenalty`:** chọn bậc cao nhất ≤ % AI. `auto` chỉ tự áp khi độ tin cậy ≥ `minConfidence`; `suggest` chỉ đề
  xuất. Giáo viên áp / bỏ trừ (`decidedBy = 'teacher'`) được giữ khi chấm lại / đổi chính sách, chỉ cập nhật số điểm.
- Tổng điểm trừ `deduct` nếu `applied`, không âm (`computeTotal`). Đổi chính sách → `recomputePenalties` cho cả lớp.

## Lưu ý / giới hạn

- Heuristic có thể sai, nhất là bài ngắn → UI luôn hiển thị độ tin cậy và lý do từng đoạn.
- Bậc trừ: % trong 0–100, điểm trừ 0–10, bậc có điểm trừ 0 bị bỏ.

## Test

Thủ công: chấm bài sinh viên tự viết và bài sinh bằng ChatGPT → so sánh %; đổi `penaltyMode` sang `suggest` → tổng điểm
không còn trừ; giáo viên bỏ trừ → chấm lại vẫn giữ quyết định.
