# MASTER SCORING — THIẾT KẾ ỨNG DỤNG CHẤM ĐIỂM CODE SINH VIÊN

> Nền tảng: **Windows 10 / Windows 11 (64-bit)**
> Người dùng: giáo viên / giảng viên
> Loại bài chấm: Java Android, Web Next.js, bài tập C, C++ (mở rộng được)

---

# PHẦN A — UI/UX & VISUAL DESIGN

## 1. Định hướng thiết kế

Ứng dụng là **Windows Desktop Application dành cho giáo viên/giảng viên**, vì vậy giao diện cần tạo cảm giác:

* Hiện đại
* Chuyên nghiệp
* Công nghệ
* Gọn gàng
* Dễ sử dụng
* Tập trung vào dữ liệu và code
* Phù hợp với workflow chấm nhiều bài sinh viên

Phong cách tổng thể:

```text
Modern
+ Dark
+ Developer / AI Tool
+ Professional
+ Data-driven
```

Không thiết kế theo phong cách website marketing hoặc dashboard SaaS quá nhiều decoration.

**Ngôn ngữ giao diện:** Tiếng Việt mặc định, có tuỳ chọn English. Tên màn hình trong tài liệu này viết tiếng Anh để thống nhất khi code; chuỗi hiển thị lấy từ file ngôn ngữ (vi / en).

**Tên ứng dụng:** Master Scoring.

---

## 2. Dark Theme là giao diện mặc định

Ứng dụng sử dụng **Dark Theme làm giao diện mặc định và chủ đạo**.

Tông màu tổng thể:

```text
Background:      #0B0F14   (nền chính)
                 #111827   (nền phụ: sidebar, top bar)

Surface:         #151B23   (card)
                 #1C2430   (card hover / input)

Border:          #273244

Primary:         #6366F1
Secondary / AI:  #8B5CF6

Success:         #22C55E
Warning:         #F59E0B
Error:           #EF4444
Info:            #3B82F6
Pending:         #64748B

Text Primary:    #F8FAFC
Text Secondary:  #94A3B8
Text Muted:      #64748B
```

Lưu ý tương phản: `Text Muted #64748B` trên nền `#0B0F14` có độ tương phản khoảng 4:1, thấp hơn mức 4.5:1 cho chữ thường. Chỉ dùng Text Muted cho metadata, placeholder, nhãn phụ; không dùng cho nội dung cần đọc.

Màu sắc cần được sử dụng có kiểm soát, ưu tiên:

```text
Dark background
     ↓
Neutral surfaces
     ↓
Subtle borders
     ↓
Primary accent
     ↓
Status colors
```

Không sử dụng quá nhiều màu accent cùng lúc.

Windows 11 hỗ trợ hiệu ứng Mica/Acrylic, Windows 10 thì không. Để giao diện giống nhau trên cả hai, **dùng nền màu đặc (solid)** như bảng màu trên, không phụ thuộc Mica. Thanh tiêu đề cửa sổ phải chuyển sang dark mode (dùng DWM immersive dark mode, có trên Win10 bản 20H1 trở lên và Win11).

---

## 3. Visual Style

UI cần mang cảm giác tương tự các ứng dụng developer/AI hiện đại.

Tham khảo về cảm giác thiết kế:

* Code editor
* AI coding tools
* Developer IDE
* Modern desktop productivity applications
* Data analysis tools

### Card

Card sử dụng:

* Background Surface (`#151B23`), sáng hơn nhẹ so với nền chính
* Border mảnh 1px (`#273244`)
* Border radius 6–8px
* Shadow rất nhẹ hoặc không có
* Không sử dụng card quá bo tròn

Ví dụ:

```text
┌────────────────────────────────────────────┐
│  Class Overview                            │
│                                            │
│  86 Students        78% Pass Rate          │
│                                            │
│  Average Score: 7.8                        │
└────────────────────────────────────────────┘
```

---

## 4. Layout ứng dụng

Main application sử dụng layout Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar      [Assignment ▾]     ● Local AI: Ready   User / ⚙ │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│   Sidebar     │              Main Content                    │
│               │                                              │
│ Dashboard     │                                              │
│ Assignments   │                                              │
│ Students      │                                              │
│ Grading Queue │                                              │
│ Code Review   │                                              │
│ Integrity     │                                              │
│ Reports       │                                              │
│───────────────│                                              │
│ Tech Profiles │                                              │
│ AI Models     │                                              │
│───────────────│                                              │
│ Settings      │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

### Top Bar

* Bộ chọn **Assignment đang làm việc** (mọi màn hình bên dưới hiển thị theo assignment này).
* **Chỉ báo AI backend** luôn hiển thị: `● Local AI: Ready`, `● Cloud: Gemini`, `● Chưa cấu hình AI`, `● Đang tải model 42%`. Click vào mở màn hình AI Models.
* User menu và Settings.

### Sidebar

Sidebar cần:

* Dark background
* Icon + label
* Active state rõ ràng
* Hover state
* Collapsible (khi thu gọn chỉ còn icon, có tooltip)
* Không chiếm quá nhiều diện tích (mở: ~220px, thu gọn: ~56px)

Menu chính:

```text
Dashboard          Tổng quan lớp của assignment đang chọn
Assignments        Tạo bài tập, chọn công nghệ, rubric, folder bài nộp
Students           Danh sách sinh viên + điểm + trạng thái
Grading Queue      Hàng đợi chấm, tiến trình, chạy/tạm dừng/huỷ
Code Review        Xem code + kết quả chấm từng sinh viên
Integrity          Độ trùng lặp giữa sinh viên + tín hiệu dùng AI
Reports            Xuất Excel/PDF

Tech Profiles      Cấu hình cho Java Android, Next.js, C, C++
AI Models          Chọn Local / Cloud, tải model, trạng thái

Settings
```

---

## 5. Dashboard Style

Dashboard là màn hình quan trọng nhất sau khi vào ứng dụng, đây cũng là **tab tổng quan điểm chung của cả lớp**.

Ưu tiên hiển thị thông tin theo thứ tự:

```text
Overview
   ↓
Statistics
   ↓
Charts
   ↓
Recent Grading Activity
   ↓
Issues / Alerts
```

Ví dụ:

```text
┌────────────────────────────────────────────────────────────┐
│ Dashboard                                                  │
│ Lab 3 – Android Login · ST4 Ca 2                           │
│                                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Students │ │ Average  │ │ Pass     │ │ Pending  │       │
│ │   120    │ │   7.8    │ │   82%    │ │    14    │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                            │
│ ┌─────────────────────────┐ ┌──────────────────────────┐   │
│ │ Score Distribution      │ │ Tín hiệu AI & Trùng lặp  │   │
│ │ (histogram 0–10)        │ │ 9 bài cần xem lại        │   │
│ │                         │ │ 3 cặp giống > 80%        │   │
│ └─────────────────────────┘ └──────────────────────────┘   │
│                                                            │
│ ┌─────────────────────────┐ ┌──────────────────────────┐   │
│ │ Điểm TB theo tiêu chí   │ │ Issues / Alerts          │   │
│ │ (bar chart)             │ │ 4 file zip lỗi tên       │   │
│ │                         │ │ 2 bài không compile được │   │
│ └─────────────────────────┘ └──────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

Định nghĩa số liệu:

* **Pass Rate:** tỉ lệ sinh viên có điểm ≥ ngưỡng đạt. Ngưỡng mặc định 5.0/10, chỉnh được trong Assignment.
* **Pending:** số bài chưa chấm xong (chờ, đang chấm, lỗi).
* **Điểm TB theo tiêu chí:** giúp giáo viên thấy cả lớp yếu phần nào.

Charts sử dụng dark-compatible styling, grid nhẹ và không gây rối mắt. Click vào cột/điểm trên chart → mở danh sách sinh viên tương ứng.

---

## 6. Code Review UI

Code Review phải là một trong những màn hình có tính chất **developer tool** rõ nhất.

Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ ◀ Nguyễn Văn A · 50.01.902.001   Tổng: 8.5/10    [Sửa điểm] ▶│
├──────────────┬─────────────────────────────┬────────────────┤
│ Project Tree │ Code Editor                 │ Kết quả chấm   │
│              │                             │                │
│ 📁 src       │  01 import ...              │ Tiêu chí       │
│  ├─ main     │  02 class Student {         │ Chức năng 3/4  │
│  ├─ utils    │  03 ...                     │ Cấu trúc  2/2  │
│  └─ models   │                             │ Clean code 1.5 │
│              │  syntax highlighting        │                │
│ 📄 README    │                             │ Issues         │
│              │                             │ [Test] ✖ Case 3│
│              │                             │ [AI]   ⚠ Dup.  │
└──────────────┴─────────────────────────────┴────────────────┘
```

(Icon 📁/📄 trong sơ đồ chỉ minh hoạ; khi làm thật dùng line icon theo mục 9.)

Yêu cầu:

* Syntax highlighting cho Java, Kotlin, XML, JS/TS/JSX/TSX, CSS, JSON, C, C++
* Line number
* File tree (ẩn sẵn các thư mục đã bị lọc ở mục 18)
* Search trong project
* Code folding
* Highlight issue
* Click issue → jump tới dòng code
* AI comments
* Static analysis / compile / test results
* Score contribution (mỗi issue ảnh hưởng tiêu chí nào)
* **Nhãn nguồn của issue:** `[Compile]`, `[Test]`, `[Static]`, `[AI]` để giáo viên biết cái nào khách quan, cái nào là nhận xét của AI.
* **Giáo viên sửa điểm từng tiêu chí** và ghi chú; điểm đã sửa được khoá, chấm lại không ghi đè.
* Nút ◀ ▶ và phím tắt chuyển sinh viên trước/sau.

Màn hình này nên có cảm giác gần với IDE/code editor. Code editor là **read-only**.

---

## 7. Login UI

Login dùng tài khoản local:

* Tài khoản **local, offline**: giáo viên tạo tài khoản ở lần mở đầu tiên, dữ liệu lưu trên máy.
* Mục đích: tách dữ liệu nhiều giáo viên dùng chung một máy và bảo vệ API key.
* Kiến trúc xác thực tách riêng, để sau này có thể chuyển sang đăng nhập qua server (đồng bộ, license) mà không đổi màn hình.

```text
┌──────────────────────────────────────────┐
│              [Logo] Master Scoring       │
│                                          │
│   Tên đăng nhập  [                    ]  │
│   Mật khẩu       [                    ]  │
│                                          │
│   [ Đăng nhập ]                          │
│   Chưa có tài khoản? Tạo tài khoản       │
└──────────────────────────────────────────┘
```

Mật khẩu lưu dạng hash (Argon2/bcrypt), không lưu bản rõ.

---

## 8. AI Model Setup UI

Màn hình setup model sau Login cũng phải tuân theo dark theme.

Luồng màn hình:

```text
Login
  ↓
Đã có AI backend sẵn sàng?
  ├─ Có  → vào Dashboard
  └─ Chưa → AI Configuration (mặc định: Local AI)
```

Ví dụ:

```text
┌──────────────────────────────────────────────────────┐
│                  AI Configuration                    │
│   Chọn cách ứng dụng phân tích code sinh viên        │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │  ◉ Local AI  · Khuyến nghị                   │   │
│   │  Code sinh viên không rời khỏi máy            │   │
│   │                                              │   │
│   │  Model: Qwen2.5-Coder-1.5B                   │   │
│   │  Dung lượng: ~1 GB · Phù hợp máy từ 8 GB RAM │   │
│   │  Có thể đổi model mạnh hơn trong Settings    │   │
│   │                                              │   │
│   │  Máy của bạn: RAM 8 GB · CPU 4 nhân · GPU —  │   │
│   │  Lưu tại: C:\Users\...\models   [Đổi]        │   │
│   │                                              │   │
│   │  [ Tải & Sử dụng ]                           │   │
│   └──────────────────────────────────────────────┘   │
│                                                      │
│   ▸ Tuỳ chọn nâng cao: Cloud AI (thu gọn mặc định)   │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │  ☐ Cloud AI (gọi API) · chỉ khi cần model    │   │
│   │    mạnh hơn cho project lớn                  │   │
│   │                                              │   │
│   │  Nhà cung cấp: [Gemini / OpenAI / Anthropic /│   │
│   │                 OpenAI-compatible (URL) ▾]   │   │
│   │  API Key  [••••••••••••••••]                 │   │
│   │  Model    [ ▾ ]                              │   │
│   │                                              │   │
│   │  ⚠ Code sinh viên sẽ được gửi tới máy chủ    │   │
│   │    của nhà cung cấp.                         │   │
│   │                                              │   │
│   │  [ Test Connection ]                         │   │
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

Trạng thái Local AI phải hiển thị rõ:

```text
Chưa cài → Đang tải (%, tốc độ, còn lại, [Tạm dừng]) → Đang kiểm tra file
        → Đang khởi động → ● Sẵn sàng
                         → ✖ Lỗi (nêu lý do + [Thử lại])
```

Modal/card không nên quá lớn; tập trung vào lựa chọn và trạng thái setup. Chi tiết kỹ thuật ở mục 16.

Nguyên tắc hiển thị:

* **Local AI là lựa chọn mặc định và ưu tiên.** Lần đầu mở app, chỉ cần cài Local AI là dùng được.
* Lần đầu luôn dùng model **Qwen2.5-Coder-1.5B**, không có ô chọn model để màn hình gọn. Model mạnh hơn nằm trong Settings → AI Models.
* Dòng "Máy của bạn" chỉ để thông tin, không đánh dấu đạt/không đạt và không chặn cài đặt.
* **Cloud AI là tuỳ chọn phụ**, nằm trong phần "Tuỳ chọn nâng cao" được thu gọn. Không bắt buộc cấu hình, không bao giờ tự bật.
* Lựa chọn "OpenAI-compatible (URL)" dùng cho API server riêng hoặc các dịch vụ tương thích chuẩn OpenAI.

---

## 9. Typography

Font cần dễ đọc trên Windows Desktop và **hiển thị đúng tiếng Việt có dấu**.

UI:

```text
Segoe UI Variable (Win11) / Segoe UI (Win10)   ← có sẵn trên Windows, ưu tiên
Inter                                            ← nếu dùng thì phải đóng gói kèm app
```

Code:

```text
Cascadia Code     (có sẵn trên Win11, kèm Windows Terminal)
JetBrains Mono    (đóng gói kèm app)
Consolas          (fallback, có sẵn trên mọi Windows)
```

Hierarchy:

```text
Page Title        20–24px, Semibold
    ↓
Section Title     16px, Semibold
    ↓
Card Title        14px, Semibold
    ↓
Body              13–14px, Regular
    ↓
Secondary / Meta  12px
Code              13px, monospace
```

Không sử dụng quá nhiều font size.

---

## 10. Iconography

Sử dụng icon đồng nhất trong toàn bộ application.

Ưu tiên icon style:

* Line icons (bộ Lucide)
* Simple
* Minimal
* Consistent stroke width

Ví dụ:

```text
Dashboard      → LayoutDashboard
Assignments    → FolderKanban
Students       → Users
Grading Queue  → ClipboardCheck
Code Review    → Code2
Integrity      → ShieldAlert
Reports        → FileBarChart
Tech Profiles  → Layers
AI Models      → Bot
Settings       → Settings
AI (nhãn)      → Sparkles
```

Không sử dụng emoji làm icon chính của application.

---

## 11. Animation & Interaction

Animation cần nhẹ và nhanh (150–200ms), phù hợp desktop productivity application. Tôn trọng tuỳ chọn "Animation effects" của Windows: nếu người dùng tắt thì tắt animation.

Sử dụng animation cho:

* Modal open/close
* Sidebar
* Loading
* Progress
* Toast
* Tab switching
* Chart appearance

Không sử dụng animation quá nhiều hoặc quá chậm.

Các thao tác grading cần ưu tiên phản hồi ngay:

```text
User Action
    ↓
Immediate UI Feedback
    ↓
Background Processing   (không bao giờ chạy trên UI thread)
    ↓
Progress Update
    ↓
Completed State
```

Phím tắt chính:

```text
Ctrl+O       Chọn folder bài nộp
F5           Chấm / chấm lại bài đang chọn
Ctrl+Enter   Chấp nhận điểm, sang sinh viên tiếp
Alt+← / →    Sinh viên trước / sau
Ctrl+F       Tìm trong code
Ctrl+E       Xuất báo cáo
```

---

## 12. Status Colors

Màu trạng thái phải thống nhất toàn app:

```text
Success  → Green   #22C55E
Warning  → Amber   #F59E0B
Error    → Red     #EF4444
Info     → Blue    #3B82F6
AI       → Purple  #8B5CF6
Pending  → Gray    #64748B
```

Trạng thái chấm:

```text
● Pending       Chờ chấm
● Extracting    Đang giải nén
● Analyzing     Đang compile/test/phân tích
● AI Grading    AI đang chấm
● Completed     Xong
● Reviewed      Giáo viên đã duyệt
● Failed        Lỗi (có lý do)
● Cancelled     Đã huỷ
```

Không chỉ dựa vào màu để biểu thị trạng thái; nên kết hợp icon/text để dễ nhận biết.

---

## 13. Responsive Desktop Layout

Ứng dụng chạy trên Windows 10/11; UI phải thích ứng với nhiều kích thước cửa sổ **và mức DPI scaling** của Windows (100%, 125%, 150%, 175%, 200%).

Lưu ý: laptop 1366×768 thường để scale 125% → không gian thực chỉ ~1093×614. Màn 1920×1080 scale 150% → ~1280×720. Vì vậy:

* Kích thước cửa sổ tối thiểu: **1024 × 600** (đơn vị logic, sau scaling).
* Thiết kế chuẩn trên 1280 × 720 logic.
* App khai báo **Per-Monitor DPI Aware v2** để chữ không bị mờ khi kéo cửa sổ sang màn hình khác.

Ở màn hình nhỏ:

* Sidebar tự collapse
* Dashboard cards tự thay đổi layout (4 → 2 cột)
* Code Review: panel "Kết quả chấm" thu thành ngăn kéo, ưu tiên không gian cho code
* Table có horizontal scrolling
* Không để nội dung bị cắt

---

## 14. Overall Design Principle

```text
Modern + Dark + Technology + Professional + Minimal
       + Data-focused + Developer-friendly
```

Mục tiêu cuối cùng là khi mở ứng dụng, người dùng phải cảm nhận đây là một **ứng dụng Desktop AI/Developer Tool chuyên nghiệp để phân tích và chấm code**, không phải một website được đóng gói thành desktop app.

---

# PHẦN B — CHỨC NĂNG & KỸ THUẬT

## 15. Workflow tổng thể

```text
Mở app → Login → (lần đầu) AI Configuration
   ↓
Tạo Assignment: tên, lớp, loại công nghệ, rubric, ngưỡng đạt, test case (nếu có),
                backend chấm (mặc định Local AI)
   ↓
Chọn folder chứa file zip bài nộp
   ↓
Quét folder → bảng kết quả quét (hợp lệ / lỗi tên / trùng MSSV / zip hỏng)
   ↓
Bắt đầu chấm (Grading Queue chạy nền)
   ↓
Giáo viên xem Code Review, sửa điểm nếu cần, duyệt
   ↓
Dashboard tổng quan + Integrity (trùng lặp, tín hiệu AI)
   ↓
Xuất Excel / PDF
```

Nút "Bắt đầu chấm" chỉ bật khi: backend của assignment đang Ready **và** assignment đã có rubric **và** có ít nhất 1 bài hợp lệ.

---

## 16. AI Backend

### 16.1 Quy tắc chung

* **Local AI là backend mặc định và ưu tiên.** Mọi bài chấm chạy trên máy, code sinh viên không rời khỏi máy.
* **Cloud AI là tuỳ chọn**, chỉ dùng cho những assignment cần model mạnh hơn (project lớn, nhiều file, logic phức tạp). Giáo viên phải bật riêng cho từng assignment (mục 16.3).
* Bộ cài **không kèm model**, giữ file cài nhẹ; model tải từ mạng về khi cài đặt lần đầu (mục 16.2).
* Phải có Local AI sẵn sàng, hoặc assignment đã bật Cloud AI, thì mới được chấm.
* Mỗi lần chấm ghi lại backend + tên model đã dùng vào kết quả.
* Local và Cloud dùng **chung một giao diện gọi** (chuẩn OpenAI Chat Completions). Phần chấm điểm chỉ viết một lần, khác nhau ở URL, key và tên model.

### 16.2 Local AI (chạy như LM Studio)

* App đóng gói sẵn **`llama-server.exe`** (llama.cpp), chạy như tiến trình phụ:
  * Khởi động khi chọn Local, tắt khi thoát app (kể cả khi app bị crash: gắn vào Windows Job Object để tự kết thúc theo).
  * Chỉ lắng nghe ở **127.0.0.1**, cổng trống chọn tự động → không mở ra mạng, không bật hộp thoại Windows Firewall.
  * Có 3 bản build: CPU (AVX2), CPU (không AVX2, cho máy đời cũ) và GPU (Vulkan, chạy được cả card NVIDIA/AMD/Intel). App tự chọn bản phù hợp, cho phép người dùng đổi.
  * Có GPU rời (kể cả 2 GB VRAM) thì tự đưa một phần model lên GPU, phần còn lại chạy CPU.
  * **Context mặc định 8K token**, chỉnh được trong Settings. Context càng lớn càng tốn RAM; bài vượt 8K được xử lý bằng bước tóm tắt từng file (mục 19.2).
* Model định dạng **GGUF**, tải từ Hugging Face lần đầu:
  * Hiển thị %, tốc độ, cho tạm dừng/tiếp tục, tải lại phần dở.
  * Kiểm tra SHA-256 sau khi tải.
  * Lưu tại `%LocalAppData%\MasterScoring\models\`, cho đổi sang ổ khác.
  * Kiểm tra dung lượng ổ trống trước khi tải.
  * Có thêm nút **"Nhập file model (.gguf)"** để dùng file đã tải sẵn (USB, ổ mạng nội bộ) khi máy không vào được Hugging Face.
  * Tải xong thì Local AI chạy **hoàn toàn không cần mạng**.
* Danh sách model:

```text
Qwen2.5-Coder-1.5B-Instruct  Q4_K_M  ~1 GB    Mặc định, chạy tốt trên đa số máy
Qwen2.5-Coder-7B-Instruct    Q4_K_M  ~4.7 GB  Tuỳ chọn, khuyến nghị cho máy mạnh
```

  * Lần cài đầu tiên luôn tải bản **1.5B**.
  * Bản **7B** chỉ có trong **Settings → AI Models**, kèm ghi chú: "Chấm ổn định và chính xác hơn, khuyến nghị cho máy từ 16 GB RAM". Giáo viên tự quyết định tải hay không.
  * Có thể giữ cả hai model và chuyển qua lại; mỗi kết quả chấm ghi lại model đã dùng.
* App đọc thông tin máy (RAM, CPU, GPU, dung lượng ổ) chỉ để hiển thị và ước tính thời gian chấm, **không chặn** cài đặt hay chấm bài.

### 16.3 Cloud AI (tuỳ chọn)

* **Tắt mặc định.** Chỉ dùng khi giáo viên chủ động bật.
* Bật theo **từng assignment**, không bật chung cho cả app. Trong màn hình Assignment có mục:

```text
Backend chấm:  ◉ Local AI (mặc định)
               ○ Cloud AI — [Provider / Model ▾]
                 ⚠ Code của sinh viên trong assignment này sẽ được gửi
                   tới máy chủ của nhà cung cấp.  [ Tôi đồng ý ]
```

* Bài chấm bằng Cloud được gắn nhãn `Cloud` trong danh sách và báo cáo.
* Nhà cung cấp: Gemini, OpenAI, Anthropic, OpenAI-compatible (tự nhập URL).
* API key lưu bằng **Windows DPAPI / Credential Manager**, không lưu bản rõ trong file cấu hình.
* "Test Connection" gửi một request nhỏ và báo lỗi cụ thể (sai key, hết quota, sai model, không có mạng).
* Gửi từng request một (không song song) và tự thử lại khi bị rate limit (429).
* **Cảnh báo quyền riêng tư:** code sinh viên được gửi ra ngoài. Mặc định **ẩn họ tên và MSSV** khỏi nội dung gửi đi (thay bằng mã ẩn danh).

### 16.4 Cấu hình gọi model khi chấm

* `temperature = 0` để điểm ổn định.
* Bắt model trả về **JSON theo schema cố định** (mục 19.3); JSON sai → thử lại tối đa 2 lần → vẫn sai thì đánh dấu Failed để giáo viên chấm tay.

### 16.5 Chính sách kết nối mạng

App chỉ dùng Internet trong các trường hợp sau, và chỉ khi người dùng chủ động thao tác:

```text
Tải model GGUF            Hugging Face           không gửi dữ liệu sinh viên
Tải bộ compile MinGW      nguồn phát hành chính   không gửi dữ liệu sinh viên
Cloud AI                  nhà cung cấp đã chọn    gửi code (đã ẩn tên, MSSV),
                                                  chỉ với assignment đã bật
```

Ngoài ra:

* **Không telemetry**, không gửi log, không thu thập thống kê sử dụng.
* Không tự kiểm tra cập nhật online; cập nhật bằng bộ cài mới.
* `llama-server` chỉ lắng nghe ở 127.0.0.1.
* Settings có trang **"Kết nối mạng"** liệt kê các lần app đã kết nối ra ngoài (thời gian, địa chỉ, mục đích) để giáo viên kiểm tra.

---

## 17. Import bài nộp

### 17.1 Quy ước tên file

```text
<TenSV>_<MSSV>.zip
Ví dụ:  HoDienCong_23546.zip   → tên "Ho Dien Cong", MSSV 23546
```

* Tách theo **dấu `_` cuối cùng**: phần trước là tên, phần sau là MSSV (vì tên có thể chứa khoảng trắng hoặc `_`).
* Tên viết liền kiểu CamelCase được tách thành các từ (`HoDienCong` → `Ho Dien Cong`); vẫn nhận tên có khoảng trắng.
* MSSV kiểm tra bằng mẫu cấu hình được trong Settings, mặc định: `^\d{4,12}$` (chỉ gồm chữ số).
* Có thể import thêm **danh sách lớp (Excel/CSV)** để đối chiếu MSSV → tên chuẩn, và phát hiện **sinh viên chưa nộp**.

### 17.2 Các trường hợp lỗi phải xử lý

```text
Sai định dạng tên        → vào danh sách "Cần gán", giáo viên gán MSSV tay
Trùng MSSV (nộp lại)     → mặc định lấy file mới nhất, báo cảnh báo, cho chọn file khác
Zip hỏng / có mật khẩu   → Failed, nêu lý do
File .rar / .7z          → báo không hỗ trợ (hoặc hỗ trợ .7z nếu tích hợp thư viện)
Zip lồng zip             → giải nén thêm 1 cấp
Zip chỉ chứa 1 thư mục gốc → tự lấy thư mục đó làm gốc project
Zip rỗng / không có code → Failed: "Không tìm thấy mã nguồn"
```

### 17.3 Vấn đề riêng của Windows khi giải nén

* **Tên file tiếng Việt bị lỗi font:** zip tạo bằng Windows Explorer thường không đánh dấu UTF-8. Nếu zip không có cờ UTF-8, thử giải mã lần lượt UTF-8 → CP1258 → CP437 và chọn kết quả hợp lệ.
* **Đường dẫn dài quá 260 ký tự:** project Next.js/Android có `node_modules`, `build` lồng rất sâu. Xử lý:
  * **Không giải nén** các thư mục bị loại ở mục 18 (bỏ qua ngay khi đọc zip), vừa tránh lỗi đường dẫn vừa nhanh hơn nhiều.
  * Thư mục làm việc ngắn: `%LocalAppData%\MasterScoring\w\<id>\`.
  * Dùng API hỗ trợ đường dẫn dài (`\\?\`) cho phần còn lại.
* **An toàn:**
  * Chặn **zip-slip** (đường dẫn `..\` hoặc tuyệt đối thoát ra ngoài thư mục làm việc).
  * Chặn **zip bomb**: giới hạn tổng dung lượng giải nén (mặc định 500 MB) và số file (mặc định 20.000).
  * Không giải nén/không chạy file `.exe`, `.bat`, `.ps1`, `.dll` có trong bài nộp.

---

## 18. Tech Profiles (cấu hình theo công nghệ)

Mỗi profile gồm: cách nhận diện, thư mục/file bỏ qua, công cụ kiểm tra tự động, rubric mẫu. Giáo viên chỉnh được, và thêm profile mới sau này (Python, Flutter...).

### 18.1 Java Android

```text
Nhận diện:  settings.gradle(.kts), build.gradle(.kts), AndroidManifest.xml
Bỏ qua:     build/, .gradle/, .idea/, app/build/, *.apk, *.aab, local.properties
Kiểm tra:   cấu trúc project, Activity/Fragment khai báo trong Manifest,
            layout XML, số dòng, phân tích tĩnh cơ bản
Build:      TẮT mặc định (cần Android SDK + JDK, rất nặng).
            Bật được nếu máy giáo viên đã cài và trỏ đường dẫn trong Settings.
```

### 18.2 Web Next.js

```text
Nhận diện:  package.json có dependency "next"
Bỏ qua:     node_modules/, .next/, out/, dist/, .vercel/, *.lock lớn
Kiểm tra:   app/ hoặc pages/, route, component, file .env bị lộ key (cảnh báo)
Build/Lint: TẮT mặc định. KHÔNG BAO GIỜ tự chạy "npm install"
            (script cài đặt của gói có thể chạy lệnh tuỳ ý trên máy giáo viên).
```

### 18.3 C / C++

```text
Nhận diện:  *.c, *.cpp, *.h, *.hpp (không thuộc 2 loại trên)
Bỏ qua:     *.exe, *.o, *.obj, Debug/, Release/, .vs/, x64/
Compile:    gcc / g++ (MinGW-w64). App tự tìm trên máy; nếu không có thì
            tải bản portable trong app (chỉ khi có assignment C/C++),
            không đóng gói sẵn để bộ cài nhẹ.
Test:       chạy với test case giáo viên cung cấp (input → output mong đợi),
            có timeout, giới hạn RAM, so sánh output (bỏ khoảng trắng thừa tuỳ chọn).
```

### 18.4 Chạy code sinh viên an toàn trên Windows

Áp dụng cho mọi bước compile/test:

* Chạy trong **Windows Job Object**: giới hạn thời gian CPU, RAM, số tiến trình con; tự kill khi quá giới hạn.
* Thư mục tạm riêng cho từng bài, xoá sau khi xong.
* Không cho chạy với quyền Administrator.
* Ghi nhận stdout/stderr, exit code, thời gian chạy vào kết quả.

---

## 19. Chấm điểm

### 19.1 Rubric

Mỗi Assignment có rubric gồm nhiều tiêu chí, tổng **10 điểm**:

```text
Ví dụ – Lab C++ mảng
  Biên dịch được           1.0   (tự động)
  Test case đúng           4.0   (tự động, chia theo số case)
  Đúng yêu cầu đề          2.0   (AI)
  Cấu trúc & tách hàm      1.5   (AI)
  Đặt tên & clean code     1.0   (AI)
  Comment / README         0.5   (AI)
```

* Mỗi tiêu chí có: tên, điểm tối đa, nguồn chấm (Tự động / AI / Giáo viên), mô tả để đưa vào prompt.
* Có rubric mẫu theo từng Tech Profile.
* Giáo viên dán **đề bài** vào Assignment để AI chấm "đúng yêu cầu đề".
* Lưu được rubric làm mẫu để dùng lại.

### 19.2 Pipeline chấm 1 sinh viên

```text
1. Giải nén (lọc theo profile)
2. Nhận diện công nghệ; nếu khác profile của assignment → cảnh báo
3. Kiểm tra tự động: compile / test / phân tích tĩnh
4. Chuẩn bị ngữ cảnh cho AI:
     - Project nhỏ: gửi toàn bộ file đã lọc
     - Project lớn (vượt context): tóm tắt từng file trước, sau đó chấm trên bản tóm tắt
       + các file quan trọng
5. AI chấm các tiêu chí nguồn "AI" theo rubric → JSON (kèm ước lượng % code AI + các đoạn AI/SV)
6. Ước lượng % code do AI viết / % SV tự viết, tính điểm trừ theo "Chính sách AI" (mục 20.3)
7. Ghép điểm tự động + điểm AI − điểm trừ dùng AI → tổng (không âm)
8. Tính fingerprint code cho phần Integrity (mục 20)
9. Lưu kết quả, trạng thái Completed
```

### 19.3 JSON AI trả về

```json
{
  "criteria": [
    {
      "id": "structure",
      "score": 1.0,
      "max": 1.5,
      "reason": "Hàm main quá dài, chưa tách hàm nhập/xuất.",
      "evidence": [{ "file": "src/main.cpp", "line_start": 12, "line_end": 80 }]
    }
  ],
  "issues": [
    { "severity": "warning", "file": "src/main.cpp", "line": 45,
      "message": "Lặp code tính tổng ở 3 chỗ." }
  ],
  "summary": "Bài làm đáp ứng phần lớn yêu cầu..."
}
```

App kiểm tra: điểm không vượt `max`, file/line tồn tại thật; sai → thử lại.

### 19.4 Grading Queue

* Chấm **lần lượt từng sinh viên một**, áp dụng cho cả Local và Cloud AI, để tránh tràn RAM hay máy quá tải. Bài sau chỉ bắt đầu khi bài trước xong hoàn toàn (giải nén → compile/test → AI chấm → lưu kết quả → dọn thư mục tạm).
* Project lớn cũng xử lý tuần tự từng file trong bài đó, không gửi song song.
* Phần so sánh trùng lặp giữa sinh viên (mục 20) chạy **sau khi** chấm xong cả lớp, cũng tuần tự.
* Tạm dừng / tiếp tục / huỷ; **đóng app giữa chừng thì lần mở sau tiếp tục từ chỗ dừng**.
* Chấm lại một bài hoặc cả lớp; bài có điểm giáo viên đã sửa thì không ghi đè.
* Hiển thị thời gian ước tính còn lại.
* Ngăn Windows chuyển sang Sleep khi đang chấm (tuỳ chọn).

---

## 20. Integrity: Trùng lặp & Tín hiệu dùng AI

### 20.1 Ước lượng, không phải kết luận

Hiện chưa có công cụ nào (kể cả LLM) xác định chắc chắn code do AI viết. App vẫn hiển thị **% ước lượng** để giáo viên
có cơ sở xem xét và trừ điểm theo chính sách, nhưng luôn kèm **độ tin cậy**, **lý do cụ thể theo từng đoạn code**
và cho giáo viên **bỏ trừ** ở từng bài.

### 20.2 Độ trùng lặp giữa sinh viên (đáng tin cậy)

* **Tuỳ chọn, mặc định TẮT** (Cài đặt → Chung → "So sánh & thống kê code giống nhau"). Khi tắt: không tự chạy sau khi chấm,
  ẩn cờ "Trùng x%" ở danh sách sinh viên, ẩn cột trùng lặp trong báo cáo. Fingerprint vẫn được tính khi chấm nên bật lại là so được ngay, không phải chấm lại.
* So sánh code giữa các sinh viên **cùng assignment** bằng fingerprint (chuẩn hoá tên biến, bỏ comment/khoảng trắng → k-gram → winnowing, cách làm giống MOSS).
* **Loại trừ code khung** (starter code) giáo viên phát, nếu giáo viên cung cấp.
* Hiển thị: danh sách cặp giống nhau > ngưỡng (mặc định 70%), nhóm (cluster) nhiều sinh viên giống nhau, màn **so sánh song song 2 bài** có tô các đoạn trùng.
* Tab **Thống kê trùng lặp**: số bài đã so, số/tỉ lệ SV có bài giống bạn khác ≥ ngưỡng, độ giống cao nhất, TB độ giống cao nhất mỗi bài,
  phân bố (≥ 90 / 80–90 / 70–80 / 50–70 / 30–50 / < 30%), bảng từng SV: giống nhất với ai, bao nhiêu %, số bạn vượt ngưỡng (click → so sánh song song).

### 20.3 Ước lượng % code AI và % sinh viên tự viết

Cách tính (`src/main/integrity/aiEstimate.ts`):

1. Chia mỗi file code thành **đoạn** (hàm / khối giữa các hàm, kèm comment ngay trên hàm; hàm > 70 dòng tách thêm một cấp).
2. Mỗi đoạn tính **đặc trưng phong cách** → xác suất AI (mô hình logistic, trọng số chọn tay):

   | Hướng AI (↑) | Hướng sinh viên (↓) |
   | --- | --- |
   | Comment kiểu chatbot (Step 1, Helper function, "Bước 1:", "Hàm này dùng để…") | Format lệch: trộn tab/space, `a=b` lẫn `a = b`, thụt lề lệch |
   | Javadoc/JSDoc đầy đủ `@param/@return`, mật độ comment cao, banner `=====` | Viết dính `for(int i=0;i<n;i++)` |
   | Tên biến khai báo dài kiểu mô tả (`numberOfElements`, `soLuongPhanTu`) | Tên biến tiếng Việt viết thường / viết tắt (`tong`, `dem`, `kq`) |
   | Cú pháp vượt mức môn học (`numeric_limits`, lambda, Stream API, `useCallback`…) | Comment tiếng Việt không dấu, chuỗi tiếng Việt không dấu |
   | Chuỗi thông báo tiếng Anh trau chuốt, emoji, format đồng đều tuyệt đối | Code bị comment lại, dấu vết debug, `system("pause")`, `getch()`, `void main` |

3. **Bài trộn**: đoạn có phong cách khác hẳn phần "giống sinh viên" của chính bài đó (≥ 3 tiêu chí: thụt lề, khoảng trắng,
   dấu ngoặc, ngôn ngữ comment, kiểu đặt tên) → tăng xác suất AI.
4. **Loại code khung**: dòng trùng k-gram với starter code giáo viên phát, và file do IDE sinh (ExampleUnitTest,
   `*.config.js`, `.d.ts`…) không tính vào phần sinh viên làm.
5. **Kết hợp LLM**: AI chấm bài trả thêm `ai_percent` và tối đa 8 đoạn `{file, line_start, line_end, origin: ai|student}`.
   Đoạn được LLM gán nhãn: `p = 0.6·p_phong_cách + 0.4·(0.85 | 0.15)`. % cuối = `0.75·%_theo_đoạn + 0.25·%_LLM`.
6. % code AI = tổng số dòng × mức AI của từng đoạn / tổng số dòng tự làm; xác suất ≤ 0.3 tính là SV, ≥ 0.7 tính là AI,
   ở giữa tính tỉ lệ. **% SV tự viết = 100 − % AI** (trên phần không phải code khung).
7. **Độ tin cậy**: Cao (≥ 120 dòng tự làm, tín hiệu rõ), Trung bình (≥ 30 dòng và tín hiệu khá rõ), còn lại Thấp;
   hạ một mức nếu heuristic và LLM vênh nhau > 40 điểm %.
8. Mức tín hiệu: ≥ 60% Cao, ≥ 30% Trung bình (độ tin cậy Thấp thì tối đa Trung bình).

### 20.4 Chính sách trừ điểm (theo từng assignment — tab "Chính sách AI")

* **Chế độ**: Tự động trừ (mặc định) / Chỉ đề xuất / Không trừ.
* **Bậc trừ** (áp bậc cao nhất đạt tới), mặc định: `≥ 40% → −1`, `≥ 60% → −2`, `≥ 80% → −4` (thang 10). Dưới bậc đầu không trừ.
* **Độ tin cậy tối thiểu** để tự trừ (mặc định Trung bình). Thấp hơn → chỉ đề xuất.
* Tổng điểm = tổng tiêu chí − điểm trừ, không âm. Điểm trừ hiện thành dòng riêng trong Code Review, báo cáo Excel/PDF.
* Giáo viên **Áp trừ / Bỏ trừ / Theo chính sách** ở từng bài; quyết định của giáo viên được giữ khi chấm lại.
* Đổi chính sách → tự tính lại điểm trừ + tổng điểm cho các bài đã chấm (giữ quyết định của giáo viên).

### 20.5 Câu hỏi vấn đáp cho bài nghi dùng AI (tuỳ chọn, mặc định TẮT)

* Bật trong Cài đặt → Chung; ngưỡng % code AI mặc định 60%. Khi chấm, bài đạt ngưỡng được AI (cùng backend chấm bài, có ẩn danh khi gửi Cloud)
  soạn ~6 câu hỏi bám vào các đoạn nghi do AI viết nhất (`src/main/integrity/questions.ts`): giải thích luồng xử lý, vì sao dùng cú pháp/thư viện đó,
  dự đoán output, sửa một chi tiết, trường hợp biên. Mỗi câu có file/dòng, mục đích kiểm tra và gợi ý đáp án.
* Lưu ở `results.ai_questions`. Lỗi khi tạo câu hỏi không làm hỏng kết quả chấm — chỉ ghi lỗi để giáo viên bấm "Tạo lại".
* Code Review → tab "Câu hỏi": xem, sao chép, tạo / tạo lại (cả với bài dưới ngưỡng). Integrity → "% code AI" có cột số câu hỏi.

### 20.6 Tab tổng quan lớp (Dashboard + Integrity)

* Phân bố điểm, điểm TB, trung vị, cao/thấp nhất, tỉ lệ đạt.
* Điểm TB theo từng tiêu chí.
* Tỉ lệ bài có tín hiệu AI mức Trung bình/Cao trên tổng số bài, % code AI trung bình, số bài bị trừ điểm.
* Integrity → "% code AI": bảng SV tự viết / AI, độ tin cậy, điểm trừ, sắp theo % AI giảm dần.
* Số cặp/nhóm trùng lặp.
* Danh sách chưa nộp, nộp lỗi, chấm lỗi.

---

## 21. Reports

* **Excel (.xlsx)** bảng điểm cả lớp: STT, MSSV, Họ tên, điểm từng tiêu chí, tổng, trạng thái, ghi chú giáo viên, cờ trùng lặp/tín hiệu AI, % code AI, % SV tự viết, độ tin cậy, điểm trừ dùng AI. Cho chọn cột trước khi xuất.
* **PDF nhận xét từng sinh viên** (tuỳ chọn): điểm, lý do từng tiêu chí, issue chính.
* **CSV** cho người cần nhập sang hệ thống khác.
* Đặt tên file mặc định: `<TenAssignment>_<Lop>_<ngay>.xlsx`.

---

## 22. Lưu trữ dữ liệu

```text
%LocalAppData%\MasterScoring\
   ├─ data\app.db          SQLite: user, assignment, rubric, sinh viên, kết quả, log
   ├─ models\              file GGUF (đổi vị trí được)
   ├─ runtime\             llama-server, MinGW (nếu tải)
   ├─ w\                   thư mục làm việc tạm (tự dọn)
   └─ logs\
```

* Không chép code sinh viên vào database; lưu đường dẫn zip gốc + kết quả.
* Có chức năng **Sao lưu / Khôi phục** dữ liệu.
* Có nút dọn thư mục tạm và xem dung lượng đang dùng.

---

## 23. Công nghệ đề xuất

**Phương án chính (chỉ Windows 10/11):**

```text
UI              .NET 8 + WPF, thư viện WPF-UI (Fluent dark)
Code editor     AvalonEdit (syntax highlight, line number, folding, highlight dòng)
Chart           LiveCharts2 hoặc ScottPlot
Icon            Lucide (bản SVG) chuyển sang WPF
Database        SQLite (Microsoft.Data.Sqlite)
Zip             System.IO.Compression (+ SharpCompress nếu cần .7z)
Local AI        llama-server.exe (llama.cpp) chạy sidecar
Excel           ClosedXML
Đóng gói        Inno Setup hoặc MSIX; cài vào thư mục user, không cần quyền Admin
```

**Thành phần trong bộ cài (không cần cài thêm app thứ 3):**

```text
Đóng gói sẵn                          Tải khi cần
───────────────────────────────────   ─────────────────────────────────
App (.NET 8 self-contained,           Model GGUF (1–5 GB)
  máy không cần cài .NET)             MinGW-w64 (chỉ khi chấm C/C++)
llama-server.exe (CPU, CPU cũ, Vulkan)
Visual C++ Runtime (llama-server cần)
Font JetBrains Mono
```

Giáo viên **không cần cài LM Studio, Ollama, .NET, Node.js hay Android SDK**. Driver GPU chỉ cần nếu muốn tăng tốc bằng card đồ hoạ (thường máy đã có); không có GPU thì chạy bằng CPU.

Phương án thay thế: Tauri hoặc Electron + React (dùng Monaco Editor, Lucide React). Hợp nếu sau này cần thêm macOS, nhưng khó đạt cảm giác "không phải website đóng gói" như mục 14.

**Phát hành trên Windows:**

* **Ký số (code signing)** file cài và `llama-server.exe`; nếu không, Windows SmartScreen và Defender dễ chặn hoặc cảnh báo.
* Kiểm tra trên cả Windows 10 (22H2) và Windows 11.
* Chỉ hỗ trợ 64-bit (x64). ARM64 để sau.

---

## 24. Cấu hình tham khảo

Đây là **thông tin để giáo viên biết trước tốc độ chấm**, không phải điều kiện bắt buộc. App không chặn cài đặt hay chấm bài vì cấu hình máy; máy yếu vẫn chấm được, chỉ mất nhiều thời gian hơn.

```text
                 Chạy được                    Chạy thoải mái
OS               Windows 10 / 11 (64-bit)     Windows 10 / 11 (64-bit)
CPU              4 nhân                       6–8 nhân
RAM              8 GB                         16 GB
GPU rời          không cần                    từ 2 GB VRAM (giúp chấm nhanh hơn)
Ổ đĩa trống      khoảng 3 GB (model 1.5B)     khoảng 8 GB (thêm model 7B)
Mạng             chỉ cần khi tải model / MinGW, hoặc khi dùng Cloud AI
```

Ghi chú cho giáo viên:

* Máy không có GPU rời vẫn chạy bằng CPU, chỉ chậm hơn.
* GPU từ 2 GB VRAM đã giúp tăng tốc. App tự đưa một phần model lên GPU, phần còn lại chạy trên CPU.
* Model 7B chạy được trên máy 8 GB RAM, nhưng nên tắt bớt các ứng dụng khác khi chấm.
* Có thể để app chấm cả lớp trong lúc nghỉ hoặc qua đêm. App tiếp tục từ chỗ dừng nếu bị tắt giữa chừng.
* Trước khi chấm, app hiển thị thời gian ước tính để giáo viên chủ động.
