# Tài khoản & đăng nhập

- **Mục đích:** Phân tách dữ liệu theo từng giáo viên trên cùng một máy, hoạt động offline.
- **File:** `src/main/auth.ts`, `src/main/index.ts` (khôi phục phiên lúc khởi động), `src/main/ipc.ts` (`auth:*`), `src/renderer/src/pages/Login.tsx`,
  `src/renderer/src/pages/Settings.tsx` (tab Tài khoản), `src/renderer/src/App.tsx` (`DefaultPasswordBanner`)
- **Changelog:** [../changelog/auth.md](../changelog/auth.md)

## Logic chính

- `AuthProvider` interface + `LocalAuthProvider` (bcrypt cost 11) — tách ra để sau này thay bằng đăng nhập qua server.
- Lần chạy đầu không có user → tạo `admin` / `admin` (`default_pw = 1`). Màn đăng nhập gợi ý tài khoản này chỉ khi vẫn
  dùng mật khẩu mặc định (`auth:defaultHint`). App hiện banner nhắc đổi mật khẩu cho tới khi đổi.
- Tên đăng nhập 3–32 ký tự (chữ, số, `. _ -`, không phân biệt hoa thường); mật khẩu ≥ 6 ký tự.
- Đăng ký (`auth:register`) tự đăng nhập luôn. Đăng nhập xong main gọi `ensureLocalStarted()` rồi `tryAutoResume()`
  (khởi động Local AI và tiếp tục hàng đợi bị gián đoạn của user đó).
- User hiện tại giữ trong biến `currentUser` ở main (`requireUser()` dùng cho phân quyền IPC).
- **Ghi nhớ đăng nhập:** `setCurrentUser(u)` ghi `{ userId }` mã hoá bằng `safeStorage` (DPAPI trên Windows,
  Keychain trên macOS) vào `data/session.bin`; `setCurrentUser(null)` (Đăng xuất, khôi phục backup) xoá file.
  Lúc khởi động `index.ts` gọi `restoreSession()` (sau `ensureDefaultAccount`): file hợp lệ và user còn trong DB →
  đặt `currentUser`, rồi `ensureLocalStarted()` + `tryAutoResume()` như khi đăng nhập. Renderer gọi `auth:current`
  thấy có user → bỏ qua màn đăng nhập. File hỏng / user không còn → xoá file, hiện màn đăng nhập.
- Đổi mật khẩu cần mật khẩu cũ, mật khẩu mới phải khác; đổi tên đăng nhập / tên hiển thị qua `auth:updateProfile`.

## Lưu ý / giới hạn

- Phiên ghi nhớ không hết hạn; chỉ mất khi bấm Đăng xuất. `session.bin` gắn với tài khoản hệ điều hành (copy sang
  máy / user khác sẽ không giải mã được → phải đăng nhập lại). Hệ điều hành không có `safeStorage` → không ghi nhớ.
- Backup chỉ chứa DB nên không mang theo phiên đăng nhập.

- Khôi phục backup sẽ đăng xuất (`setCurrentUser(null)`) và đảm bảo lại tài khoản mặc định nếu DB không có user.
- Không có phân quyền admin / giáo viên: mọi tài khoản ngang nhau, chỉ thấy assignment của mình.

## Test

Thủ công: lần đầu mở app đăng nhập `admin/admin` → thấy banner; đổi mật khẩu → banner mất, gợi ý ở màn đăng nhập mất;
tạo tài khoản thứ 2 → không thấy assignment của tài khoản 1.
Ghi nhớ đăng nhập: đăng nhập → tắt app → mở lại vào thẳng app; Đăng xuất → tắt → mở lại phải đăng nhập.
