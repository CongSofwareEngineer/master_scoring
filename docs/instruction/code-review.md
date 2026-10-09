# Code Review & sửa điểm / duyệt bài

- **Mục đích:** Giáo viên xem code từng bài, đối chiếu kết quả chấm, sửa điểm, ghi chú, duyệt bài.
- **File:** `src/main/review.ts` (`listFiles`, `readFile`, `readRawFile`, `searchProject`, cache theo `zipMtime`),
  `src/main/ipc.ts` (`review:*`, `result:*`), `src/renderer/src/pages/CodeReview.tsx`,
  `src/renderer/src/components/CodeViewer.tsx`, `src/renderer/src/components/OfficePreview.tsx`
  (xem trước kiểu Office: `docx-preview` cho Word, `exceljs` cho Excel), `src/renderer/src/pages/Students.tsx`
- **Changelog:** [../changelog/code-review.md](../changelog/code-review.md)

## Logic chính

- **Đọc code:** trực tiếp từ zip gốc qua `loadForGrading` (cùng bộ lọc với lúc chấm) — **không lưu code vào DB**. Cache
  4 bài gần nhất theo `zipMtime`; quét lại / đổi file nộp → `invalidateReview`.
- Cây file, xem file (CodeMirror 6 read-only), tìm kiếm toàn project (≤ 300 kết quả). Mở bài tự chọn file có issue đầu
  tiên.
- **Kết quả:** điểm từng tiêu chí + lý do + bằng chứng (nhảy tới dòng), issues theo nguồn (`Compile`, `Test`, `Static`,
  `AI`), output compile / test case, cảnh báo giải nén, tab nguồn gốc code (% AI theo đoạn), tab câu hỏi vấn đáp.
- **Báo cáo .docx:** file hiện dưới dạng văn bản đã chuyển (heading `#`, bảng `| ô |`); tab Tự động có khung Kiểm tra
  hình thức (số từ, trang, danh sách heading bấm để nhảy dòng, mục thiếu). Nhãn nguồn `static` = "Tự động · Kiểm tra
  hình thức" (`sourceLabel`). Đọc bài theo `gradingProfileId(a)`.
- **Xem trước kiểu Office (bài báo cáo):** với file `.docx`/`.xlsx`, panel file có nút chuyển **Văn bản / Xem trước**.
  - Xem trước lấy đúng bytes Office gốc qua IPC `review:office` → `readRawFile` (đọc từ `rawDocs` trong cache bài,
    `ownStudent` kiểm tra quyền) trả `Uint8Array`.
  - Word: `docx-preview.renderAsync` render vào container (giữ nguyên bố cục/định dạng gần như Word).
  - Excel: `exceljs` đọc workbook rồi dựng **bảng React** (tự escape, không `innerHTML`) — nhiều sheet → tab; tôn trọng
    gộp ô, màu chữ/nền, đậm/nghiêng/gạch chân, canh lề; giá trị áp `numFmt` (ngày + số, tự viết `formatDate` / `formatNumber`).
    Giới hạn `MAX_ROWS = 2000`, `MAX_COLS = 100`.
  - File `.doc`/`.xls` (định dạng nhị phân cũ) hoặc lỗi tải → ở chế độ Xem trước báo "Chưa tải được bản xem trước",
    tự dùng chế độ Văn bản.
  - Nhấp một bằng chứng trên bảng điểm → tự chuyển về chế độ **Văn bản** để nhảy tới đúng dòng.
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
