# Changelog: Cửa sổ app & khung giao diện

> Hiện trạng logic: [../instruction/app-shell.md](../instruction/app-shell.md)

- 2026-10-05 | Thêm mới | Cửa sổ app & khung giao diện: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | Điều hướng trang: thêm trang Hướng dẫn vào sidebar và store — có chỗ hướng dẫn giáo viên ngay trong app
- 2026-10-06 | Thêm mới | Sidebar kéo giãn: kéo mép phải để đổi độ rộng 180–420px, nhấp đúp về 220px, lưu localStorage — nhãn tiếng Việt dài bị cắt
- 2026-10-06 | Sửa | Toast tiến trình runtime AI: đổi kiểu toast `ai:runtime-progress` từ info sang success — chỉ báo khi tải xong, đỡ nhiễu
- 2026-10-06 | Thêm mới | Hiển thị version trên top bar: inject `__APP_VERSION__` từ package.json qua electron.vite.config.ts — biết đang chạy bản build nào
- 2026-10-06 | Thêm mới | Cửa sổ app & khung giao diện: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
