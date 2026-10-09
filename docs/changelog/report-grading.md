# Changelog: Chấm báo cáo (Word / Excel / PowerPoint)

> Hiện trạng logic: [../instruction/report-grading.md](../instruction/report-grading.md)

- 2026-10-07 | Thêm mới | Chấm báo cáo (.docx): assignment loại "Chấm báo cáo" — đọc file Word thành văn bản, tab Kiểm tra hình thức (số từ, mục bắt buộc, tài liệu tham khảo), rubric mẫu báo cáo, prompt AI riêng cho báo cáo + tóm tắt từng đoạn khi dài, % văn bản AI chỉ theo nhận định AI (độ tin cậy thấp), fingerprint theo từ, khung Kiểm tra hình thức trong Code Review — chấm code đã ổn, cần chấm thêm báo cáo cuối kỳ với filter chấm khác chấm code
- 2026-10-07 | Sửa | Chấm báo cáo: đọc thêm Word 97-2003 (.doc), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), RTF; nhận diện định dạng theo nội dung file (.doc thực chất là .docx / RTF… vẫn đọc đúng); module mới `office.ts`, `ooxml.ts`, `legacyOffice.ts`, `cfb.ts`; Excel → `# Sheet:` + hàng bảng, PowerPoint → `# Slide N:` + ghi chú; báo lỗi rõ file có mật khẩu / quá cũ; prompt AI giải thích ký hiệu sheet / slide — .doc và .docx đều là Word, sinh viên còn nộp Excel / PowerPoint, trước đây chỉ nhận .docx
- 2026-10-09 | Thêm mới | Chấm báo cáo: giữ bytes Office gốc trong `Submission.rawDocs` (cùng khoá với `files`) khi đọc file thành công, để Code Review xem trước kiểu Office — cần bytes thật để render Word/Excel, trước đây chỉ còn văn bản đã chuyển
