# Nhật ký kết nối mạng

- **Mục đích:** Minh bạch mọi kết nối ra Internet (giáo viên kiểm chứng code sinh viên không bị gửi đi khi dùng Local AI).
- **File:** `src/main/netlog.ts`, `src/main/ipc.ts` (`system:netlog|clearNetlog`), `src/renderer/src/pages/Settings.tsx`
  (tab Kết nối mạng)
- **Changelog:** [../changelog/netlog.md](../changelog/netlog.md)

## Logic chính

- `netFetch(url, init, purpose)` thay cho `fetch` với mọi kết nối ra ngoài: ghi dòng `netlog (ts, url, purpose,
  status '...')`, cập nhật status = mã HTTP hoặc `lỗi: <message>`.
- URL được che tham số `key|api_key|token` thành `***`.
- Dùng cho: tải model Hugging Face, tải llama-server / MinGW từ GitHub, gọi Cloud AI.
- Gọi Local AI (`127.0.0.1`) dùng `fetch` thường — không ghi log.
- UI hiển thị 500 dòng mới nhất, có nút xoá log.

## Lưu ý / giới hạn

- Mọi kết nối Internet mới **bắt buộc** đi qua `netFetch` với `purpose` mô tả rõ (tiếng Việt).
- API key gửi qua header nên không xuất hiện trong log.

## Test

Thủ công: test kết nối Cloud AI → thấy dòng mới với purpose "Cloud AI (...)" và status 200 / lỗi.
