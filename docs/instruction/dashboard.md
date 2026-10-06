# Dashboard thống kê

- **Mục đích:** Tổng quan một assignment: tiến độ, phân bố điểm, điểm trung bình theo tiêu chí, cảnh báo cần xử lý.
- **File:** `src/main/dashboard.ts`, `src/main/ipc.ts` (`dashboard:get`), `src/renderer/src/pages/Dashboard.tsx`,
  `src/renderer/src/components/Charts.tsx`
- **Changelog:** [../changelog/dashboard.md](../changelog/dashboard.md)

## Logic chính

- Chỉ tính bài `valid` đã `completed` / `reviewed` có tổng điểm.
- Chỉ số: số SV, đã chấm, trung bình, trung vị, max, min, tỉ lệ đạt (≥ `passThreshold`, mặc định 5), số bài còn chờ /
  lỗi, histogram 10 cột (0–10), trung bình từng tiêu chí (ưu tiên điểm sửa).
- AI: số bài tín hiệu AI trung bình / cao, % AI trung bình, số bài bị trừ điểm.
- Trùng lặp (nếu bật): số cặp vượt ngưỡng, số SV bị đánh dấu, số nhóm.
- Cảnh báo: sai tên file, zip hỏng, .rar/.7z, nộp trùng, không compile được, chấm lỗi, chưa nộp — nhấp để lọc danh sách
  sinh viên.
- 8 bài chấm gần nhất.
- Biểu đồ vẽ bằng SVG tự viết (không dùng thư viện chart).

## Lưu ý / giới hạn

- Tính lại toàn bộ mỗi lần mở (đọc `getResult` từng bài) — lớp lớn có thể chậm.

## Test

Thủ công: chấm vài bài → số liệu khớp với trang Sinh viên; nhấp một cảnh báo → mở danh sách đã lọc.
