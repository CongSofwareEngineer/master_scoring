# Biên dịch & chạy test Solidity

- **Mục đích:** Biên dịch bài Solidity bằng `solc` và chạy test bằng Foundry (`forge test`) để chấm tiêu chí `compile`
  và `test` của profile Solidity.
- **File:** `src/main/analysis/solidity.ts`, `src/main/analysis/runner.ts`, `src/main/proc.ts`, `src/main/settings.ts`
  (`solcPath`, `forgePath`), `src/main/ipc.ts` (`solidity:status|pick`), `src/renderer/src/pages/TechProfiles.tsx`
- **Changelog:** [../changelog/solidity-compile-test.md](../changelog/solidity-compile-test.md)

## Logic chính

- **An toàn:** app đang chạy quyền Administrator (`isElevated`, Windows) → **không** chạy code sinh viên.
- **Tìm công cụ (`findSolc` / `findForge`):** `settings.solcPath` / `settings.forgePath` (file hoặc thư mục, hoặc
  `<dir>/bin`) → `runtime/solc` / `runtime/forge` → `PATH` (`where` / `which`). Không có → bỏ qua kèm lý do (tiêu chí để
  giáo viên chấm tay).
- **Biên dịch (`compileSolidity`):** ghi file ra `w/<studentId>`; dựng input **standard-json** (mọi file `.sol` + import
  tương đối trong bài) rồi chạy `solc --standard-json` (stdin = JSON, timeout 90 giây). Parse `errors[]`:
  - `severity = error` → `ok = false`; mỗi lỗi/cảnh báo thành issue `[Compile]` (file + dòng tính từ `sourceLocation.start`,
    tối đa 30). Lưu ý `solc --standard-json` **vẫn trả exit code 0 khi có lỗi** → phải kiểm tra `errors[]`, không chỉ exit code.
  - Output = `formattedMessage` của từng lỗi/cảnh báo (rỗng khi biên dịch sạch).
- **Chạy test (`testSolidity`):** chỉ chạy khi có file test (`.t.sol` hoặc trong `test/`) **và** tìm thấy `forge`; chạy
  `forge test --offline` trong thư mục làm việc (timeout 5 phút). Mỗi dòng `[PASS]` / `[FAIL: …]` / `[SKIP]` → 1 test case
  (khử trùng theo tên vì forge lặp lại test lỗi ở mục "Failing tests"). Test fail → issue `[Test]`.
- Profile Solidity bật `buildEnabled`; pipeline chỉ gọi khi rubric có tiêu chí `compile`/`test` (xem `grading-pipeline.md`).

## Lưu ý / giới hạn

- Không có sandbox — chỉ giới hạn thời gian / output và từ chối chạy khi có quyền Admin.
- Thư mục `lib/` (Foundry) bị **bỏ qua khi giải nén** → project có thư viện ngoài (OpenZeppelin…) có thể không biên dịch
  được bằng `forge`; compile bằng `solc` standard-json cũng không resolve được `node_modules`/`lib`.
- Chỉ biên dịch file `.sol` có trong bài nộp; import ra ngoài bài nộp → lỗi biên dịch.
- App không tự cài `solc` / Foundry; giáo viên cài hoặc trỏ đường dẫn trong Tech Profiles → Solidity.

## Test

`npm run typecheck`. Thủ công: bài `.sol` sạch → compile đạt; bài có biến không khai báo → issue `[Compile]` đúng file/dòng;
project Foundry có `test/*.t.sol` → `forge test` chạy, test đạt/tạch hiện đúng; máy chưa cài `solc`/`forge` → bỏ qua kèm lý do.
