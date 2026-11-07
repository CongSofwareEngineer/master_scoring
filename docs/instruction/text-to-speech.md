# Chuyển văn bản thành giọng nói (TTS tiếng Việt)

- **Mục đích:** Công cụ riêng (không gắn assignment): nhập văn bản tiếng Việt → đọc thành giọng nói **chạy offline trên
  máy** (văn bản không gửi ra ngoài), chọn giọng **Nam / Nữ / Trẻ em**, nghe ngay và lưu file `.wav`.
- **File:**
  - `src/main/tts/models.ts` — danh sách model, sửa repo Hugging Face, tải (tạm dừng / tải tiếp, SHA-256), xoá.
  - `src/main/tts/engine.ts` — nạp `onnxruntime-node`, bộ tách chữ VITS, chạy model từng đoạn, ghép + đổi cao độ → WAV.
  - `src/main/tts/text.ts` — chuẩn hoá chữ tiếng Việt (số → chữ, ngày, giờ, %, ký hiệu) + tách đoạn theo dấu câu.
  - `src/main/tts/dsp.ts` — đo cao độ (YIN), WSOLA (giãn thời gian), resample, chuẩn hoá biên độ, ghi WAV 16-bit.
  - `src/main/ipc.ts` (nhóm `tts:*`), `src/shared/constants.ts` (`TTS_MODELS`, `TTS_VOICES`, `TTS_MAX_CHARS`),
    `src/shared/types.ts` (`TtsModelInfo`, `TtsDownloadEvent`, `TtsRequest`, `TtsResult`, `TtsVoice`),
    `src/shared/i18n.ts` (bản English)
  - `src/renderer/src/pages/TextToSpeech.tsx`, `Shell.tsx` (mục sidebar nhóm 2), `App.tsx`, `lib/store.ts`
    (`Page = 'tts'`), `styles.css` (lớp `.tts-*`), `src/renderer/index.html` (CSP `media-src 'self' blob:`)
  - `package.json` (`onnxruntime-node` 1.31.1), `electron-builder.yml` (asarUnpack + bỏ binary nền tảng khác)
- **Changelog:** [../changelog/text-to-speech.md](../changelog/text-to-speech.md)

## Logic chính

- **Vào chức năng:** mục **"Chuyển văn bản thành giọng nói"** trên sidebar (nhóm công cụ riêng, dưới Phân tích dữ liệu).
  Trái: ô văn bản (tối đa 5.000 ký tự), chọn giọng, tốc độ, tinh chỉnh cao độ, model, nút **Đọc văn bản** (Ctrl+Enter),
  trình phát + **Lưu file .wav**. Phải: danh sách model. Lựa chọn (model, giọng, tốc độ, cao độ) nhớ ở
  `localStorage['ms:tts']`.
- **Model (`TTS_MODELS`)** — VITS dạng ONNX **định dạng transformers.js** (`onnx/model.onnx` + `vocab.json` +
  `config.json` [+ `tokenizer_config.json`]):
  | id | Tên | Repo mặc định | Ghi chú |
  | --- | --- | --- | --- |
  | `mms-tts-vie` | facebook/mms-tts-vie | `Xenova/mms-tts-vie` | bản ONNX của Meta MMS-TTS (~109 MB), giọng gốc nam ~120–180 Hz, 16 kHz, giấy phép CC BY-NC 4.0 |
  | `vits-vietnamese-v2` | vits-vietnamese-v2 | (trống) | chưa tìm thấy repo công khai (tên thiếu owner) → người dùng nhập repo |
  | `pyl5-vits-vietnamese` | pyl5/vits-vietnamese | `pyl5/vits-vietnamese` | repo trả HTTP 401 (không tồn tại / private) lúc thêm — sửa repo nếu có bản ONNX |
  - **Sửa repo** (`tts:setRepo`): nhận `owner/name` hoặc URL `https://huggingface.co/owner/name`; lưu ở
    `<modelsDir>/tts/repos.json` (theo máy). Để trống / bằng mặc định → xoá ghi đè.
  - **Tải** (`tts:download`, chạy nền, sự kiện `tts:download` với `phase` downloading / verifying / done / paused / error):
    gọi API `api/models/<repo>/tree/main?recursive=true` → chọn file ONNX theo thứ tự `onnx/model.onnx`, `model.onnx`,
    `onnx/model_quantized.onnx`, `model_quantized.onnx`, rồi `.onnx` bất kỳ (trừ fp16). Thiếu `.onnx` / `vocab.json` /
    `config.json` → lỗi rõ ràng. Repo 401/403/404 → "repo không tồn tại hoặc đang để private". Model tải vào
    `<modelsDir>/tts/<id>/model.onnx.part` (Range để tải tiếp), kiểm tra SHA-256 theo LFS, đổi tên, ghi `source.json`
    (repo, file, sha256, size) — **có `source.json` + `model.onnx` = đã cài**. Đổi repo rồi tải lại → xoá bản cũ.
    Chỉ tải 1 model một lúc. Mọi request đi qua `netFetch` (có trong nhật ký mạng).
- **Tổng hợp (`tts:synthesize` → `synthesize`)**, chạy tuần tự (1 phiên ONNX dùng chung, giữ trong RAM tới khi đổi model /
  xoá / tải lại):
  1. `normalizeVietnamese`: NFC; `dd/mm/yyyy` → "ngày … tháng … năm …" (không lặp "ngày" nếu văn bản đã có), `dd/mm`,
     `hh:mm` → "… giờ … phút", `5-10` → "5 đến 10", số âm, số → chữ (`1.500.000` / `1,500,000` = số nguyên; `7,5` → "bảy
     phẩy năm"; `3.5` → "ba chấm năm"; số bắt đầu bằng 0 → đọc từng chữ số; > 15 chữ số → từng chữ số; quy tắc "linh",
     "mốt", "lăm", "mười"), `% & + = @ # $ € ₫ °` → chữ; chữ thường; `f j w z` → `ph gi u d`.
  2. `splitSegments`: tách theo dấu câu, khoảng lặng sau đoạn: xuống dòng 0.5 s, `. ! ? … ; :` 0.35 s, `, ( ) " – —` 0.15 s;
     đoạn > 280 ký tự cắt theo khoảng trắng.
  3. Tách chữ kiểu `VitsTokenizer`: chữ thường, giữ ký tự có trong `vocab.json` (gộp khoảng trắng), xen token trống
     (`pad_token`, id 0 với MMS) khi `add_blank` ≠ false. Model cần `is_uroman` / `phonemize` → báo chưa hỗ trợ. Chữ / số
     không có trong vocab trả về `skipped` để UI hiển thị.
  4. Chạy ONNX `input_ids` (+ `attention_mask` nếu có) → `waveform` (Float32, `sampling_rate` trong `config.json`).
  5. **Giọng** = đổi cao độ: đo cao độ trung vị giọng gốc bằng **YIN** trên ≤ 12 s đầu → hệ số = `targetF0 / F0 gốc`, kẹp
     trong `[min, max]` của giọng (`TTS_VOICES`: Nam 125 Hz [0.6–1.05], Nữ 215 Hz [0.9–1.5], Trẻ em 290 Hz [1.2–2.0] + tốc độ
     ×1.06); không đo được → 0.75 / 1.1 / 1.5. Một hệ số cho cả bài (giọng đều giữa các câu). Nhân thêm tinh chỉnh
     `2^(nửa cung/12)` (−6..+6).
  6. `pitchAndSpeed`: WSOLA (khung 512, hop 256, dò ±128 mẫu) giãn thời gian ×(pitch/speed), rồi resample ×pitch
     (lọc thông thấp FIR trước khi nén, nội suy Catmull-Rom) → cao độ ×pitch, thời lượng ÷speed. Xử lý từng đoạn, nhường
     event loop giữa các đoạn. Ghép + khoảng lặng (÷speed), 0.1 s đầu, chuẩn hoá đỉnh 0.9 → WAV PCM 16-bit mono.
  - Tiến trình: sự kiện `tts:progress { userId, done, total }`. **Dừng** (`tts:cancel`) kiểm tra giữa các đoạn.
  - Kết quả trả về renderer: `wav` (Uint8Array) + thời lượng, sample rate, thời gian tạo, F0 gốc, hệ số cao độ. Renderer
    phát bằng `Blob` URL (`<audio>`), tự phát sau khi tạo.
- **Lưu file** (`tts:save`): main giữ WAV gần nhất của từng user trong RAM → hộp thoại Lưu `giong-noi_<ngày>_<giờ>.wav`.

## Lưu ý / giới hạn

- `onnxruntime-node` nạp lười (`import()` lần đầu đọc) — máy không nạp được (vd. **Mac Intel: bản 1.31.1 chỉ có binary macOS
  arm64**) chỉ lỗi ở trang TTS, các chức năng khác không ảnh hưởng.
- Giọng Nam / Nữ / Trẻ em không phải giọng thật của người khác — là đổi cao độ (kéo theo formant) của giọng gốc; Trẻ em
  ×2 nghe hơi "chipmunk". Model gốc MMS là giọng nam nên **Nam** tự nhiên nhất.
- MMS-TTS chỉ đọc chữ cái tiếng Việt (vocab có `2`, `'`, `-`, `_`, `–`); chữ Latin khác / ký hiệu lạ bị bỏ. Từ tiếng Anh
  đọc theo cách đánh vần tiếng Việt. Giấy phép **CC BY-NC 4.0** — chỉ dùng phi thương mại.
- Kết quả có ngẫu nhiên (VITS có noise) — đọc lại cùng câu sẽ hơi khác.
- Model lưu trong `<modelsDir>/tts/` — đổi thư mục lưu model (AI Models) thì phải tải lại model TTS.
- Văn bản / âm thanh không ghi vào `app.db`, không có trong bản sao lưu.
- Lỗi do main ném hiện tiếng Việt (giống quy ước i18n chung).
- Chạy thử Electron từ terminal của VS Code: phải bỏ biến `ELECTRON_RUN_AS_NODE` (VS Code đặt sẵn = 1).

## Test

`npm run typecheck`. Thủ công (`npm run dev`): mở trang Chuyển văn bản thành giọng nói → Tải `facebook/mms-tts-vie` (thấy
tiến trình, bấm Tạm dừng rồi Tải tiếp) → nhập "Xin chào các bạn sinh viên. Hôm nay, ngày 07/11/2026, lớp có 45 bạn; điểm
trung bình đạt 7,5 — tăng 12% so với kỳ trước!" → đọc lần lượt Nam / Nữ / Trẻ em (nghe số đọc đúng, giọng cao dần, dòng
thông tin hiện cao độ gốc × hệ số) → đổi tốc độ / tinh chỉnh cao độ → Lưu file .wav và mở bằng trình phát ngoài → Tải
`pyl5/vits-vietnamese` phải báo lỗi repo; Sửa repo của `vits-vietnamese-v2` thành `Xenova/mms-tts-vie` → tải được và đọc
được → đổi ngôn ngữ English → trang không còn chữ tiếng Việt.

Đã kiểm tra (2026-11-07, Windows 10, CPU): tải qua app 109 MB + SHA-256 OK; câu mẫu 18 s âm thanh tạo trong 3–6 s; YIN đo
sau khi đổi: Nam ~139 Hz, Nữ ~216 Hz, Trẻ em ~290 Hz.
