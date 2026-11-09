# Chuyển văn bản thành giọng nói (TTS tiếng Việt)

- **Mục đích:** Công cụ riêng (không gắn assignment): nhập văn bản tiếng Việt → đọc thành giọng nói **chạy offline trên
  máy** (văn bản không gửi ra ngoài), chọn giọng **Nam / Nữ / Trẻ em** (và người đọc với model nhiều giọng), nghe ngay và
  lưu file `.wav`. Chế độ **Từ file**: mở 1 file văn bản → mỗi dòng có chữ thành 1 file `voice1.wav`, `voice2.wav`… lưu
  vào thư mục chọn 1 lần, có màn xem trước cách tách dòng trước khi xuất.
- **File:**
  - `src/main/tts/models.ts` — danh sách model, sửa nguồn Hugging Face, tự nhận định dạng (VITS / Piper), tải (tạm dừng /
    tải tiếp, SHA-256), danh sách người đọc (`ttsSpeakers`), xoá.
  - `src/main/tts/engine.ts` — nạp `onnxruntime-node`, nhánh VITS (bộ tách chữ) và nhánh Piper (phiên âm → id, `sid`,
    `length_scale`), chọn người đọc, chạy model từng đoạn, ghép + đổi cao độ → WAV.
  - `src/main/tts/phonemize.ts` + `src/main/tts/vi-ipa.json` — chữ tiếng Việt → phiên âm IPA kiểu espeak-ng bằng bảng âm tiết
    (cho Piper). `scripts/gen-vi-ipa.mjs` — script sinh lại bảng (chỉ chạy trên máy dev).
  - `src/main/tts/text.ts` — chuẩn hoá chữ tiếng Việt (số → chữ, ngày, giờ, %, ký hiệu) + tách đoạn theo dấu câu (kèm dấu
    câu kết đoạn `punct` cho Piper).
  - `src/main/tts/fileText.ts` — TTS từ file: đọc file (txt, md, html/xml, srt/vtt, csv/tsv, json, Word, Excel, PowerPoint,
    OpenDocument, EPUB; tự nhận bảng mã) → tách dòng + lý do bỏ dòng (`parseTtsFile`).
  - `src/main/tts/batch.ts` — TTS từ file: thư mục lưu theo user, xuất hàng loạt `voice<N>.wav` (`runTtsBatch`), đọc lại
    file đã xuất, kiểm tra từ Piper không đọc được theo từng dòng (`checkTtsLines`).
  - `src/main/tts/dsp.ts` — đo cao độ (YIN), WSOLA (giãn thời gian), resample, chuẩn hoá biên độ, ghi WAV 16-bit.
  - `src/main/ipc.ts` (nhóm `tts:*`), `src/shared/constants.ts` (`TTS_MODELS`, `TTS_VOICES`, `TTS_MAX_CHARS`,
    `TTS_BATCH_MAX_LINES`, `TTS_FILE_MAX_BYTES`, `TTS_FILE_EXTS`),
    `src/shared/types.ts` (`TtsModelPreset`, `TtsSpeaker`, `TtsFormat`, `TtsModelInfo`, `TtsDownloadEvent`, `TtsRequest`,
    `TtsResult`, `TtsVoice`, `TtsLineSkip`, `TtsFileLine`, `TtsFileParse`, `TtsBatchItem`, `TtsBatchEvent`, `TtsBatchSummary`),
    `src/shared/i18n.ts` (bản English)
  - `src/renderer/src/pages/TextToSpeech.tsx` (2 chế độ Nhập văn bản / Từ file), `src/renderer/src/pages/TtsBatch.tsx`
    (màn xem trước + xuất của chế độ Từ file), `Shell.tsx` (mục sidebar nhóm 2), `App.tsx`, `lib/store.ts`
    (`Page = 'tts'`), `styles.css` (lớp `.tts-*`, gồm `.tts-lines`, `.tts-line-*`, `.tts-export`), `src/renderer/index.html` (CSP `media-src 'self' blob:`)
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
- **Chế độ trên trang:** nút chuyển **Nhập văn bản** / **Từ file (mỗi dòng 1 file)** đầu cột trái, nhớ ở
  `localStorage['ms:tts'].mode`. Giọng, tốc độ, cao độ, model, người đọc dùng chung cho cả 2 chế độ.
- **Từ file — đọc file (`tts:openFile` → `parseTtsFile`)**: hộp thoại Mở (lọc `TTS_FILE_EXTS` + "Tất cả file"), file
  > 50 MB (`TTS_FILE_MAX_BYTES`) báo lỗi. Nhận diện theo **nội dung** trước, đuôi sau:
  | Nhận ra | Cách lấy chữ |
  | --- | --- |
  | `%PDF-` | báo lỗi "Chưa hỗ trợ đọc PDF" (app không có thư viện đọc PDF) |
  | zip có `word/document.xml` / `xl/workbook.xml` / `ppt/presentation.xml` | `officeToText` (dùng chung chấm báo cáo) |
  | zip `mimetype = application/epub+zip` (hoặc `.epub`) | spine trong `.opf` (theo `META-INF/container.xml`) → từng chương XHTML → bỏ thẻ |
  | zip có `content.xml` (OpenDocument) | `.odt/.odp`: mỗi `text:p` / `text:h` = 1 dòng; `.ods`: mỗi hàng = "ô 1, ô 2" |
  | CFB (Office cũ .doc/.xls/.ppt), RTF | `officeToText` |
  | còn lại = văn bản thuần | giải mã: BOM UTF-8 / UTF-16 LE / BE, UTF-16 không BOM (nhiều byte 0 vị trí lẻ), UTF-8 (fatal), không được thì **Windows-1258**, cuối cùng Latin-1. Quá 5% ký tự điều khiển → "Không đọc được file này như văn bản" |
  - Văn bản thuần chia theo đuôi: `.md/.markdown` → bỏ cú pháp Markdown theo từng dòng (tiêu đề `#`, danh sách `-`/`1.`,
    trích dẫn `>`, `**` `*` `_` `~~`, code nội dòng, link/ảnh → chữ, thẻ HTML; dòng `---`, phân cách bảng, rào ``` → bỏ;
    hàng bảng `| a | b |` → "a, b"; nội dung trong khối code vẫn giữ). `.html/.htm/.xhtml/.xml` → bỏ script/style/head,
    thẻ khối thành xuống dòng, ô bảng nối ", ", giải mã entity. `.srt/.vtt` → bỏ số thứ tự, dòng mốc thời gian `-->`,
    `WEBVTT`, khối `NOTE`, thẻ `<i>`. `.csv/.tsv` → mỗi hàng 1 dòng "ô 1, ô 2" (tự đoán dấu phân cách `, ; tab`, hỗ trợ
    ngoặc kép). `.json` → mọi chuỗi theo thứ tự (chuỗi nhiều dòng tách tiếp). Đuôi lạ nhưng nội dung là HTML → như HTML;
    còn lại giữ nguyên (`.txt` **không** bỏ ký hiệu Markdown — "- abc" vẫn đọc nguyên).
  - Văn bản Office (định dạng chung của importer) làm sạch thêm: bỏ dòng `# Sheet: …` và "(… đã bỏ N hàng …)",
    `# Slide N: <tiêu đề>` → chỉ giữ tiêu đề, `> Ghi chú: …` → giữ nội dung ghi chú; rồi làm sạch như Markdown.
  - **Tách dòng** (`toLines`): chuẩn hoá NFC, tách theo `\r\n`, `\r`, `\n`, U+2028/2029; mỗi dòng tab → khoảng trắng, gộp
    khoảng trắng. Dòng bị bỏ có lý do: `empty` (trống), `markup` (sau khi bỏ cú pháp không còn gì), `symbols` (không có chữ /
    số). Dòng khác gốc giữ `raw` để đối chiếu. Tối đa 5.000 dòng có chữ (`TTS_BATCH_MAX_LINES`, quá thì `truncated`).
    Bỏ dòng trống ở cuối file. Không có dòng chữ nào → lỗi.
- **Từ file — màn xem trước (`TtsBatch.tsx`)**: đầu bảng ghi tên file, loại (+ bảng mã), số dòng có chữ / bị bỏ / số file
  sẽ xuất. Bảng: ô chọn · số dòng gốc · tên file · nội dung sẽ đọc · Nghe thử / trạng thái.
  - **Số file** = thứ tự các dòng **được chọn**, liền mạch (`voice1`, `voice2`… bỏ chọn một dòng thì các dòng sau dồn lên).
  - Bấm vào nội dung để **sửa** (chỉ sửa chữ sẽ đọc, không đổi file gốc; Enter / bấm ra ngoài = lưu, Esc = huỷ). Sửa thành
    rỗng → tự bỏ chọn.
  - Công tắc **Hiện cả dòng bị bỏ** (mặc định tắt): dòng bị bỏ hiện mờ kèm lý do + dòng gốc.
  - Cảnh báo: dòng > 5.000 ký tự (`TTS_MAX_CHARS`) tô vàng, tự bỏ chọn và khoá ô chọn tới khi sửa ngắn lại; model Piper →
    `tts:checkLines` (trễ 300 ms sau mỗi thay đổi) liệt kê từ không có trong bảng phiên âm theo từng dòng (VITS / chưa cài →
    không cảnh báo).
  - **Nghe thử** = `tts:synthesize` với chữ của dòng + cài đặt giọng hiện tại, phát ở trình phát chung dưới bảng.
- **Từ file — xuất (`tts:batch` → `runTtsBatch`)**:
  - **Thư mục lưu** chọn bằng hộp thoại ở main (`tts:pickFolder`, cho tạo thư mục mới), giữ theo user **trong RAM** (mở
    lại app phải chọn lại); renderer chỉ gửi số N, main tự ghép `voice<N>.wav` (N nguyên 1..5.000) → renderer không ghi ra
    đường dẫn tuỳ ý. Chưa chọn thư mục mà bấm Xuất → mở hộp thoại chọn trước.
  - Đọc lần lượt từng dòng (dùng `synthesize`, chung hàng đợi với đọc thường), ghi `voice<N>.wav` — **ghi đè** file trùng tên.
    Sự kiện `tts:batch { userId, n, status: running | done | error, message, durationSec }` → bảng hiện Chờ / đang đọc / ✓ / ✗
    (lỗi ghi dưới dòng). Dòng lỗi bỏ qua, chạy tiếp. **Dừng** (`tts:cancel` → `cancelTtsBatch` + `cancelTts`) ngưng ngay dòng
    đang đọc, không tính là lỗi. Mỗi user chỉ 1 lượt xuất một lúc.
  - Kết quả `{ folder, done, failed, cancelled }` → thông báo + nút **Mở thư mục** (`tts:openFolder`). Dòng đã xuất có nút
    **Nghe lại** (`tts:batchFile(N)` đọc lại file từ thư mục lưu). Đổi chọn → xoá trạng thái đã xuất (số file đổi); sửa chữ
    1 dòng → xoá trạng thái dòng đó.
- **Bảng phiên âm `vi-ipa.json`** (~140 KB, 2.741 âm tiết gốc / ~12.900 dạng có thanh): `{ "<gốc>": "ngang|huyền|sắc|hỏi|ngã|nặng" }`.
  Sinh bởi `scripts/gen-vi-ipa.mjs`: lấy âm tiết từ danh sách từ Viet74K, đặt đủ 6 thanh (vần tắc c/ch/p/t chỉ sắc / nặng),
  cho espeak-ng WASM (`espeak-ng@1.0.2`, giọng `vi`, `--ipa`) đọc từng âm tiết, bỏ kết quả espeak đọc kiểu tiếng Anh /
  đánh vần / không có trọng âm; thanh ngang thiếu thì suy từ thanh huyền. Đã đối chiếu 400 cụm 3 từ: ghép từ bảng khớp
  100% với espeak đọc cả câu (trừ chữ bỏ dấu kiểu cũ như `dọa`, espeak đọc sai còn bảng đúng).

## Lưu ý / giới hạn

- `onnxruntime-node` nạp lười (lần đầu đọc) bằng `createRequire(<app.getAppPath()>/package.json)('onnxruntime-node')`
  (loader CJS, hỗ trợ asar đầy đủ, không phụ thuộc định dạng bundle `out/main`); lỗi thì thử `import()` như cũ. Máy không
  nạp được chỉ lỗi ở trang TTS, các chức năng khác không ảnh hưởng. `ortLoadError` thêm hướng xử lý theo nguyên nhân:
  - `Cannot find package/module 'onnxruntime-node|common'` → **bộ cài đóng gói thiếu gói** → cài lại bản mới nhất (build
    nay bị chặn bởi `check-deps` + `after-pack`, xem `build-release.md`).
  - Không tìm thấy `onnxruntime_binding.node` → không có binary cho nền tảng (vd. **Mac Intel: bản 1.31.1 chỉ có binary
    macOS arm64**).
  - Windows lỗi nạp DLL → thiếu **Visual C++ Redistributable 2015–2022 x64** (`onnxruntime.dll` cần `MSVCP140` /
    `VCRUNTIME140`; Electron không kèm). Bộ cài NSIS đã tự cài `vc_redist` (cần bấm đồng ý UAC) — người dùng từ chối UAC
    thì cài tay từ `https://aka.ms/vs/17/release/vc_redist.x64.exe`.
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
- Từ file: **chưa đọc PDF** (cần thêm thư viện, bộ cài nặng hơn). File .doc/.xls/.ppt cũ đặt mật khẩu không đọc được.
  Văn bản thuần bảng mã cũ khác (TCVN3 / VNI) không tự nhận — hiện sai dấu ở màn xem trước, cần đổi sang Unicode trước.
- Từ file: thư mục lưu không nhớ qua lần mở app. Mỗi dòng là một lần đọc riêng → cao độ đo riêng cho từng file (giọng giữa
  các file có thể chênh rất nhẹ với model 1 giọng khi đổi giọng Nam / Nữ / Trẻ em).
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

Từ file: chế độ **Từ file** → Mở file `.txt` nội dung `hi chào ban?` / dòng trống / `bạn tên gì?` / dòng trống / `Tôi tên là
công` → bảng hiện 3 dòng `voice1`–`voice3`, "bỏ 2 dòng"; bật Hiện cả dòng bị bỏ → thấy 2 dòng trống → sửa "ban" thành "bạn"
→ Nghe thử → bỏ chọn dòng 2 (dòng 3 thành `voice2`) → chọn lại → Chọn thư mục → Xuất 3 file → thấy trạng thái từng dòng, bấm
Nghe lại, Mở thư mục có `voice1.wav`–`voice3.wav` → Xuất lần nữa (ghi đè, không lỗi) → bấm Dừng giữa chừng. Mở thêm `.md`,
`.srt`, `.csv`, `.docx`, `.pptx`, `.odt`, `.epub` (kiểm tra cách tách); mở `.pdf` → báo chưa hỗ trợ.

Đã kiểm tra (2026-11-09, macOS, chạy `parseTtsFile` ngoài Electron): .txt (mẫu trên → 3 dòng), .md, .srt, .csv, .html, .json,
UTF-16, Windows-1258, .docx / .doc / .rtf / .odt (tạo bằng `textutil`) tách đúng; .pdf báo lỗi đúng.

Đã kiểm tra (2026-11-07, Windows 10, CPU, chạy `models.ts` + `engine.ts` thật ngoài Electron): tải 2 model Piper + SHA-256 OK;
câu mẫu ~13 s âm thanh tạo trong 1,1–1,5 s (lần đầu 5–6 s gồm nạp model); F0 đo: vais1000 ~265 Hz, Ngọc Lan ~235 Hz,
Quang Huy ~160 Hz, Yến Nhi ~245 Hz; 2 nguồn hỏng báo đúng lỗi. Trước đó (MMS): 18 s âm thanh trong 3–6 s; YIN sau khi đổi:
Nam ~139 Hz, Nữ ~216 Hz, Trẻ em ~290 Hz.
