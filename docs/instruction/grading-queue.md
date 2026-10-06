# Hàng đợi chấm

- **Mục đích:** Chấm lần lượt cả lớp ở nền, có tạm dừng / tiếp tục / huỷ / reset, sống sót qua việc tắt app.
- **File:** `src/main/grading/queue.ts`, `src/main/ipc.ts` (`queue:*`), `src/renderer/src/pages/Queue.tsx`,
  `src/renderer/src/components/Shell.tsx` (badge tiến độ)
- **Changelog:** [../changelog/grading-queue.md](../changelog/grading-queue.md)

## Logic chính

- Chỉ **1 hàng đợi** toàn app (1 assignment tại một thời điểm), chấm **tuần tự** từng sinh viên (Local và Cloud).
- `canStart`: rubric hợp lệ, có ≥ 1 bài `valid`, backend AI dùng được (nếu rubric có tiêu chí `ai`).
- `startQueue(aid, ids, mode)`:
  - `ids` cụ thể → chấm lại các bài đó.
  - `mode = 'remaining'` → bài `pending / failed / cancelled` / chưa chấm.
  - `mode = 'all'` → chấm lại cả lớp **trừ** bài đã duyệt hoặc giáo viên đã sửa điểm.
  - Đang chạy cùng assignment → thêm vào hàng đợi; đang chạy assignment khác → báo lỗi.
- Vòng lặp lấy bài `pending` kế tiếp, gọi `gradeStudent`, cập nhật `done/total`, ETA (trung bình 20 bài gần nhất hoặc
  thời gian chấm trung bình đã lưu). Trạng thái phát qua sự kiện `queue:state`.
- Local AI ngừng giữa chừng → **tạm dừng** hàng đợi ("Tạm dừng: Local AI không sẵn sàng") thay vì đánh lỗi cả lớp.
- `preventSleep` → `powerSaveBlocker` giữ máy không ngủ khi đang chấm.
- Chấm xong cả lớp và bật `similarityEnabled` → tự chạy so sánh trùng lặp.
- **Tạm dừng:** abort bài đang chấm (bài về `pending`). **Huỷ:** các bài chưa xong → `cancelled`, xoá hàng đợi.
- **Reset & chấm lại:** xoá toàn bộ kết quả của assignment (kể cả điểm sửa, duyệt, điểm trừ AI, câu hỏi, fingerprint) +
  kết quả trùng lặp, **giữ ghi chú giáo viên**, rồi chấm lại cả lớp. Kiểm tra `canStart` trước khi xoá.
- **Khôi phục khi mở app:** bài đang chấm dở → `pending`; hàng đợi lưu ở `settings.queueState` được nạp ở trạng thái
  tạm dừng; nếu lần trước đang chạy thì `tryAutoResume` tự tiếp tục khi chủ assignment đăng nhập / AI sẵn sàng.

## Lưu ý / giới hạn

- Không chấm song song (Local AI chỉ có 1 slot `-np 1`; tránh quá tải máy giáo viên).
- Tạo câu hỏi vấn đáp thủ công bị chặn khi Local AI đang chấm hàng đợi.

## Test

Thủ công: chấm cả lớp → tạm dừng → tắt app → mở lại và đăng nhập → hàng đợi tự tiếp tục; dừng Local AI giữa chừng →
hàng đợi tự tạm dừng; Reset → mọi điểm sửa bị xoá, ghi chú còn.
