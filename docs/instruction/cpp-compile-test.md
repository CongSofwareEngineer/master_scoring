# Biên dịch & chạy test C/C++

- **Mục đích:** Biên dịch bài C/C++ và chạy test case có giới hạn thời gian / RAM / output để chấm tiêu chí `compile` và
  `test`.
- **File:** `src/main/analysis/cpp.ts`, `src/main/analysis/runner.ts`, `src/main/analysis/mingw.ts`, `src/main/proc.ts`,
  `src/main/ipc.ts` (`mingw:status|download|pick`), `src/renderer/src/pages/TechProfiles.tsx`
- **Changelog:** [../changelog/cpp-compile-test.md](../changelog/cpp-compile-test.md)

## Logic chính

- **An toàn:** app đang chạy quyền Administrator (`isElevated`, Windows) → **không** chạy code sinh viên.
- **Tìm compiler (`findCompiler`):** `settings.mingwPath` (file hoặc thư mục / `bin`) → `runtime/mingw/bin` → `PATH`
  (`where` / `which`). Chưa có → hướng dẫn tải MinGW-w64 (WinLibs, chỉ Windows) trong Tech Profiles; macOS dùng
  gcc/clang có sẵn.
- **Biên dịch:** ghi file ra `w/<studentId>`; nhiều file có `main()` → chỉ dùng `main.*` (hoặc file đầu) + ghi chú;
  `-std=c11` / `-std=c++17 -O2 -w`, Windows thêm `-static`; thêm `-I` cho thư mục chứa header. Timeout 90 giây.
  Lỗi compiler parse thành issue `[Compile]` (tối đa 30).
- **Chạy test:** mỗi test case chạy exe với stdin = input, giới hạn `timeLimitMs`, `memoryLimitMb` (đo RSS mỗi 250ms),
  output ≤ 1 MB. So sánh output đã chuẩn hoá (bỏ khoảng trắng cuối dòng, dòng trống cuối; `ignoreWhitespace` gộp
  khoảng trắng). Exit code ≠ 0 nhưng output đúng → vẫn đạt (ghi chú).
- **`runProcess`:** quá giới hạn → `killTree` (Windows `taskkill /T /F`, macOS `SIGKILL`).

## Lưu ý / giới hạn

- Không có sandbox hệ điều hành — chỉ giới hạn thời gian / RAM / output và từ chối chạy khi có quyền Admin.
- Tải MinGW đi qua `netFetch` (có trong nhật ký mạng).

## Test

Thủ công: bài C++ đúng / sai output / vòng lặp vô hạn / cấp phát RAM lớn → kiểm tra kết quả từng test case; chạy app
bằng "Run as administrator" trên Windows → bước biên dịch bị bỏ qua kèm lý do.
