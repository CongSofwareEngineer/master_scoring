# Quy tắc chính của dự án — Master Scoring

File này là bộ quy tắc bắt buộc cho mọi phiên làm việc (người hoặc AI) trên dự án.
Master Scoring là app desktop chấm điểm code sinh viên (Electron + React + TypeScript, Local AI / Cloud AI).

## Cấu trúc docs

```
docs/
├── log.md                  # MỤC LỤC: bảng logic → file instruction + file changelog
├── instruction/            # Tài liệu dự án: mỗi file = 1 logic cụ thể, viết để team hiểu
│   ├── grading-queue.md
│   ├── similarity.md
│   └── ...
└── changelog/              # Lịch sử sửa / thêm mới: mỗi file = 1 logic, CÙNG TÊN với file instruction
    ├── grading-queue.md
    ├── similarity.md
    └── ...
```

- **`docs/instruction/<ten-logic>.md`** — mô tả **hiện trạng** của một logic cụ thể: mục đích, file/module
  liên quan, logic chính, lưu ý / giới hạn, cách test. Luôn phải khớp với code hiện tại.
- **`docs/changelog/<ten-logic>.md`** — mỗi lần sửa / thêm mới là **một dòng mới** ghi: **ngày**, **loại**
  (Thêm mới / Sửa), **tên logic** được sửa / thêm mới, nội dung, vì sao. **Sửa cũng ghi thành dòng mới** (như
  thêm mới) — không sửa, không xoá dòng cũ.
- Một logic ↔ **đúng một** file trong `instruction/` và **đúng một** file **cùng tên** trong `changelog/`.
  **Không gộp nhiều logic vào một file.** Tên file: chữ thường, gạch nối (vd. `local-ai.md`, `zip-import.md`).
- `docs/log.md` chỉ là **mục lục**: bảng logic → file instruction + file changelog.

## 1. LUÔN đọc `docs/instruction/` TRƯỚC khi làm bất kỳ yêu cầu nào

- Trước khi làm **bất kỳ** yêu cầu nào của developer (thêm tính năng, sửa lỗi, sửa logic, refactor, trả lời
  câu hỏi về code…), **luôn đọc `docs/log.md`** để tìm logic liên quan, rồi **đọc các file
  `docs/instruction/<ten-logic>.md` đó** để lấy dữ liệu, quyết định cũ và lưu ý trước khi làm.
- Cần biết vì sao code như hiện tại → đọc thêm `docs/changelog/<ten-logic>.md`.
- Yêu cầu chạm nhiều logic → đọc file instruction của từng logic đó.
- Nếu docs mâu thuẫn với code hiện tại: tin code, rồi sửa lại file instruction cho đúng (và ghi changelog).

## 2. Sửa / thêm mới BẤT KỲ logic nào → TỰ ĐỘNG cập nhật 2 file

Mỗi lần sửa hoặc thêm mới logic (dù nhỏ), **tự động, ngay trong lần làm đó, không đợi được nhắc**:

1. **`docs/instruction/<ten-logic>.md`** — sửa (hoặc tạo mới) cho đúng hiện trạng code: Mục đích, File,
   Logic chính, Lưu ý / giới hạn, Test. Viết đủ để người khác trong team đọc là hiểu.
2. **`docs/changelog/<ten-logic>.md`** — **thêm một dòng mới** ở cuối file theo định dạng:
   `- YYYY-MM-DD | <Thêm mới / Sửa> | <tên logic>: <sửa / thêm gì> — <vì sao>`.
   - **Ngày**: ngày thực tế sửa / thêm mới.
   - **Tên logic**: tên chức năng / logic cụ thể được sửa hoặc thêm mới (vd. `Hàng đợi chấm`,
     `Sidebar thu gọn / kéo giãn`), không chỉ ghi chung chung tên file.
   - **Sửa = thêm mới dòng**: mỗi lần sửa (kể cả sửa lại logic đã ghi trước đó) đều ghi thành **một dòng mới**,
     không sửa / không xoá dòng cũ — để giữ đủ lịch sử.
   Chưa có file thì tạo mới cùng tên với file instruction.

- Logic mới (chưa có file) → tạo cả 2 file theo mẫu bên dưới + thêm một dòng vào bảng mục lục `docs/log.md`.
- Mở rộng logic đã có → sửa file instruction có sẵn của logic đó, **không tạo file mới cho mỗi lần sửa**.
- Sửa chạm nhiều logic → cập nhật instruction + changelog của **từng** logic bị ảnh hưởng.
- Ngày ghi theo định dạng `YYYY-MM-DD` (ngày thực tế khi sửa).

## 3. Điều kiện bắt buộc trước khi code (luồng chuẩn)

**Chưa có file `docs/instruction/` của logic thì KHÔNG được bắt đầu code.**

```
Nhận yêu cầu của developer (thêm / sửa / hỏi)
        │
        ▼
Đọc docs/log.md (mục lục) → logic này đã có file trong docs/instruction/ chưa?
        │
   ┌────┴──────────────────────────┐
   │ CÓ                             │ CHƯA CÓ
   ▼                                ▼
Đọc docs/instruction/<logic>.md  Tạo docs/instruction/<logic>.md TRƯỚC
(+ changelog nếu cần)            (mục đích, file dự kiến sửa, logic dự kiến)
→ lấy làm dữ liệu                + tạo docs/changelog/<logic>.md
→ sửa tiếp trên nền đó           + thêm dòng vào mục lục docs/log.md
   │                                │
   └────┬───────────────────────────┘
        ▼
Đọc code liên quan → BẮT ĐẦU CODE → kiểm tra kiểu (`npm run typecheck`, phải 0 lỗi)
→ chạy thử (`npm run dev`) nếu đụng UI / luồng chạy
        │
        ▼
Cập nhật docs/instruction/<logic>.md cho khớp code thực tế
+ thêm dòng mới (ngày | loại | tên logic) vào docs/changelog/<logic>.md
+ README.md nếu ảnh hưởng tới người dùng / cách build
        │
        ▼
Xong (chỉ xong khi instruction đã khớp code VÀ changelog đã có dòng mới)
```

**Ví dụ: task "thêm / sửa tính năng đổi ngôn ngữ giao diện (Tiếng Việt / English)"**

1. Mở `docs/log.md`, tìm logic đa ngôn ngữ.
2. **Nếu đã có** `docs/instruction/i18n.md`: đọc hết (logic hiện tại, file liên quan, lưu ý) → dùng làm dữ
   liệu → sửa tiếp trên nền đó.
3. **Nếu chưa có**: tạo `docs/instruction/i18n.md` (mục đích, file dự kiến chạm như `src/shared/i18n.ts`,
   `src/renderer/src/lib/i18n.ts`, `src/renderer/src/pages/Settings.tsx`, `src/main/settings.ts`; logic dự
   kiến; lưu ý), tạo `docs/changelog/i18n.md`, thêm dòng
   "Đa ngôn ngữ → instruction/i18n.md · changelog/i18n.md" vào mục lục.
4. Sau đó mới đọc code và bắt đầu code.
5. Code xong → sửa `docs/instruction/i18n.md` cho khớp code thực tế + thêm
   `- 2026-10-06 | Thêm mới | Đa ngôn ngữ: thêm chọn ngôn ngữ trong Cài đặt — <vì sao>` vào
   `docs/changelog/i18n.md`. Lần sau sửa lại → thêm tiếp dòng mới, vd.
   `- 2026-10-08 | Sửa | Đa ngôn ngữ: dịch thêm file Excel xuất báo cáo — <vì sao>`.

## Mẫu file

**`docs/instruction/<ten-logic>.md`**

```markdown
# <Tên logic>

- **Mục đích:** <vì sao cần>
- **File:** <các file/module liên quan>
- **Changelog:** [../changelog/<ten-logic>.md](../changelog/<ten-logic>.md)

## Logic chính

- <cách hoạt động, quyết định quan trọng — đủ để team hiểu>

## Lưu ý / giới hạn

- <nếu có>

## Test

<lệnh kiểm tra (`npm run typecheck`) / các bước kiểm tra thủ công trong `npm run dev`>
```

**`docs/changelog/<ten-logic>.md`**

```markdown
# Changelog: <Tên logic>

> Hiện trạng logic: [../instruction/<ten-logic>.md](../instruction/<ten-logic>.md)

- YYYY-MM-DD | Thêm mới | <tên logic>: <thêm gì> — <vì sao>
- YYYY-MM-DD | Sửa | <tên logic>: <sửa gì> — <vì sao>
```

## Ghi chú kỹ thuật nhanh

- Cấu trúc dự án, cách chạy, build, dữ liệu: xem `README.md`.
- Kiến trúc Electron 3 lớp:
  - `src/main/` — main process (Node): DB sql.js, AI (llama-server / Cloud), import zip, phân tích, chấm,
    integrity, báo cáo. Đăng ký IPC trong `src/main/ipc.ts`, đẩy sự kiện qua `src/main/events.ts`.
  - `src/preload/` — cầu nối IPC duy nhất (`window.api.invoke` / `on`), contextIsolation + sandbox.
    **Renderer không import `electron` / module Node**, mọi thứ đi qua IPC (`src/renderer/src/lib/api.ts`).
  - `src/renderer/` — React UI (pages, components, state bằng zustand trong `lib/store.ts`).
  - `src/shared/` — kiểu dữ liệu, hằng số, i18n dùng chung main + renderer; **không import `electron` / Node**.
- Chữ hiển thị trên UI dùng `t('…')` (hook `useT()` trong `src/renderer/src/lib/i18n.ts`) với chuỗi tiếng Việt
  làm khoá, và thêm bản English vào `EN` trong `src/shared/i18n.ts` (thiếu → hiện tiếng Việt).
- Code style: TypeScript strict, nháy đơn, theo style file xung quanh. Sửa xong chạy `npm run typecheck` —
  phải 0 lỗi.
- App chạy cả Windows 10/11 và macOS: khác biệt hệ điều hành kiểm tra `process.platform` (xem `src/main/paths.ts`,
  `src/main/proc.ts`); đường dẫn dữ liệu lấy từ `src/main/paths.ts`, không hard-code `C:\…`, `%LocalAppData%`,
  `explorer`, font Windows. Build: `npm run build:win` / `npm run build:mac` (kết quả trong `release/<version>/`).
