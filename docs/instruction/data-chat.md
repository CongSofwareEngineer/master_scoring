# Trợ lý dữ liệu (Kế toán AI — chat với file Excel / CSV)

- **Mục đích:** Chức năng riêng, không gắn với assignment: admin / giáo viên mở một hoặc nhiều file Excel / CSV, xem
  bảng dữ liệu bên trái và đặt câu hỏi bằng chat bên phải (vd. "Tổng số tiền là bao nhiêu?", "% trung bình?",
  "Top 5 khách hàng doanh thu cao nhất?"). AI đóng vai **kế toán chuyên nghiệp** trả lời dựa trên số liệu thật.
- **File:**
  - `src/main/datachat/load.ts` — đọc file `.xlsx` / `.xlsm` / `.xls` / `.csv` / `.tsv` / `.txt` thành bảng có kiểu.
  - `src/main/datachat/session.ts` — phiên theo user (RAM): DB sql.js riêng, nạp bảng, thống kê cột, xem trước,
    `runQuery` (SQL chỉ-đọc), lịch sử chat.
  - `src/main/datachat/ask.ts` — `askData` / `cancelAsk`: dựng hội thoại từ phiên, chạy agent kế toán, lưu lượt trả lời.
  - `src/main/agents/agents/dataAnalyst.ts` — agent kế toán (system prompt + công cụ); `src/main/agents/tools/sql.ts`
    (`run_sql`), `tools/chart.ts` (`draw_chart`, `buildChart`), `tools/dataShared.ts` (`DataAgentState`, định dạng kết quả).
    Khung agent chung (vòng gọi công cụ, body gửi AI): xem [ai-agents.md](ai-agents.md).
  - `src/main/ipc.ts` (nhóm `data:*`), `src/main/importer/legacyOffice.ts` (`xlsSheets` dùng lại bộ đọc `.xls`)
  - `src/shared/types.ts` (`DataTable`, `DataColumn`, `DataNote`, `DataFile`, `DataQuery`, `DataChatTurn`,
    `DataChatState`, `DataPreview`, `DataBackendChoice`), `src/shared/i18n.ts` (bản English)
  - `src/renderer/src/pages/DataChat.tsx` (trang + Markdown tối giản), `src/renderer/src/components/DataChart.tsx`
    (biểu đồ / bảng trong câu trả lời), `src/renderer/src/components/Shell.tsx`
    (mục sidebar nhóm 2), `src/renderer/src/App.tsx`, `src/renderer/src/lib/store.ts` (`Page = 'datachat'`),
    `src/renderer/src/styles.css` (lớp `.datachat`, `.dc-*`)
- **Changelog:** [../changelog/data-chat.md](../changelog/data-chat.md)

## Logic chính

- **Vào chức năng:** mục **"Phân tích dữ liệu"** trên sidebar (nhóm riêng giữa các trang chấm bài và Tech Profiles /
  AI Models), không cần chọn assignment. Trang dạng toàn màn hình: trái = dữ liệu, phải = khung chat.
- **Đổi kích thước khung chat** (hook `useChatLayout` trong `DataChat.tsx`, để tập trung xem dữ liệu hoặc chat):
  - Mặc định `clamp(360px, 34vw, 480px)`. Kéo mép trái khung chat (`.dc-chat-resizer`) → độ rộng ≥ 320px, bảng dữ liệu
    luôn chừa ≥ 320px (CSS `min(var(--dc-chat-w), 100% - 320px)` nên thu nhỏ cửa sổ cũng không đè bảng). Nhấp đúp mép → mặc định.
  - Nút **Phóng to khung chat** (chat chiếm tối đa, bảng còn 320px) / bấm lại về mặc định. Nút **Thu gọn khung chat** →
    còn dải 44px bên phải (`.dc-chat-rail`), bấm để mở lại; đang trả lời thì dải hiện spinner. Khi thu gọn ChatPanel vẫn
    mount (chỉ ẩn bằng CSS) nên câu đang hỏi / tiến trình không mất.
  - Lưu theo máy: `localStorage['ms:dataChatWidth']` (px, không có = mặc định), `localStorage['ms:dataChatCollapsed']`.
- **Mở file (`data:open`):** hộp thoại ở main, chọn nhiều file. Mỗi sheet có dữ liệu (sheet ẩn bỏ qua) = 1 bảng; CSV = 1 bảng.
  File lỗi → toast lỗi riêng, các file khác vẫn nạp (bảng đã tạo của file lỗi bị xoá); tất cả lỗi → báo lỗi.
  - **CSV:** giải mã qua `decodeText` (UTF-8 / UTF-16 / CP1258), tự chọn dấu phân cách `;` `,` tab theo 20 dòng đầu,
    giữ xuống dòng trong ô có ngoặc kép. File `.xls` không phải OLE (phần mềm xuất "xls" dạng text) → đọc như CSV.
  - **Ô gộp (xlsx):** ô phụ của vùng gộp coi là trống (tiêu đề gộp không bị lặp ở mọi cột). Ô công thức lấy `result`.
  - **Dòng tiêu đề:** trong 15 dòng không trống đầu, dòng đầu tiên có ≥ 2 ô, ≥ 40% số cột có dữ liệu, ≥ 1/2 số ô là chữ
    (không phải số / ngày) và các chữ phần lớn khác nhau → bỏ qua tiêu đề báo cáo kiểu "BÁO CÁO DOANH THU THÁNG 9".
    Không tìm thấy → cột "Cột N" + ghi chú.
  - **Tên SQL:** cột và bảng đổi sang không dấu, chữ thường, `a-z0-9_` (vd. "Số tiền (VNĐ)" → `so_tien_vnd`), trùng thêm
    `_2`, trùng từ khoá SQL thêm `_`. Bảng: 1 sheet / CSV → theo tên file; nhiều sheet → theo tên sheet. Tiêu đề gốc giữ ở
    `label` (UI hiển thị, AI được biết).
  - **Dòng "Tổng cộng":** các dòng cuối liên tiếp có ô đầu tiên là `Tổng cộng / Tổng số / Tổng / Cộng / Total / Sum` bị bỏ
    (ghi chú trên bảng) — tránh AI cộng trùng.
  - Bỏ dòng trống, cột trống hoàn toàn. Giới hạn 200.000 dòng / bảng (ghi chú khi cắt), 200 cột.
  - **Kiểu cột:** ≥ 80% ô có dữ liệu là số → `number` (cột SQL `REAL`); ≥ 80% là ngày → `date` (`YYYY-MM-DD` hoặc
    `YYYY-MM-DD HH:MM:SS`); còn lại `text`. Ô `-` / `–` coi là trống.
  - **Số:** chọn kiểu phân cách theo cả cột (VN `1.234.567,5` hay US `1,234,567.5` — kiểu nào đọc được nhiều ô hơn, hoà →
    VN). Bỏ `₫ đ VND VNĐ USD $ €`, khoảng trắng; `(1.000)` = số âm; `15%` → 15 và cột đánh dấu `%`. Ô Excel định dạng % (0,15)
    → nhân 100 (15). `.xls` đã là số chuẩn → kiểu US.
  - **Ngày:** Date của Excel (UTC), `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd` (có thể kèm giờ).
- **Thống kê cột** (tính bằng SQL lúc nạp, hiển thị ở tab "Thống kê cột" và gửi cho AI): số ô có dữ liệu, số giá trị khác
  nhau; số → tổng / TB / min / max; ngày → min / max; chữ (hoặc ≤ 12 giá trị khác nhau) → 8 giá trị hay gặp nhất.
- **Xem dữ liệu (`data:preview(table, offset, limit, { search, column })`):** 200 dòng / lần, nút "Tải thêm". Số định dạng
  theo ngôn ngữ (vi-VN / en-US). Cột `#` = số thứ tự dòng dữ liệu (`rowid`, dòng 1 = dòng đầu sau tiêu đề), giữ nguyên khi lọc
  để đối chiếu với file gốc.
- **Tìm kiếm trong bảng** (để dò tới dòng cần kiểm tra đúng / sai):
  - Ô tìm kiếm trên bảng (`Ctrl/Cmd+F` để focus, `Esc` xoá, gõ xong 300ms tự tìm) + chọn cột ("Tất cả cột" hoặc 1 cột).
  - Lọc ở main trên **toàn bộ bảng** (không chỉ 200 dòng đang hiện), trả về tổng số dòng khớp ("Tìm thấy n / N dòng").
  - Chữ: không phân biệt hoa thường và có dấu — DB phiên đăng ký hàm SQL `unaccent()` (bỏ dấu, `đ`→`d`, chữ thường), so
    `unaccent(cot) LIKE '%từ khoá%'` (escape `%` `_` `\`). "cong ty a" khớp "Công ty A"; "2026-10" khớp ngày tháng 10.
  - Số: từ khoá đọc được thành số (kiểu VN `1.500.000` hoặc US `1,500,000.5`) → thêm điều kiện `cot = giá trị` cho cột số.
  - UI tô sáng (`<mark>`) đoạn chữ khớp; ô số khớp theo giá trị được tô cả ô; tiêu đề cột đang lọc đổi màu.
- **Hỏi đáp (`data:ask` → `askData`):**
  1. Agent `data_analyst` (khung tool calling — [ai-agents.md](ai-agents.md)). Prompt hệ thống (viết gọn để tiết kiệm token, ~2.200 ký tự + phần dữ liệu): vai kế toán trưởng; mô tả từng bảng (tên SQL; mỗi cột 1 dòng gọn `"ten" kiểu "tiêu đề gốc"; đầy=…; khác=…; thống kê; hay gặp`, chú giải khoá ở đầu phần DỮ LIỆU; ghi chú), 8 dòng mẫu / bảng
     (bỏ dòng mẫu nếu mô tả > 18.000 ký tự); quy tắc SQLite (ngoặc kép tên, `strftime` cho ngày, cột % là số phần trăm);
     quy tắc trả lời **dạng báo cáo đầy đủ, không trả lời cụt** — các mục `###`: Kết luận chính (số in đậm), Chi tiết số liệu
     (tổng / TB / min / max / tỉ trọng / chênh lệch, bảng Markdown), Phân tích / nhận xét (so sánh, xu hướng, bất thường, mức
     tập trung), Cách tính (bảng / cột / công thức / giả định), Cảnh báo, Gợi ý 1–3 câu hỏi tiếp; khuyến khích chạy thêm truy vấn
     phụ (gộp nhiều chỉ số / truy vấn); trung bình đơn giản vs gia quyền; không bịa số; ngôn ngữ theo `settings.lang`.
     `maxTokens` mỗi lượt AI = 4096 (để câu trả lời dài không bị cắt). Kèm 8 lượt chat gần nhất (bỏ lượt lỗi, mỗi lượt cắt 2.500 ký tự).
  2. AI gọi công cụ bằng `tool_calls` chuẩn OpenAI: `run_sql(sql, purpose)` để lấy số liệu, `draw_chart(type, title, sql)` để
     vẽ; đủ số liệu thì trả lời **trực tiếp bằng Markdown** (không còn JSON `{action:…}`; bỏ ```` ```markdown ```` bọc ngoài nếu có).
  3. `run_sql` → `runQuery`: trước khi chạy, `fixQuotedColumns` sửa tên cột lỡ viết trong nháy đơn (`AVG('eth')` →
     `AVG("eth")` — SQLite coi `'eth'` là chuỗi chữ nên ra 0 mà không báo lỗi) ở tham số hàm tính (SUM / AVG / MIN / MAX /
     TOTAL / COUNT / ROUND / ABS / CAST / GROUP_CONCAT), sau `GROUP BY` / `ORDER BY`, và đối số thứ 2 của `strftime`; chỉ
     khi chuỗi trùng tên cột. Giá trị so sánh (`WHERE token = 'eth'`) không đụng tới. SQL hiển thị là bản đã sửa.
     **Tên trong nháy kép không có thật** (`AVG("ETH")` khi cột thật là `gia_eth`): SQLite mặc định coi là chuỗi chữ → ra 0
     không báo lỗi (biểu đồ toàn 0). `prepareChecked` prepare bản đổi `"…"` → `[…]` (ngoặc vuông luôn là tên) để SQLite báo
     "no such column": tên trùng đúng 1 tiêu đề gốc / tên cột (so không dấu, bỏ ký tự đặc biệt) → tự đổi sang tên SQL (không đổi
     alias sau `AS`); không thì lỗi "Không có cột "X" … Các cột: "ten" (tiêu đề), …" gửi lại cho AI sửa. Hệ quả: giá trị chữ viết
     trong nháy kép (`WHERE ngay = "2026-01-01"`) cũng báo lỗi để AI đổi sang nháy đơn.
     Chỉ `SELECT` / `WITH`, 1 câu lệnh, chặn từ khoá ghi / `ATTACH` / `PRAGMA`… (soát sau khi bỏ chuỗi
     `'…'`); giữ tối đa 200 dòng, đếm tới 100.000. Kết quả (≤ 50 dòng) hoặc lỗi SQL gửi lại cho AI để đọc / tự sửa.
  4. Tối đa 6 vòng gọi công cụ (mỗi vòng có thể nhiều lần gọi); vòng thứ 7 gửi `tool_choice: 'none'` + nhắc trả lời ngay bằng
     dữ liệu đã có. Mọi truy vấn `run_sql` lưu ở `DataChatTurn.queries`.
  - Lỗi AI / bấm Dừng → vẫn ghi một lượt trả lời `error: true` ("Lỗi khi hỏi AI: …" / "Đã dừng.") để hội thoại liền mạch.
  - Mỗi câu trả lời hiện "Truy vấn đã chạy (n)": mục đích, SQL, bảng kết quả — admin kiểm tra lại được. Ghi tên AI đã dùng.
- **Biểu đồ / bảng trực quan trong câu trả lời:**
  - AI gọi công cụ `draw_chart(type, title, sql)` (tối đa 3 biểu đồ / câu hỏi; gọi lại cùng `title` = thay biểu đồ đó).
    Công cụ trả lại cho AI loại đã vẽ (kể cả khi bị hạ loại) + ≤ 20 dòng số liệu để AI phân tích. `DataChartType` (15 loại, theo danh sách
    ví dụ của Chart.js):
    | `type` | Loại | Dữ liệu SQL |
    | --- | --- | --- |
    | `bar` | Cột đứng; ≥ 2 cột số = cột nhóm (grouped) | nhãn + 1–6 cột số |
    | `hbar` | Thanh ngang (nhiều nhóm / tên dài) | nhãn + 1–6 cột số |
    | `stacked` / `hstacked` | Cột chồng / thanh ngang chồng (dương cộng lên, âm cộng xuống; tooltip có Σ) | nhãn + ≥ 2 cột số |
    | `line` | Đường | nhãn (thời gian) + cột số |
    | `area` | Vùng — đường + nền gradient cho mọi chuỗi (Gradient chart) | như `line` |
    | `multiaxis` | Đường 2 trục y: chuỗi 1 trục trái, chuỗi 2 trục phải (nhãn trục tô màu chuỗi) | nhãn + ≥ 2 cột số |
    | `combo` | Kết hợp (multitype): chuỗi 1 vẽ cột, các chuỗi sau vẽ đường cùng trục | nhãn + ≥ 2 cột số |
    | `pie` / `doughnut` | Tròn đặc / tròn rỗng (tổng ở giữa) | nhãn + 1 cột số ≥ 0 |
    | `polar` | Vùng cực: góc bằng nhau, bán kính tỉ lệ giá trị, ≤ 12 nhóm (> 6 thì màu lặp, nhạt hơn) | nhãn + 1 cột số ≥ 0 |
    | `radar` | Mạng nhện: mỗi dòng 1 trục (3–12), mỗi cột số 1 đa giác | nhãn + 1–6 cột số |
    | `scatter` | Phân tán, có tên trục X / Y | [tên điểm] + X + Y (≤ 200 điểm) |
    | `bubble` | Bong bóng: diện tích ∝ cột số 3 | [tên điểm] + X + Y + kích thước |
    | `table` | Bảng số liệu | bất kỳ |
    Tên khác model hay dùng được đổi về loại của app (`column`/`grouped` → `bar`, `donut` → `doughnut`, `polarArea` → `polar`,
    `spider` → `radar`, `mixed`/`multitype` → `combo`, `dual_axis` → `multiaxis`); loại lạ → `bar`.
    AI **không ghi số vào biểu đồ** — app chạy `sql` bằng `runQuery` (chỉ-đọc), kết quả lưu trong `DataChatTurn.charts`
    (`DataChart` = `DataQuery` + `type` + `title`).
  - Quy ước kết quả SQL: cột đầu = nhãn, các cột số sau = chuỗi dữ liệu (tối đa 6); AI đặt alias dễ đọc làm tên chuỗi.
    Kết quả 1 dòng nhiều cột số (`SELECT AVG("eth") AS ETH, AVG("btc") AS BTC`) → app xoay thành mỗi cột 1 nhóm (trừ scatter /
    bubble). Không có cột số / < 2 dòng → tự hiện dạng bảng. Hạ loại khi thiếu dữ liệu (`buildChart` ở main + `ChartBody` ở
    renderer): `stacked`/`combo` 1 cột số → `bar`, `hstacked` → `hbar`, `multiaxis` → `line`, `radar` < 3 dòng → `bar`,
    `bubble` thiếu cột kích thước → `scatter`, scatter < 2 cột số → bảng; tròn / vùng cực có số âm → `hbar`. Scatter: cột đầu là
    số và không dư cột → chính nó là X (không có tên điểm). Biểu đồ mà mọi giá trị đều 0 → lần đầu chưa vẽ, công cụ trả cảnh báo để AI
    kiểm tra SQL (gọi lại y như cũ thì chấp nhận). Prompt dặn cấm nháy đơn cho tên cột. Mô tả công cụ `draw_chart` dặn: so sánh giữa các cột (eth, btc…) → một dòng
    `SELECT AVG("eth") AS "ETH", …` (app tự xoay); tham số `type` chứa hướng dẫn chọn loại biểu đồ (system prompt không lặp lại). SQL biểu đồ lỗi → công cụ trả lỗi, biểu đồ không được thêm, AI sửa SQL và gọi lại.
  - Prompt dặn: vẽ khi người hỏi muốn xem trực quan hoặc so sánh nhóm / xu hướng / tỉ trọng; người hỏi chỉ định loại thì
    dùng đúng loại; không vẽ khi chỉ có 1 con số. Lịch sử chat gửi kèm danh sách biểu đồ đã vẽ (loại, tiêu đề, SQL) để hỏi
    tiếp kiểu "đổi sang biểu đồ tròn".
  - Vẽ bằng SVG tự viết (như Dashboard, không thêm thư viện): thanh ≤ 24px (cột chồng / combo ≤ 36px) bo 4px ở đầu dữ liệu
    (cột chồng chỉ bo đoạn ngoài cùng, các đoạn cách nhau viền 1px), khe 2px giữa các thanh nhóm, hỗ trợ số âm; đường 2px +
    nền gradient khi 1 chuỗi (vùng: mọi chuỗi, đậm hơn), chấm cuối, đường dóng khi hover; tròn / tròn rỗng ≤ 6 phần
    (quá → 5 phần lớn nhất + "Khác (n)" màu xám), bỏ giá trị ≤ 0 (ghi chú); chú thích + % bên cạnh (tròn đặc ghi tổng trên chú
    thích, tròn rỗng ghi tổng ở giữa). Radar: lưới đa giác + nan hoa, rê vào hình quạt mỗi trục hiện giá trị mọi chuỗi.
    Scatter / bubble: trục X / Y không ép gồm 0, tên cột làm tiêu đề trục, bong bóng lớn vẽ trước. Gradient dùng `useId()` làm id. Trục số rút gọn theo ngôn ngữ (vi: "Tr" = triệu, "T" = tỷ; en: M / B). Nhãn giá trị chọn lọc
    (1 chuỗi, ≤ 10 cột). Chú thích (legend) khi ≥ 2 chuỗi (combo: chuỗi đường hiện dạng gạch). Vẽ tối đa 40 nhóm (cột / thanh), 200 điểm (đường) — có ghi chú.
  - Mỗi biểu đồ có tooltip khi rê chuột (giá trị đầy đủ), nút chuyển **Biểu đồ / Bảng số liệu**, nút **Phóng to** (modal,
    vẽ lại khổ rộng).
  - Màu chuỗi: biến `--series-1..6` + `--series-other` trong `styles.css` (bảng màu dark đã kiểm tra bằng validator
    dataviz trên nền `#151b23` và `#111827`: phân biệt được với người mù màu, tương phản ≥ 3:1).
  - Tiến trình (`data:progress`): "AI đang phân tích câu hỏi…", "Đang chạy truy vấn: …", "AI đang đọc kết quả…", "Đang vẽ biểu đồ…".
- **Chọn AI:** dropdown trên khung chat: Local AI hoặc nhà cung cấp Cloud đã cấu hình. Mặc định Local nếu sẵn sàng, không thì
  Cloud đầu tiên; nhớ ở `localStorage['ms:dataChatBackend']`; lựa chọn Cloud không còn key → tự đổi. Local → main gọi
  `ensureLocalStarted()` trước. Chọn Cloud → cảnh báo mô tả cột, dòng mẫu và kết quả truy vấn sẽ gửi ra ngoài (đi qua
  `netFetch`, có trong nhật ký mạng).
- **Phiên:** `Map<userId, Session>` trong RAM của main; chuyển trang rồi quay lại vẫn còn file và hội thoại. Đăng xuất /
  tắt app / "Đóng tất cả" → mất. "Xoá hội thoại" chỉ xoá chat, giữ file. Đang trả lời thì không gửi câu mới được.
- **Gợi ý câu hỏi** (khi chưa có hội thoại): sinh theo cột của bảng đầu — tổng cột tiền, trung bình cột %, tổng theo nhóm
  (cột chữ 2–50 giá trị), theo tháng (có cột ngày), top 5, tóm tắt kiểu kế toán.

## Lưu ý / giới hạn

- Chưa hỗ trợ kéo-thả file vào trang (renderer sandbox không có đường dẫn file) — chỉ mở qua nút "Mở file".
- File `.xls` (Excel 97-2003): ngày đọc thành số serial của Excel (chưa đổi sang ngày), không nhận định dạng %.
- Tiêu đề 2 tầng (gộp ô nhiều dòng) chỉ lấy 1 dòng làm tiêu đề. Bảng dữ liệu không có tiêu đề mà dòng đầu toàn chữ có thể bị
  nhận nhầm làm tiêu đề.
- sql.js chạy đồng bộ trên main: truy vấn quá nặng (JOIN chéo bảng lớn) có thể làm app khựng.
- Model Local nhỏ có thể viết SQL sai / hiểu nhầm cột — app gửi lỗi lại cho AI sửa trong 6 vòng; câu hỏi phức tạp nên dùng Cloud AI.
- Qwen2.5-Coder (Local) thường viết tool call thành chữ ```` ```json {"name","arguments"} ```` thay vì `tool_calls` — `llm.ts` tự nhận dạng (xem ai-agents.md).
- Dữ liệu và hội thoại không ghi vào `app.db`, không có trong bản sao lưu.
- Thông báo lỗi do main ném (vd. lỗi đọc file) hiện tiếng Việt (giống quy ước i18n chung).

## Test

`npm run typecheck`. Thủ công (`npm run dev`): mở trang Phân tích dữ liệu → mở 1 file `.xlsx` có tiêu đề báo cáo gộp ô ở
trên, dòng "Tổng cộng" ở cuối, cột ngày, cột % và cột số → kiểm tra tab Thống kê cột (tổng không gồm dòng Tổng cộng, % hiện
5% chứ không phải 0,05); mở thêm `.csv` dùng `;` với số `1.234.567`, `(500.000)`, `12,5%`; tìm "cong ty a" (không dấu), "1.500.000", chọn 1 cột rồi tìm → số dòng khớp và cột `#` đúng với file gốc; hỏi "Tổng số tiền là bao nhiêu?",
"Chiết khấu trung bình bao nhiêu %?", "Doanh thu theo từng tháng?" → mở "Truy vấn đã chạy" đối chiếu với Excel; đổi sang Cloud
AI → hiện cảnh báo; hỏi "Vẽ biểu đồ cột doanh thu theo chi nhánh", "biểu đồ tròn tỉ trọng chi phí", "biểu đồ đường theo
tháng", "biểu đồ cột chồng doanh thu từng sản phẩm theo tháng", "biểu đồ vùng", "đường 2 trục doanh thu và số đơn",
"cột doanh thu kết hợp đường lợi nhuận", "biểu đồ tròn rỗng", "vùng cực", "radar so sánh các chi nhánh theo nhiều chỉ tiêu",
"scatter số lượng và doanh thu", "bong bóng thêm kích thước = lợi nhuận" → kiểm tra câu trả lời có đủ các mục (kết luận, chi tiết,
phân tích, cách tính, gợi ý) không bị cắt; rê chuột xem tooltip, chuyển sang Bảng số liệu đối chiếu, bấm Phóng to; rồi hỏi tiếp "đổi sang biểu đồ tròn"; bấm Dừng khi đang trả lời; kéo mép trái khung chat rộng / hẹp, nhấp đúp về mặc định, bấm Phóng to / Thu gọn (khi đang
trả lời vẫn thấy spinner ở dải thu gọn), thu nhỏ cửa sổ → bảng vẫn còn ≥ 320px, tắt mở lại app → giữ độ rộng; chuyển trang rồi quay lại → còn hội thoại; đổi ngôn ngữ English → trang không
còn chữ tiếng Việt (trừ dữ liệu).
