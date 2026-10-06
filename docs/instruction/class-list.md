# Danh sách lớp (Excel/CSV)

- **Mục đích:** Đối chiếu MSSV → họ tên chuẩn và phát hiện sinh viên chưa nộp bài.
- **File:** `src/main/importer/classlist.ts`, `src/main/ipc.ts` (`assign:importClassList`), `src/main/importer/scan.ts`,
  `src/renderer/src/pages/Assignments.tsx`
- **Changelog:** [../changelog/class-list.md](../changelog/class-list.md)

## Logic chính

- Hỗ trợ `.xlsx` (sheet đầu, đọc bằng exceljs) và `.csv` / `.txt` (tự nhận dấu phân cách `;` `,` hoặc tab; giải mã
  UTF-8 / UTF-16 BOM / CP1258 qua `decodeText`).
- Tìm dòng tiêu đề trong 10 dòng đầu (so khớp không dấu): cột MSSV (`mssv`, `ma sv`, `student id`, `id`…), cột họ tên
  (`ho ten`, `full name`…) hoặc cặp cột `ho` + `ten`.
- Không có tiêu đề: lấy cột đầu tiên có dữ liệu ở ≥ 1/2 số dòng làm MSSV, cột kế bên làm họ tên.
- Bỏ MSSV trùng / trống; tên chuẩn hoá NFC. Kết quả lưu vào `assignment.classList`.
- Khi quét bài: tên SV lấy theo danh sách lớp; MSSV có trong danh sách mà chưa có bài `valid` → dòng `missing`.

## Lưu ý / giới hạn

- Không có ràng buộc định dạng MSSV — MSSV so khớp chính xác (sau `trim`) với phần sau dấu `_` của tên file.

## Test

Thủ công: import file Excel có tiêu đề "MSSV / Họ và tên", file CSV không tiêu đề dùng `;` → kiểm tra danh sách lớp và
dòng "Chưa nộp" sau khi quét.
