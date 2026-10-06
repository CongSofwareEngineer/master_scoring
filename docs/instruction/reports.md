# Xuất báo cáo (Excel / CSV / PDF)

- **Mục đích:** Xuất bảng điểm và nhận xét từng sinh viên theo ngôn ngữ giáo viên đang chọn.
- **File:** `src/main/reports/reports.ts`, `src/main/reports/translate.ts`, `src/main/ipc.ts` (`reports:*`),
  `src/renderer/src/pages/Reports.tsx`, `src/shared/i18n.ts`
- **Changelog:** [../changelog/reports.md](../changelog/reports.md)

## Logic chính

- **Cột (`reportColumns`):** STT, MSSV, Họ tên, từng tiêu chí rubric, Tổng, Trạng thái, Backend, Ghi chú giáo viên,
  Trùng lặp cao nhất (chỉ khi bật), Tín hiệu AI, % code AI, % SV tự viết, độ tin cậy, trừ điểm AI. Giáo viên chọn cột.
- **Excel (.xlsx)** bằng exceljs; **CSV** UTF-8 có BOM (Excel Windows đọc đúng tiếng Việt).
- **PDF:** dựng HTML → cửa sổ ẩn (sandbox, tắt JS) → `printToPDF` A4. Một file cho cả lớp hoặc **mỗi sinh viên 1 file**
  (`<MSSV>_<Họ_tên>.pdf` trong thư mục chọn). Chỉ gồm bài đã chấm xong; issue bỏ mức info, tối đa 12.
- Tên file mặc định: `<TênAssignment>_<Lớp>_<YYYYMMDD>.<ext>`.
- **Ngôn ngữ:** = `lang` của giáo viên. Chuỗi app sinh dùng `translate` / `localizeStored`. Nội dung AI viết sai ngôn ngữ
  (`isWrongLanguage` theo dấu tiếng Việt) → dịch bằng backend của assignment theo lô (≤ 12 đoạn / 2400 ký tự, lô hỏng thì
  dịch lẻ), cache trong phiên. Dịch lỗi → vẫn xuất, báo số đoạn chưa dịch.

## Lưu ý / giới hạn

- Dịch khi xuất cần AI sẵn sàng (Local đang chạy hoặc Cloud có key).

## Test

Thủ công: xuất Excel / CSV / PDF ở tiếng Việt và English; chấm bằng tiếng Việt rồi xuất English → nhận xét AI được dịch.
