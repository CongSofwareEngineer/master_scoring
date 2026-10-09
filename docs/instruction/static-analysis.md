# Phân tích tĩnh

- **Mục đích:** Kiểm tra khách quan, không cần chạy code: thống kê dòng / comment và lỗi cấu trúc theo công nghệ; cho
  điểm tiêu chí nguồn `static`.
- **File:** `src/main/analysis/static.ts`
- **Changelog:** [../changelog/static-analysis.md](../changelog/static-analysis.md)

## Logic chính

- `runStatic(profileId, files)` → `issues` (nhãn `[Static]`) + `stats` (số file code, số dòng, số dòng comment).
- **Chung:** hàm dài > 80 dòng (ước lượng theo ngoặc nhọn, ngôn ngữ họ C) → warning; không có file code → error.
- **Android:** thiếu `AndroidManifest.xml` (error); Activity chưa khai báo trong Manifest (error); không có layout XML,
  không có `build.gradle` (warning).
- **Next.js:** không có `app/` hoặc `pages/` (error); `.env` chứa KEY/SECRET/TOKEN/PASSWORD bị nộp kèm (warning);
  hard-code khoá bí mật trong mã (warning).
- **C/C++:** không có file nguồn / không có `main()` (error); `gets()` (warning); `conio.h`, `system("pause")` (info).
- **Solidity:** không có file `.sol` (error); thiếu `pragma solidity`, không có `contract`/`library`/`interface` (warning);
  `tx.origin` phân quyền, `selfdestruct` (warning); `call`/`delegatecall` cấp thấp (info). Hàm `.sol` quá dài cũng bị bắt.
- `staticScore(max, issues)`: tỉ lệ = 1 − 0.3 × số error − 0.1 × số warning (≥ 0), làm tròn 0.25 điểm.

## Lưu ý / giới hạn

- Heuristic regex, không phải parser thật → có thể sai với code định dạng lạ.
- Chuỗi message lưu tiếng Việt; chuỗi có tham số cần pattern trong `EN_PATTERNS` (`i18n.ts`).

## Test

Thủ công: bài C thiếu `main`, bài Android có Activity không khai báo → kiểm tra issue và điểm tiêu chí phân tích tĩnh.
