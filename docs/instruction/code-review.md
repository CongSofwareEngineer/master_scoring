# Code Review & sửa điểm / duyệt bài

- **Mục đích:** Giáo viên xem code từng bài, đối chiếu kết quả chấm, sửa điểm, ghi chú, duyệt bài.
- **File:** `src/main/review.ts`, `src/main/ipc.ts` (`review:*`, `result:*`), `src/renderer/src/pages/CodeReview.tsx`,
  `src/renderer/src/components/CodeViewer.tsx`, `src/renderer/src/pages/Students.tsx`
- **Changelog:** [../changelog/code-review.md](../changelog/code-review.md)

## Logic chính

- **Đọc code:** trực tiếp từ zip gốc qua `loadForGrading` (cùng bộ lọc với lúc chấm) — **không lưu code vào DB**. Cache
  4 bài gần nhất theo `zipMtime`; quét lại / đổi file nộp → `invalidateReview`.
- Cây file, xem file (CodeMirror 6 read-only), tìm kiếm toàn project (≤ 300 kết quả). Mở bài tự chọn file có issue đầu
  tiên.
- **Kết quả:** điểm từng tiêu chí + lý do + bằng chứng (nhảy tới dòng), issues theo nguồn (`Compile`, `Test`, `Static`,
  `AI`), output compile / test case, cảnh báo giải nén, tab nguồn gốc code (% AI theo đoạn), tab câu hỏi vấn đáp.
- **Sửa điểm (`result:override`):** điểm trong 0..max của tiêu chí, làm tròn 2 số; `null` = bỏ sửa. Lưu ở `overrides`,
  được ưu tiên khi tính tổng và **giữ qua các lần chấm lại** (trừ Reset). Bài chưa chấm mà sửa điểm → `completed`.
- **Trừ điểm AI:** áp / bỏ theo quyết định giáo viên (xem `ai-estimate.md`).
- **Ghi chú (`result:note`):** ≤ 5000 ký tự, giữ cả khi Reset.
- **Duyệt (`result:review`):** chỉ bài `completed`; duyệt → `reviewed`, bỏ duyệt → `completed`.

## Lưu ý / giới hạn

- Zip gốc bị xoá / di chuyển → không xem được code (DB chỉ lưu đường dẫn).

## Test

Thủ công: mở bài, nhấp bằng chứng → nhảy đúng dòng; sửa điểm → tổng cập nhật; chấm lại "cả lớp" → bài đã sửa / duyệt
không bị chấm lại.
