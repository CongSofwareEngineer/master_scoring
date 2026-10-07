# Changelog: Cài đặt (theo máy / theo giáo viên)

> Hiện trạng logic: [../instruction/settings.md](../instruction/settings.md)

- 2026-10-05 | Thêm mới | Cài đặt: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Mẫu MSSV: ẩn ô "Mẫu MSSV (regex)" khỏi Settings, key `mssvPattern` không còn dùng — tên file chỉ cần dạng hoten_mssv.zip
- 2026-10-06 | Thêm mới | Cài đặt (theo máy / theo giáo viên): tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-07 | Sửa | Context (token): mặc định 8K → 32K, thêm lựa chọn 100K / 150K / 200K (bỏ 4K, 12K), áp dụng cho cả Cloud và Local (tối đa 32K) — 32K quá ít khi chấm bằng API LLM
