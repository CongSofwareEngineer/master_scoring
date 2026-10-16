# Changelog: IPC main ↔ renderer & phân quyền

> Hiện trạng logic: [../instruction/ipc.md](../instruction/ipc.md)

- 2026-10-05 | Thêm mới | IPC main ↔ renderer: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Sửa | IPC settings/classlist: bỏ kiểm tra regex `mssvPattern` trong `settings:update` và `assign:importClassList` — bỏ ràng buộc định dạng MSSV
- 2026-10-06 | Thêm mới | IPC main ↔ renderer & phân quyền: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-16 | Thêm mới | IPC Trợ lý dữ liệu: nhóm kênh `data:*` (state, open, remove, closeAll, clearChat, preview, ask, cancel) + sự kiện `data:progress`; `auth:logout` đóng phiên dữ liệu trong RAM — chức năng chat với Excel / CSV
