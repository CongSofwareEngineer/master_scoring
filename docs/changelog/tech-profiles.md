# Changelog: Tech Profile & tự động nhận diện công nghệ

> Hiện trạng logic: [../instruction/tech-profiles.md](../instruction/tech-profiles.md)

- 2026-10-05 | Thêm mới | Tech Profile: phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-05 | Thêm mới | Tự động nhận diện công nghệ: profile `auto`, `detectProfile` + `loadForGrading`, thêm profile python/javascript/reactjs/react-native/php/csharp/css — chấm lớp nộp nhiều công nghệ trong một assignment
- 2026-10-06 | Thêm mới | Tech Profile & tự động nhận diện công nghệ: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-09 | Thêm mới | Tech Profile Solidity: thêm profile `solidity` có sẵn (nhận diện `*.sol` + `foundry.toml`/`hardhat.config.*`/`truffle-config.js`, lọc artifacts/cache/lib/node_modules, rubric mẫu có tiêu chí bảo mật), thêm `solidity` vào thứ tự ưu tiên nhận diện (`detect.ts`) và vào danh mục ngôn ngữ `detectLanguage.ts` — cho phép chấm bài smart contract
- 2026-10-09 | Sửa | Tech Profile Solidity: bật `buildEnabled` cho profile, thêm `.toml` vào `extensions` (giữ `foundry.toml`) — cho phép biên dịch bằng `solc` và chạy test bằng `forge` (xem `solidity-compile-test.md`)
