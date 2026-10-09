# Changelog: Biên dịch & chạy test Solidity

> Hiện trạng logic: [../instruction/solidity-compile-test.md](../instruction/solidity-compile-test.md)

- 2026-10-09 | Thêm mới | Biên dịch & chạy test Solidity: thêm `src/main/analysis/solidity.ts` (`compileSolidity` bằng `solc --standard-json`, `testSolidity` bằng `forge test`), nhánh xử lý trong `grading-pipeline`, IPC `solidity:status|pick` và thẻ công cụ Solidity trong Tech Profiles — cho phép chấm tiêu chí compile/test của bài smart contract
- 2026-10-09 | Sửa | Biên dịch & chạy test Solidity: parse kết quả `forge test` đúng định dạng `[FAIL: lý do (có thể chứa dấu ])] tên() (gas: …)` và khử trùng test theo tên (forge lặp test lỗi ở mục "Failing tests") — trước đó không nhận ra test fail và đếm trùng làm sai điểm; thêm `.toml` vào đuôi nhận của profile Solidity để giữ `foundry.toml` — chạy thật với solc 0.8.37 + Foundry 1.8.5 phát hiện lỗi
