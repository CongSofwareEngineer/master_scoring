# Chuyển văn bản thành giọng nói (TTS tiếng Việt)

- **Mục đích:** Công cụ riêng (không gắn assignment): nhập văn bản tiếng Việt → đọc thành giọng nói **chạy offline trên
  máy** (văn bản không gửi ra ngoài), chọn giọng **Nam / Nữ / Trẻ em** (và người đọc với model nhiều giọng), nghe ngay và
  lưu file `.wav`.
- **File:**
  - `src/main/tts/models.ts` — danh sách model, sửa nguồn Hugging Face, tự nhận định dạng (VITS / Piper), tải (tạm dừng /
    tải tiếp, SHA-256), danh sách người đọc (`ttsSpeakers`), xoá.
  - `src/main/tts/engine.ts` — nạp `onnxruntime-node`, nhánh VITS (bộ tách chữ) và nhánh Piper (phiên âm → id, `sid`,
    `length_scale`), chọn người đọc, chạy model từng đoạn, ghép + đổi cao độ → WAV.
  - `src/main/tts/phonemize.ts` + `src/main/tts/vi-ipa.json` — chữ tiếng Việt → phiên âm IPA kiểu espeak-ng bằng bảng âm tiết
    (cho Piper). `scripts/gen-vi-ipa.mjs` — script sinh lại bảng (chỉ chạy trên máy dev).
  - `src/main/tts/text.ts` — chuẩn hoá chữ tiếng Việt (số → chữ, ngày, giờ, %, ký hiệu) + tách đoạn theo dấu câu (kèm dấu
    câu kết đoạn `punct` cho Piper).
  - `src/main/tts/dsp.ts` — đo cao độ (YIN), WSOLA (giãn thời gian), resample, chuẩn hoá biên độ, ghi WAV 16-bit.
  - `src/main/ipc.ts` (nhóm `tts:*`), `src/shared/constants.ts` (`TTS_MODELS`, `TTS_VOICES`, `TTS_MAX_CHARS`),
    `src/shared/types.ts` (`TtsModelPreset`, `TtsSpeaker`, `TtsFormat`, `TtsModelInfo`, `TtsDownloadEvent`, `TtsRequest`,
    `TtsResult`, `TtsVoice`), `src/shared/i18n.ts` (bản English)
  - `src/renderer/src/pages/TextToSpeech.tsx`, `Shell.tsx` (mục sidebar nhóm 2), `App.tsx`, `lib/store.ts`
    (`Page = 'tts'`), `styles.css` (lớp `.tts-*`), `src/renderer/index.html` (CSP `media-src 'self' blob:`)
  - `package.json` (`onnxruntime-node` 1.31.1), `electron-builder.yml` (asarUnpack + bỏ binary nền tảng khác)
- **Changelog:** [../changelog/text-to-speech.md](../changelog/text-to-speech.md)

## Logic chính

- **Vào chức năng:** mục **"Chuyển văn bản thành giọng nói"** trên sidebar (nhóm công cụ riêng, dưới Phân tích dữ liệu).
  Trái: ô văn bản (tối đa 5.000 ký tự), chọn giọng, tốc độ, tinh chỉnh cao độ, model, **Người đọc** (chỉ hiện với model
  nhiều giọng: "Tự chọn theo giọng Nam / Nữ" hoặc chọn tay), nút **Đọc văn bản** (Ctrl+Enter), trình phát + **Lưu file
  .wav**. Phải: danh sách model. Lựa chọn (model, giọng, tốc độ, cao độ, người đọc theo từng model) nhớ ở
  `localStorage['ms:tts']`; model đã nhớ không còn trong danh sách → tự chọn model đầu.
- **Model (`TTS_MODELS`, kiểu `TtsModelPreset`)**:
  | id | Tên | Nguồn mặc định | Định dạng | Ghi chú |
  | --- | --- | --- | --- | --- |
  | `mms-tts-vie` | facebook/mms-tts-vie | `Xenova/mms-tts-vie` | VITS transformers.js | ~109 MB, 1 giọng nam ~120–180 Hz, 16 kHz, **CC BY-NC 4.0** |
  | `piper-vi-vais1000` | Piper vi_VN · vais1000 | `rhasspy/piper-voices` / `vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx` | Piper | ~63 MB, 1 giọng nữ Bắc ~265 Hz, 22 kHz, MIT (dữ liệu CC BY 4.0) |
  | `piper-vi-5-speakers` | Piper vi_VN · 5 giọng (CakeByVPBank) | `CakeByVPBank/piper-pgl-v4-vi_VN-version39_epoch39` / `vi_VN-csa-voice-piper-v3-medium.onnx` | Piper | ~77 MB, 22 kHz, MIT; người đọc 0 Ngọc Lan (nữ Bắc), 1 Minh Anh (nữ Bắc), 2 Quang Huy (nam Bắc), 3 Thu Hà (nữ Bắc), 4 Yến Nhi (nữ Nam) |
  - 2 mục cũ `vits-vietnamese-v2` (không có repo công khai) và `pyl5-vits-vietnamese` (`pyl5/vits-vietnamese` trả HTTP 401
    = không tồn tại) đã **bỏ** — không có bản ONNX nào để tải. Các repo VITS tiếng Việt khác trên HF (`vantubk1386/vits_vie_*`,
    `sonktx/vits-finetuned-vie-*`, `minhduc96/vits-vietnamese`…) chỉ có `.safetensors` / `.pth` (PyTorch), không chạy được.
  - **Sửa repo** (`tts:setRepo`): nhận `owner/name`, `owner/name/đường/dẫn/file.onnx`, hoặc URL
    `https://huggingface.co/owner/name[/blob|resolve/main/…/file.onnx]`; lưu ở `<modelsDir>/tts/repos.json` (theo máy).
    Để trống / bằng mặc định → xoá ghi đè. Tên / giới tính người đọc trong `TTS_MODELS` chỉ áp dụng khi tải từ nguồn mặc
    định; nguồn khác lấy tên từ `speaker_id_map` (hoặc `#0`, `#1`…).
  - **Tải** (`tts:download`, chạy nền, sự kiện `tts:download` với `phase` downloading / verifying / done / paused / error):
    - Có chỉ định file `.onnx` → chỉ liệt kê thư mục chứa file (`api/models/<repo>/tree/main/<thư mục>`; repo nhiều giọng
      như `rhasspy/piper-voices` rất lớn), thêm root nếu cần. Không chỉ định → liệt kê cả repo (đệ quy, theo trang `Link`).
    - **Nhận định dạng:** có `vocab.json` + `config.json` + `.onnx` → **VITS** (chọn `onnx/model.onnx`, `model.onnx`,
      `onnx/model_quantized.onnx`, `model_quantized.onnx`, rồi `.onnx` bất kỳ trừ fp16). Có `<tên>.onnx` + `<tên>.onnx.json`
      → **Piper** (lấy file đầu theo thứ tự tên). Không có `.onnx` → lỗi "repo chỉ có .safetensors / .pth là bản PyTorch".
      Repo 401/403 → "repo không tồn tại hoặc đang để private"; 404 → "không tồn tại".
    - File cấu hình: VITS tải `vocab.json`, `config.json`, `tokenizer_config.json`; Piper tải `<tên>.onnx.json` → lưu
      `piper.json`. Xoá file cấu hình cũ trước khi tải (đổi định dạng không lẫn file).
    - Model tải vào `<modelsDir>/tts/<id>/model.onnx.part` (Range để tải tiếp), kiểm tra SHA-256 theo LFS, đổi tên, ghi
      `source.json` (repo = nguồn đầy đủ, file, sha256, size, `format`) — **có `source.json` + `model.onnx` = đã cài**
      (`source.json` cũ thiếu `format` = VITS). Đổi nguồn rồi tải lại → xoá bản cũ. Chỉ tải 1 model một lúc. Mọi request
      đi qua `netFetch` (có trong nhật ký mạng).
- **Tổng hợp (`tts:synthesize` → `synthesize`)**, chạy tuần tự (1 phiên ONNX dùng chung, giữ trong RAM tới khi đổi model /
  xoá / tải lại):
  1. `normalizeVietnamese`: NFC; `dd/mm/yyyy` → "ngày … tháng … năm …" (không lặp "ngày" nếu văn bản đã có), `dd/mm`,
     `hh:mm` → "… giờ … phút", `5-10` → "5 đến 10", số âm, số → chữ (`1.500.000` / `1,500,000` = số nguyên; `7,5` → "bảy
     phẩy năm"; `3.5` → "ba chấm năm"; số bắt đầu bằng 0 → đọc từng chữ số; > 15 chữ số → từng chữ số; quy tắc "linh",
     "mốt", "lăm", "mười"), `% & + = @ # $ € ₫ °` → chữ; chữ thường; `f j w z` → `ph gi u d`.
  2. `splitSegments`: tách theo dấu câu, khoảng lặng sau đoạn: xuống dòng 0.5 s, `. ! ? … ; :` 0.35 s, `, ( ) " – —` 0.15 s;
     đoạn > 280 ký tự cắt theo khoảng trắng. `punct` = dấu kết đoạn cho Piper (`. ! ? , ; :`; xuống dòng / `…` → `.`;
     ngoặc / gạch → `,`; đoạn bị cắt giữa câu → trống; đoạn cuối không có dấu → `.`).
  3. **VITS** — tách chữ kiểu `VitsTokenizer`: chữ thường, giữ ký tự có trong `vocab.json` (gộp khoảng trắng), xen token
     trống (`pad_token`, id 0 với MMS) khi `add_blank` ≠ false. Model cần `is_uroman` / `phonemize` → báo chưa hỗ trợ.
     Chạy `input_ids` (+ `attention_mask` nếu có) → `waveform` (`sampling_rate` trong `config.json`).
  4. **Piper** — chỉ nhận `phoneme_type = espeak`, giọng espeak `vi*` (khác → báo chưa hỗ trợ).
     - `vietnameseToIpa`: tách từ theo ký tự không phải chữ; mỗi âm tiết bỏ dấu thanh (NFD, bỏ U+0300/0301/0309/0303/0323)
       → tra `vi-ipa.json` theo gốc + thanh (đặt dấu kiểu cũ `hòa` hay mới `hoà` đều ra cùng kết quả). Thanh ngang trong
       bảng lưu dạng cuối mệnh đề (`7`); âm tiết không đứng cuối đoạn đổi `7` → `1` (đúng như espeak đọc cả câu). Âm tiết
       không có trong bảng (từ tiếng Anh như "email"…) → bỏ, trả về `skipped`.
     - id: `^` `_` rồi mỗi ký hiệu IPA (+ `punct`) → `phoneme_id_map[ký hiệu]` + `_`, cuối `$`; ký hiệu không có trong map bị bỏ.
     - Chạy `input`, `input_lengths`, `scales = [noise_scale, length_scale / tốc độ, noise_w]` (từ `inference` của
       `piper.json`), `sid` nếu model có → output đầu tiên. **Tốc độ đổi trong model** (DSP chỉ đổi cao độ).
     - **Người đọc** (`pickSpeaker`): `req.speaker` ≥ 0 và có trong danh sách → dùng; không thì tự chọn theo giọng (Nam →
       người đọc nam đầu tiên, Nữ / Trẻ em → người đọc nữ đầu tiên; không có → người đọc 0).
  5. **Giọng** = đổi cao độ: đo cao độ trung vị giọng gốc bằng **YIN** trên ≤ 12 s đầu → hệ số = `targetF0 / F0 gốc`, kẹp
     trong `[min, max]` của giọng (`TTS_VOICES`: Nam 125 Hz [0.6–1.05], Nữ 215 Hz [0.9–1.5], Trẻ em 290 Hz [1.2–2.0] + tốc độ
     ×1.06); không đo được → 0.75 / 1.1 / 1.5. **Người đọc có giới tính trùng giọng đã chọn (Nam / Nữ) → hệ số 1** (giữ giọng
     thật, không kéo về 125 / 215 Hz). Một hệ số cho cả bài. Nhân thêm tinh chỉnh `2^(nửa cung/12)` (−6..+6).
  6. `pitchAndSpeed`: WSOLA (khung 512, hop 256, dò ±128 mẫu) giãn thời gian ×(pitch/speed), rồi resample ×pitch
     (lọc thông thấp FIR trước khi nén, nội suy Catmull-Rom) → cao độ ×pitch, thời lượng ÷speed (Piper: speed = 1). Xử lý
     từng đoạn, nhường event loop giữa các đoạn. Ghép + khoảng lặng (÷ tốc độ), 0.1 s đầu, chuẩn hoá đỉnh 0.9 → WAV PCM
     16-bit mono.
  - Tiến trình: sự kiện `tts:progress { userId, done, total }`. **Dừng** (`tts:cancel`) kiểm tra giữa các đoạn.
  - Kết quả trả về renderer: `wav` (Uint8Array) + thời lượng, sample rate, thời gian tạo, F0 gốc, hệ số cao độ, từ bị bỏ,
    tên người đọc (chỉ model nhiều giọng). Renderer phát bằng `Blob` URL (`<audio>`), tự phát sau khi tạo.
- **Lưu file** (`tts:save`): main giữ WAV gần nhất của từng user trong RAM → hộp thoại Lưu `giong-noi_<ngày>_<giờ>.wav`.
- **Bảng phiên âm `vi-ipa.json`** (~140 KB, 2.741 âm tiết gốc / ~12.900 dạng có thanh): `{ "<gốc>": "ngang|huyền|sắc|hỏi|ngã|nặng" }`.
  Sinh bởi `scripts/gen-vi-ipa.mjs`: lấy âm tiết từ danh sách từ Viet74K, đặt đủ 6 thanh (vần tắc c/ch/p/t chỉ sắc / nặng),
  cho espeak-ng WASM (`espeak-ng@1.0.2`, giọng `vi`, `--ipa`) đọc từng âm tiết, bỏ kết quả espeak đọc kiểu tiếng Anh /
  đánh vần / không có trọng âm; thanh ngang thiếu thì suy từ thanh huyền. Đã đối chiếu 400 cụm 3 từ: ghép từ bảng khớp
  100% với espeak đọc cả câu (trừ chữ bỏ dấu kiểu cũ như `dọa`, espeak đọc sai còn bảng đúng).

## Lưu ý / giới hạn

- `onnxruntime-node` nạp lười (`import()` lần đầu đọc) — máy không nạp được (vd. **Mac Intel: bản 1.31.1 chỉ có binary macOS
  arm64**) chỉ lỗi ở trang TTS, các chức năng khác không ảnh hưởng.
- App **không kèm espeak-ng** (18 MB, GPL-3) — chỉ tra bảng sinh sẵn. Cần sinh lại bảng (đổi danh sách từ / bản espeak):
  `npm i --no-save espeak-ng@1.0.2` rồi `node scripts/gen-vi-ipa.mjs`. Truyền văn bản cho espeak WASM qua file ảo (`-f`),
  không qua argv (argv làm hỏng chữ có dấu).
- Model Piper khác (repo người dùng nhập) phải được huấn luyện với espeak-ng **mới** (có số thanh điệu `1–7`, `ɜ` trong
  `phoneme_id_map`). Bản cũ như `vi_VN-25hours_single-low`, `vi_VN-vivos-x_low` của `rhasspy/piper-voices` không có ký hiệu
  thanh → đọc mất thanh, không dùng.
- Từ không phải tiếng Việt (tiếng Anh, viết tắt) Piper bỏ qua (hiện ở dòng "từ không đọc được"); MMS-TTS đánh vần theo
  chữ cái tiếng Việt. Số đã được đổi thành chữ trước nên không bị bỏ.
- Giọng Nam / Nữ / Trẻ em với model 1 giọng là đổi cao độ (kéo theo formant) — khác giới tính giọng gốc nghe không tự nhiên
  (vd. Piper vais1000 chọn Nam bị hạ ×0.6). Model 5 giọng có người đọc nam / nữ thật nên Nam / Nữ tự nhiên nhất.
- MMS-TTS chỉ đọc chữ cái tiếng Việt (vocab có `2`, `'`, `-`, `_`, `–`); giấy phép **CC BY-NC 4.0** — chỉ dùng phi thương mại.
- Kết quả có ngẫu nhiên (VITS có noise) — đọc lại cùng câu sẽ hơi khác.
- Model lưu trong `<modelsDir>/tts/` — đổi thư mục lưu model (AI Models) thì phải tải lại model TTS. Thư mục của 2 model đã
  bỏ (`vits-vietnamese-v2`, `pyl5-vits-vietnamese`) nếu còn thì vô hại, xoá tay được.
- Văn bản / âm thanh không ghi vào `app.db`, không có trong bản sao lưu.
- Lỗi do main ném hiện tiếng Việt (giống quy ước i18n chung).
- Chạy thử Electron từ terminal của VS Code: phải bỏ biến `ELECTRON_RUN_AS_NODE` (VS Code đặt sẵn = 1).

## Test

`npm run typecheck`. Thủ công (`npm run dev`): mở trang Chuyển văn bản thành giọng nói → Tải `Piper vi_VN · vais1000` (thấy
tiến trình, bấm Tạm dừng rồi Tải tiếp) và `Piper vi_VN · 5 giọng` → nhập "Xin chào các bạn sinh viên. Hôm nay, ngày
07/11/2026, lớp có 45 bạn; điểm trung bình đạt 7,5 — tăng 12% so với kỳ trước!" → với model 5 giọng: Nữ (Ngọc Lan) / Nam
(Quang Huy, hệ số cao độ 1) / chọn tay Yến Nhi (giọng miền Nam) / Trẻ em → đổi tốc độ (nghe nhanh / chậm, không méo) → Lưu
file .wav → Tải `facebook/mms-tts-vie` vẫn đọc được như cũ → Sửa repo một model thành `pyl5/vits-vietnamese` → Tải phải báo
lỗi HTTP 401; thành `vantubk1386/vits_vie_vais1000` → báo "không có file .onnx (… PyTorch …)"; xoá ô repo → về mặc định →
đổi ngôn ngữ English → trang không còn chữ tiếng Việt (trừ tên riêng người đọc).

Đã kiểm tra (2026-11-07, Windows 10, CPU, chạy `models.ts` + `engine.ts` thật ngoài Electron): tải 2 model Piper + SHA-256 OK;
câu mẫu ~13 s âm thanh tạo trong 1,1–1,5 s (lần đầu 5–6 s gồm nạp model); F0 đo: vais1000 ~265 Hz, Ngọc Lan ~235 Hz,
Quang Huy ~160 Hz, Yến Nhi ~245 Hz; 2 nguồn hỏng báo đúng lỗi. Trước đó (MMS): 18 s âm thanh trong 3–6 s; YIN sau khi đổi:
Nam ~139 Hz, Nữ ~216 Hz, Trẻ em ~290 Hz.
