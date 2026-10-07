# Assignment, rubric, test case, rubric mẫu

- **Mục đích:** Định nghĩa một bài tập cần chấm: đề, công nghệ, rubric (thang 10), test case, backend AI, chính sách AI,
  folder bài nộp, code khung, danh sách lớp.
- **File:** `src/main/repo.ts` (Assignments, Rubric templates), `src/main/ipc.ts` (`assign:*`, `rubric:*`),
  `src/shared/types.ts` (`Assignment`, `Criterion`, `TestCase`), `src/renderer/src/pages/Assignments.tsx`,
  `src/renderer/src/components/RubricEditor.tsx`, `src/renderer/src/components/AssignmentFilter.tsx`
- **Changelog:** [../changelog/assignment.md](../changelog/assignment.md)

## Logic chính

- Lưu trong bảng `assignments` dạng JSON (`data`), thuộc 1 giáo viên (`user_id`). Đọc ra = `DEFAULT_ASSIGNMENT` ← data,
  `aiPolicy` luôn qua `normalizePolicy`; `kind` thiếu → `code`; `reportCheck` ← `DEFAULT_REPORT_CHECK`.
- **Loại bài (`kind`):** `code` (chấm code theo Tech Profile) hoặc `report` (chấm báo cáo .docx — ẩn chọn công nghệ,
  tab Test case thay bằng tab Kiểm tra hình thức `reportCheck`, rubric mẫu `REPORT_RUBRIC`). Chi tiết:
  [report-grading.md](report-grading.md).
- Trang Assignments có các tab: Thông tin (`InfoTab`), Chính sách AI (`AiPolicyTab`), Rubric (`RubricTab`), Test case
  (`TestsTab`), Bài nộp (`SubmissionsTab`).
- **Rubric:** mỗi tiêu chí có `id`, `name`, `max`, `source` ∈ `compile | test | static | ai | teacher`, mô tả.
  `validateRubric(rubric, kind)`: phải có ≥ 1 tiêu chí, **tổng max = 10**, tên không trống, id không trùng; báo cáo
  không được dùng nguồn `compile` / `test` (`sourcesFor`). `max` làm tròn 2 số lẻ.
  Chọn Tech Profile sẽ gợi ý rubric mẫu của profile đó (`BUILTIN_PROFILES[].rubric`).
- **Rubric mẫu:** giáo viên lưu rubric hiện tại thành template (`rubric_templates`) để dùng lại.
- **Test case (C/C++):** `input`, `expected`; tuỳ chọn `ignoreWhitespace`, `timeLimitMs` (mặc định 2000),
  `memoryLimitMb` (256).
- **Backend:** `local` hoặc `cloud` (+ `cloudProvider`, `cloudModel`, `cloudConsent` — bắt buộc tick đồng ý gửi code ra
  ngoài).
- **Đường dẫn:** `submissionsDir` (chọn folder), `starterDir` (code khung: folder hoặc 1 file nén — hộp chọn file nhận mọi đuôi trong `SUPPORTED_EXTS`, đọc như bài nộp).
- Lưu assignment mà `aiPolicy` thay đổi → `recomputePenalties()` tính lại điểm trừ + tổng điểm các bài đã chấm.
- Xoá assignment → xoá students, results, integrity_pairs liên quan.
- Assignment đang chọn nhớ theo user trong `localStorage['ms:lastAssignment:<userId>']`.

## Lưu ý / giới hạn

- Thêm field cho Assignment: thêm vào type + `DEFAULT_ASSIGNMENT` (DB cũ tự có giá trị mặc định).
- Hàng đợi không chạy khi rubric không hợp lệ (`canStart`).

## Test

Thủ công: tạo assignment, rubric tổng ≠ 10 → không bắt đầu chấm được, báo lỗi rõ; đổi chính sách AI → tổng điểm bài
đã chấm cập nhật.
