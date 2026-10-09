# Changelog: Phân tích tĩnh

> Hiện trạng logic: [../instruction/static-analysis.md](../instruction/static-analysis.md)

- 2026-10-05 | Thêm mới | Phân tích tĩnh: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-06 | Thêm mới | Phân tích tĩnh: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-09 | Thêm mới | Phân tích tĩnh Solidity: thêm `.sol` vào file code + bắt hàm dài, thêm `solidityChecks` (thiếu `.sol` → error; thiếu pragma, không có contract/library/interface, `tx.origin`, `selfdestruct` → warning; `call`/`delegatecall` cấp thấp → info) — hỗ trợ chấm tự động smart contract (profile Solidity)
