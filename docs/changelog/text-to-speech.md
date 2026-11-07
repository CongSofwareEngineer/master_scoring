# Changelog: Chuyển văn bản thành giọng nói (TTS tiếng Việt)

> Hiện trạng logic: [../instruction/text-to-speech.md](../instruction/text-to-speech.md)

- 2026-11-07 | Thêm mới | Chuyển văn bản thành giọng nói: trang TTS tiếng Việt chạy offline bằng `onnxruntime-node` + model VITS ONNX (facebook/mms-tts-vie qua Xenova/mms-tts-vie; vits-vietnamese-v2 và pyl5/vits-vietnamese sửa được repo), giọng Nam / Nữ / Trẻ em bằng đổi cao độ (YIN + WSOLA + resample), đọc số / ngày / % thành chữ, tải model có tạm dừng + SHA-256, lưu .wav — yêu cầu thêm tab chuyển text thành giọng nói; 2 model kia không có repo ONNX công khai nên cho nhập repo
