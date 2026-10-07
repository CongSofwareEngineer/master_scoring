# So sánh trùng lặp (Integrity)

- **Mục đích:** Phát hiện các bài giống nhau trong cùng assignment (kiểu MOSS), gom nhóm nghi chép bài.
- **File:** `src/main/integrity/fingerprint.ts`, `src/main/integrity/service.ts`, `src/main/integrity/starter.ts`,
  `src/main/grading/pipeline.ts` (bước 8), `src/main/grading/queue.ts`, `src/main/ipc.ts` (`integrity:*`),
  `src/renderer/src/pages/Integrity.tsx`
- **Changelog:** [../changelog/similarity.md](../changelog/similarity.md)

## Logic chính

- Bật trong Cài đặt → Chung (`similarityEnabled`, **mặc định tắt**); ngưỡng hiển thị `similarityThreshold` (30–100%,
  mặc định 70%).
- **Fingerprint (lúc chấm):** chuẩn hoá code (bỏ comment / khoảng trắng, thay tên định danh không phải từ khoá) → token
  → k-gram (K = 10) hash FNV-1a → winnowing (W = 5). Lưu `{files, h, f, l}` vào `results.fingerprint` (không lưu code).
  File báo cáo `.docx` (văn bản đã chuyển): token = từ (`tokenizeWords`, bỏ dấu, chữ thường), k-gram `K_TEXT` = 8 từ.
- **So sánh:** chạy **sau khi chấm xong cả lớp** (tự động nếu bật) hoặc bấm tay; so từng cặp tuần tự, nhường event loop
  mỗi vòng. Hash thuộc code khung bị loại. Mỗi bài cần ≥ 8 hash. Độ giống = trung bình (chung/A, chung/B) × 100. Lưu
  cặp ≥ 30% vào `integrity_pairs` kèm ≤ 400 vị trí trùng (file, dòng) để xem song song.
- **Tổng quan:** cặp ≥ ngưỡng; nhóm (union-find) ≥ 3 sinh viên; thống kê theo sinh viên (bài giống nhất, số cặp vượt
  ngưỡng), phân bố theo khoảng (≥ 90%, 80–90%…). Trang Liêm chính cũng liệt kê tín hiệu AI (% AI, độ tin cậy, điểm trừ,
  số câu hỏi).
- Tiến độ qua sự kiện `integrity:status`. Reset assignment → `clearIntegrity`.

## Lưu ý / giới hạn

- Số cặp tăng theo n² — lớp rất lớn sẽ chạy lâu.
- `lastRun` chỉ giữ trong RAM (mất khi tắt app).

## Test

Thủ công: bật tính năng, 2 bài copy nhau chỉ đổi tên biến → cặp ~90–100%; 3 bài giống nhau → 1 nhóm; có code khung →
phần khung không làm tăng độ giống.
