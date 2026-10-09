# Tech Profile & tự động nhận diện công nghệ

- **Mục đích:** Mỗi công nghệ (C, C++, Android, Next.js…) có bộ quy tắc lọc file, nhận diện, build và rubric mẫu riêng;
  profile "Tự động nhận diện" cho phép chấm lớp nộp nhiều công nghệ.
- **File:** `src/shared/constants.ts` (`BUILTIN_PROFILES`, `AUTO_PROFILE_ID`), `src/main/analysis/detect.ts`,
  `src/main/repo.ts` (Tech profiles), `src/main/ipc.ts` (`profiles:*`, `mingw:*`, `settings:pickDir`),
  `src/renderer/src/pages/TechProfiles.tsx`, `src/main/analysis/detectLanguage.ts`
- **Changelog:** [../changelog/tech-profiles.md](../changelog/tech-profiles.md)

## Logic chính

- **TechProfile:** `id`, `name`, `detect` (quy tắc nhận diện), `ignore`, `extensions`, `checks`, `buildEnabled`,
  `buildNote`, `rubric` mẫu.
- **Profile có sẵn:** `auto`, `android`, `nextjs`, `cpp`, `c`, `python`, `javascript`, `reactjs`, `react-native`, `php`,
  `csharp`, `solidity`, `css`. Giáo viên sửa / thêm profile riêng (bảng `profiles`, theo user, ghi đè profile có sẵn cùng id).
  Mã profile: `a-z 0-9 _ -`, 2–32 ký tự.
- **Quy tắc `detect`:** `*.ext` (trọng số = tổng dung lượng file khớp), tên file (`AndroidManifest.xml`),
  hoặc `file:dependency` (vd `package.json:next` — kiểm tra dependencies/devDependencies).
- **Nhận diện (`detectProfile`):**
  1. Profile framework theo thứ tự ưu tiên `android → nextjs → react-native → reactjs`: khớp bất kỳ quy tắc nào là chọn.
  2. Còn lại (ngôn ngữ + profile tuỳ chỉnh): chọn profile có tổng trọng số lớn nhất; bằng nhau theo thứ tự
     `cpp, c, solidity, python, php, csharp, javascript, css`. Kết quả `c` nhưng có file C++ → `cpp`.
- **`loadForGrading`:** profile cụ thể → lọc theo profile đó. Profile `auto` → đọc rộng (đuôi của mọi profile), nhận diện,
  rồi lọc lại theo `ignore` của profile nhận diện được; không nhận diện được → giữ `auto`, chấm theo tiêu chí chung
  (có cảnh báo). `package.json` chỉ dùng để nhận diện, không đưa vào chấm.
- Profile nhận diện được lưu vào `results.detected_profile` và hiện trong Code Review / danh sách sinh viên.
- **Build:** C/C++ bật sẵn (MinGW, xem `cpp-compile-test.md`); Solidity bật sẵn (biên dịch bằng `solc`, chạy test bằng
  Foundry `forge`, xem `solidity-compile-test.md`) — đường dẫn `solc`/`forge` cấu hình ở Tech Profiles → Solidity;
  Android cần cấu hình Android SDK + JDK; Next.js không bao giờ tự `npm install`.

## Lưu ý / giới hạn

- `detectLanguage.ts` (nhận diện ngôn ngữ theo nội dung) hiện **chưa được dùng** ở đâu — nhận diện thực tế nằm trong
  `detect.ts`.
- Code Review, code khung và câu hỏi vấn đáp cũng đọc bài qua `loadForGrading` → luôn cùng bộ lọc với lúc chấm.

## Test

Thủ công: assignment chọn "Tự động nhận diện", folder có bài C++, Android, Next.js → chấm và kiểm tra profile nhận diện
từng bài.
