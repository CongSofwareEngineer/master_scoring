# Chấm báo cáo (Word / Excel / PowerPoint)

- **Mục đích:** Ngoài chấm code, cho phép chấm **bài viết / báo cáo cuối kỳ** dạng file Office — Word (.doc/.docx),
  Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), RTF — với bộ filter chấm riêng: kiểm tra hình thức tự động + AI chấm nội
  dung theo rubric báo cáo.
- **File:** `src/shared/types.ts` (`AssignmentKind`, `ReportCheck`, `DocStats`, `ReportStats`, `AutoResult.report`),
  `src/shared/constants.ts` (`REPORT_PROFILE`, `REPORT_PROFILE_ID`, `REPORT_RUBRIC`, `DEFAULT_REPORT_CHECK`,
  `sourcesFor`, `sourceLabel`), `src/shared/submissionName.ts` (`REPORT_EXTS`, `isSubmissionFile`),
  `src/main/importer/office.ts` (`officeToText`, `quickCheckOffice` — nhận diện định dạng theo nội dung),
  `src/main/importer/docx.ts` (.docx), `src/main/importer/ooxml.ts` (đọc gói zip OOXML, .xlsx, .pptx, `countWords`),
  `src/main/importer/legacyOffice.ts` (.doc, .xls, .ppt, RTF), `src/main/importer/cfb.ts` (đọc file OLE/CFB của
  Office 97-2003), `src/main/importer/extract.ts` (chế độ báo cáo),
  `src/main/importer/scan.ts`, `src/main/analysis/detect.ts` (`gradingProfileId`), `src/main/analysis/report.ts`
  (`checkReport`, `reportFormatScore`), `src/main/grading/pipeline.ts` (`prepareReportContext`),
  `src/main/grading/prompt.ts` (`reportSystem`, `summarizeReportMessages`), `src/main/integrity/fingerprint.ts`
  (`tokenizeWords`), `src/main/integrity/aiEstimate.ts` (`estimateAiText`), `src/main/integrity/starter.ts`,
  `src/main/repo.ts` (`validateRubric(rubric, kind)`), `src/main/ipc.ts` (`assign:save`, `assign:pickStarter`),
  `src/main/review.ts`, `src/renderer/src/pages/Assignments.tsx` (`KindField`, `FormatTab`),
  `src/renderer/src/components/RubricEditor.tsx`, `src/renderer/src/pages/CodeReview.tsx`,
  `src/renderer/src/pages/Help.tsx`, `src/shared/i18n.ts`
- **Changelog:** [../changelog/report-grading.md](../changelog/report-grading.md)

## Logic chính

- **Loại bài (`Assignment.kind`):** `code` (mặc định, như cũ) hoặc `report`. Chọn ở form Tạo assignment và tab Thông
  tin (`KindField`). Assignment cũ không có field → `code` (`rowToAssignment`). Đổi loại bài trong tab Thông tin hỏi
  có thay rubric bằng rubric mẫu tương ứng không; đổi loại → `invalidateReview()`.
- **Filter chấm khác nhau theo loại bài:**
  - `code`: Tech Profile, compile / test / phân tích tĩnh, ước lượng % code AI theo phong cách code (như cũ).
  - `report`: bỏ qua Tech Profile (luôn đọc bằng `REPORT_PROFILE`, qua `gradingProfileId(a)`), ẩn chọn công nghệ,
    tab Test case thay bằng tab **Kiểm tra hình thức**. Nguồn chấm chỉ có `static` (hiển thị "Tự động · Kiểm tra hình
    thức"), `ai`, `teacher` (`sourcesFor`); `validateRubric(rubric, 'report')` chặn `compile` / `test` → hàng đợi không
    chạy. Rubric mẫu `REPORT_RUBRIC` (Hình thức 1.5 static · Bố cục 1.5 · Nội dung 4 · Phân tích & kết luận 1.5 ·
    Ngôn ngữ 1 · Trích dẫn 0.5). Rubric mẫu lưu lại được ghi `profile_id = 'report'`.
- **Bài nộp & quét folder:** `isSubmissionFile(name, kind)` — assignment báo cáo nhận thêm file Office nộp thẳng
  (`REPORT_EXTS`: `.docx .doc .xlsx .xls .pptx .ppt .rtf`, vd `<HọTên>_<MSSV>.docx`), vẫn nhận file nén chứa các file
  đó. Bỏ file khoá tạm `~$*` (Word / Excel / PowerPoint). Kiểm tra nhanh (`quickCheckOffice`: đọc được hết + có chữ) →
  lỗi thì `broken`. Ghi chú sai tên ghi đuôi `.docx` làm ví dụ. Assignment chấm code bỏ qua các file này.
- **Nhận diện định dạng theo NỘI DUNG, không theo đuôi (`officeToText`):** .doc và .docx (tương tự .xls/.xlsx,
  .ppt/.pptx) coi như nhau — file `PK..` (zip) → xem trong gói có `word/document.xml` / `xl/workbook.xml` /
  `ppt/presentation.xml`; file OLE `D0 CF 11 E0` → stream `WordDocument` / `Workbook` / `PowerPoint Document`, có
  `EncryptedPackage` = file Office mới đặt mật khẩu; bắt đầu `{\rtf` → RTF (nhiều file ".doc" thực chất là RTF). Nên
  `.doc` thực chất là .docx, `.xls` thực chất là .xlsx… vẫn đọc đúng.
- **Đọc Word mới .docx (`docxToText`):** .docx là zip (đọc bằng `yauzl` vào RAM) → `word/document.xml`, `word/styles.xml`
  (style nào là heading: tên built-in `heading N` / `Title` hoặc `outlineLvl`), `docProps/app.xml` (số trang Word ghi
  khi lưu), đếm `word/media/*`. Chuyển thành văn bản, mỗi đoạn 1 dòng: heading → `#`…`######`, danh sách → `- `,
  bảng → `| ô | ô |` (bảng lồng nằm trong ô), xuống dòng mềm → ` / `. Bỏ `w:delText` (bản xoá khi theo dõi thay đổi),
  `w:instrText` (mã field), `mc:Fallback` (bản lặp của text box). Thống kê `DocStats`: số từ, đoạn, heading (kèm số
  dòng), bảng, hình, số trang.
- **Word 97-2003 .doc (`docToText`):** đọc FIB trong stream `WordDocument` → bảng piece (Clx) trong `0Table`/`1Table`
  → văn bản thân bài (`ccpText` ký tự đầu, bỏ chú thích / header). Ký tự 8 bit giải mã win1252, 16 bit UTF-16. Field
  (`0x13…0x14…0x15`) bỏ mã, giữ kết quả. PAPX (FKP) cho từng đoạn: style (istd → heading theo sti 1–9 / Title / tên
  "heading N"), outline level, trong bảng / cuối hàng (`0x07` = hết ô / hết hàng), danh sách. Hình = ký tự `0x01`/`0x08`.
  Số trang từ `SummaryInformation`. Có mật khẩu → lỗi; Word 6/95 (nFib < 0xC0) → lỗi "quá cũ".
- **Excel (.xlsx `xlsxToText`, .xls `xlsToText`):** mỗi sheet → `# Sheet: <tên>` (là 1 heading, 1 bảng) + mỗi hàng
  `| ô | ô |` (bỏ hàng trống, ô trống cuối hàng; tối đa 3000 hàng / sheet, còn lại ghi "(… đã bỏ N hàng)"). Số hiển thị
  giá trị thô (ngày tháng = số serial), công thức lấy giá trị đã tính. .xlsx: `workbook.xml` + rels + `sharedStrings` +
  `worksheets/*`. .xls (BIFF8): BOUNDSHEET, SST (đọc chuỗi qua nhiều CONTINUE), LABELSST / LABEL / NUMBER / RK /
  MULRK / FORMULA (+STRING) / BOOLERR; FILEPASS → "có mật khẩu"; Excel 5/95 (`Book`) → "quá cũ".
- **PowerPoint (.pptx `pptxToText`, .ppt `pptToText`):** mỗi slide → `# Slide N: <tiêu đề>` (heading), đoạn thân
  `- …`, bảng `| ô |`, ghi chú thuyết trình `> Ghi chú: …` (chỉ .pptx). `pages` = số slide. .pptx: thứ tự theo
  `sldIdLst`, tiêu đề = placeholder `title`/`ctrTitle`, bỏ số trang / ngày / footer. .ppt: bảng persist → `Slide`
  container; text placeholder nằm trong `SlideListWithText` (TextHeaderAtom 0/6 = tiêu đề), text box tự vẽ nằm trong
  drawing của slide; không có danh sách → lấy theo thứ tự các `Slide` trong stream. Bỏ slide master.
- **RTF (`rtfToText`):** bỏ các nhóm đích (`\*`, fonttbl, stylesheet, pict, header…), `\par` = đoạn, `\uN` + `\ucN`,
  `\'hh` theo `\ansicpg`, `\outlinelevelN` = heading, `\intbl`/`\cell`/`\row` = bảng.
- **Trong `extract.ts` (chế độ báo cáo, `profile.id === REPORT_PROFILE_ID`):** file Office nộp thẳng → chuyển, lỗi
  thì cả bài lỗi. Trong file nén: chỉ lấy file có đuôi trong `REPORT_EXTS` (≤ 100 MB), vẫn giải file nén lồng 1 cấp;
  `.pdf .odt .ods .odp .pages .numbers .key` → cảnh báo "Chưa đọc được file … — cần nộp file Word / Excel /
  PowerPoint"; file hỏng trong file nén → cảnh báo. Văn bản được lưu trong `files` dưới **tên file gốc** (vd
  `BaoCao.pptx`), `Submission.docs` chứa thống kê từng file. Bytes Office gốc được giữ ở `Submission.rawDocs`
  (cùng khoá tên file; `stripCommonRoot` như `files`) để Code Review **xem trước kiểu Office** — chỉ giữ khi đọc
  file thành công, không ghi DB (mất khi khởi động lại / đổi file nộp).
- **Kiểm tra hình thức (`checkReport`, cấu hình `Assignment.reportCheck`, mặc định `DEFAULT_REPORT_CHECK`):**
  - Số từ tối thiểu (mặc định 1500; dưới 70% → lỗi, còn lại cảnh báo) / tối đa (0 = không giới hạn).
  - Mục bắt buộc (mặc định Mở đầu, Kết luận): so khớp sau `normalizeHeading` (bỏ dấu, chữ thường, bỏ số thứ tự /
    "Chương 1:"…) — bằng nhau, bắt đầu bằng, hoặc chứa (tên ≥ 6 ký tự). Báo cáo có ≥ 2 heading → so với heading; không
    dùng Heading → so với mọi dòng ngắn (≤ 120 ký tự). Thiếu mỗi mục = cảnh báo.
  - Bắt buộc mục Tài liệu tham khảo (tài liệu tham khảo / danh mục tài liệu / references / bibliography…) → cảnh báo.
  - Không dùng style Heading → info; nhiều file .docx → info "chấm gộp".
  - Issue nguồn `Static`; điểm tiêu chí `static` = `reportFormatScore` (mỗi lỗi −30%, mỗi cảnh báo −10%).
    Kết quả lưu `auto.report` (`ReportStats`).
- **AI chấm:** `buildGradingMessages` dùng `reportSystem` khi `a.kind === 'report'` (giảng viên chấm báo cáo: nội dung
  so với đề, bố cục, lập luận, diễn đạt, trích dẫn; không cho điểm cao vì dài; dấu hiệu văn bản AI). Phần "Kết quả kiểm
  tra tự động" có thống kê hình thức. Cùng JSON schema / `validateAi` như chấm code (dẫn chứng = file .docx + số dòng
  của văn bản đã chuyển). Ẩn danh Cloud áp lên cả văn bản (tên SV ở trang bìa).
- **Báo cáo dài (`prepareReportContext`):** vượt ngân sách context → chia từng file thành đoạn liền nhau theo dòng
  (~50% ngân sách / đoạn), tóm tắt từng đoạn bằng `summarizeReportMessages` (giữ số dòng gốc nhờ `fileBlock(path,
  text, start)`), rồi thêm toàn văn các đoạn đầu còn vừa. Context Cloud lấy theo cài đặt (đến 200K — xem
  `settings.md`) nên chọn context lớn khi chấm báo cáo dài bằng Cloud.
- **% văn bản AI (`estimateAiText`):** không dùng heuristic phong cách code; % = `ai_percent` AI chấm bài trả về,
  segments theo nhận định của AI, **độ tin cậy luôn Thấp** → chính sách mặc định (tự trừ khi ≥ Trung bình) chỉ đề xuất.
  **Câu hỏi vấn đáp** không áp dụng cho báo cáo (bỏ qua khi chấm; tạo tay → báo lỗi).
- **Trùng lặp:** `fingerprintFiles` nhận file có đuôi trong `REPORT_EXTS` (văn bản đã chuyển) → token = từ (`tokenizeWords`: bỏ dấu, chữ
  thường), k-gram 8 từ + winnowing; so sánh như code. Mẫu báo cáo giáo viên phát (file Office / file nén, hoặc folder
  chứa file Office — mục "Mẫu báo cáo giáo viên phát" ở tab Bài nộp) được loại trừ.
- **Code Review:** file Word / Excel / PowerPoint hiện dưới dạng văn bản đã chuyển; tab Tự động có khung **Kiểm tra hình thức** (số từ,
  trang, heading — bấm để nhảy tới dòng, bảng, hình, mục thiếu). Nhãn nguồn chấm theo `sourceLabel(source, kind)`.
  Với `.docx`/`.xlsx` có thêm nút **Văn bản / Xem trước** để xem đúng bố cục Office — chi tiết ở
  `code-review.md` (`OfficePreview.tsx`, IPC `review:office`, `readRawFile`). File cũ `.doc`/`.xls` chỉ xem được
  ở chế độ Văn bản.

## Lưu ý / giới hạn

- Chưa đọc `.pdf`, `.odt/.ods/.odp`, Pages / Numbers / Keynote; chưa đọc chú thích cuối trang, header/footer, công thức
  (OMML), nội dung ảnh, biểu đồ (chart), SmartArt.
- Không đọc được file Word 6/95, Excel 5/95 (quá cũ) và file có mật khẩu (mọi định dạng).
- .ppt (97-2003) chưa lấy ghi chú thuyết trình; bảng trong .ppt là nhóm shape → ra từng dòng `- `, không thành `| ô |`.
  .doc chỉ lấy bảng cấp 1 (bảng lồng gộp vào ô). Đoạn có style huge PAPX (`sprmPHugePapx`, hiếm) không nhận heading.
- Excel: ngày tháng hiện số serial, không áp định dạng số; sheet chart bỏ qua. Mục bắt buộc / số từ tối thiểu mặc định
  được nghĩ cho bài viết — với Excel / PowerPoint giáo viên nên chỉnh tab Kiểm tra hình thức (tên slide khớp mục bắt
  buộc nhờ so khớp "chứa").
- Số trang chỉ có khi phần mềm soạn thảo ghi `<Pages>` trong `docProps/app.xml` (Word có; nhiều công cụ khác không).
- Heading nhận theo style; báo cáo tự định dạng tiêu đề bằng chữ đậm / to (không dùng Heading) → không có `#`, kiểm
  tra mục bắt buộc chuyển sang so từng dòng ngắn.
- Dashboard / Integrity vẫn dùng chữ "% code AI" chung cho cả 2 loại bài.

## Test

`npm run typecheck`. Thủ công trong `npm run dev`: tạo assignment loại "Chấm báo cáo (Word / Excel / PowerPoint)" → rubric mẫu báo cáo,
tab Kiểm tra hình thức; folder gồm `A_1.docx` (có Heading, bảng), `B_2.zip` chứa 1 .docx + 1 .pdf, `C_3.docx` không
phải file Word, `~$A_1.docx`, `D_4.doc`, `E_5.xls`, `F_6.pptx`, `G_7.ppt`, `H_8.xlsx`, `I_9.doc` (thực chất là .docx
đổi đuôi), `K_10.xlsx` có mật khẩu → quét: A, B, D–I hợp lệ, C và K hỏng, file `~$` bị bỏ; chấm → Code Review hiện văn bản có `#`,
khung Kiểm tra hình thức báo thiếu mục / thiếu từ, cảnh báo .pdf; thêm tiêu chí nguồn Compile → không bắt đầu chấm
được. Đổi assignment về "Chấm code" → file .docx không còn được quét.

Kiểm tra nhanh bộ đọc không cần chạy app: bundle `src/main/importer/office.ts` bằng `npx esbuild … --bundle
--platform=node --external:yauzl --external:iconv-lite` rồi gọi `officeToText(readFileSync(file))` trên file mẫu (vd bộ
test-data của Apache POI: `SampleDoc.doc`, `SampleSS.xls`, `SampleShow.ppt`, `Lists.doc`, `password.xls`…).
