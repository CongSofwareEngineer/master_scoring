import { useState } from 'react'
import { BookOpen, FileText, HelpCircle, User, Code2, Settings as SettingsIcon } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { cls } from '../lib/format'

type Tab = 'overview' | 'naming' | 'workflow' | 'troubleshooting'

export function HelpPage(): JSX.Element {
  const t = useT()
  const params = useStore((s) => s.params)
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'naming')
  const tabs: [Tab, string, JSX.Element][] = [
    ['overview', 'Tổng quan', <BookOpen key="o" size={14} />],
    ['naming', 'Quy tắc đặt tên file', <FileText key="n" size={14} />],
    ['workflow', 'Quy trình sử dụng', <Code2 key="w" size={14} />],
    ['troubleshooting', 'Khắc phục sự cố', <HelpCircle key="t" size={14} />]
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">{t('Hướng dẫn sử dụng')}</div>
      </div>
      <div className="tabs">
        {tabs.map(([k, label, icon]) => (
          <button key={k} className={cls('tab', tab === k && 'active')} onClick={() => setTab(k)}>
            {icon} {t(label)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'naming' && <NamingConventions />}
      {tab === 'workflow' && <Workflow />}
      {tab === 'troubleshooting' && <Troubleshooting />}
    </div>
  )
}

function Overview(): JSX.Element {
  const t = useT()
  return (
    <div className="card col gap-16" style={{ maxWidth: 900 }}>
      <div className="card-title">Master Scoring là gì?</div>
      <div className="meta">
        Master Scoring là ứng dụng chấm điểm tự động cho bài tập lập trình của sinh viên.
        Ứng dụng hỗ trợ nhiều ngôn ngữ: Java Android, Next.js, C, C++, Solidity và có thể mở rộng.
      </div>
      <div className="divider" />
      <div className="card-title">Chức năng chính</div>
      <div className="col gap-8">
        <div className="row gap-12">
          <User size={20} />
          <div className="col gap-2">
            <strong>Quản lý sinh viên và bài tập</strong>
            <span className="meta">Nhập danh sách sinh viên, tạo assignment, quản lý điểm</span>
          </div>
        </div>
        <div className="row gap-12">
          <Code2 size={20} />
          <div className="col gap-2">
            <strong>Chấm điểm tự động</strong>
            <span className="meta">Biên dịch, chạy test case, phân tích tĩnh, phát hiện đạo code và sử dụng AI</span>
          </div>
        </div>
        <div className="row gap-12">
          <FileText size={20} />
          <div className="col gap-2">
            <strong>Chấm báo cáo / bài viết (Word / Excel / PowerPoint)</strong>
            <span className="meta">
              Assignment loại “Chấm báo cáo”: đọc file Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), kiểm tra hình thức (số từ, mục bắt buộc, tài liệu tham khảo), AI chấm nội dung theo rubric báo cáo,
              so trùng lặp văn bản giữa các bài. Xem bài trong Code Review: file .docx / .xlsx có nút <b>Văn bản / Xem trước</b> để xem đúng bố cục Word / Excel
            </span>
          </div>
        </div>
        <div className="row gap-12">
          <SettingsIcon size={20} />
          <div className="col gap-2">
            <strong>Cấu hình linh hoạt</strong>
            <span className="meta">Tech Profiles, AI Models, ngưỡng chấm, tiêu chí đánh giá</span>
          </div>
        </div>
        <div className="row gap-12">
          <FileText size={20} />
          <div className="col gap-2">
            <strong>Báo cáo chi tiết</strong>
            <span className="meta">Xuất Excel, CSV, PDF với điểm từng tiêu chí, nhận xét, thống kê</span>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="callout info">
        <div className="col gap-4">
          <span>💡 Ứng dụng hoạt động offline, dữ liệu được lưu trữ trên máy tính của bạn.</span>
          <span>Hỗ trợ đa ngôn ngữ (Tiếng Việt, English) và có thể mở rộng thêm ngôn ngữ khác.</span>
        </div>
      </div>
    </div>
  )
}

function NamingConventions(): JSX.Element {
  const t = useT()
  return (
    <div className="card col gap-16" style={{ maxWidth: 900 }}>
      <div className="card-title">Quy tắc đặt tên file bài nộp</div>
      <div className="callout warning">
        <div className="col gap-4">
          <strong>⚠️ QUAN TRỌNG: Đặt tên file đúng cách là yêu cầu bắt buộc!</strong>
          <span>File bài nộp PHẢI tuân theo định dạng: <code className="mono">HọTên_MSSV.zip</code></span>
          <span>Ví dụ: <code className="mono">NguyenVanA_20230001.zip</code>, <code className="mono">TranThiB_23546.zip</code></span>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">1. Định dạng cơ bản</div>
      <div className="col gap-8">
        <div className="row gap-12">
          <span className="meta">Định dạng:</span>
          <code className="mono">{`<HọTên>_<MSSV>.zip`}</code>
        </div>
        <div className="col gap-4">
          <strong>Cấu trúc:</strong>
          <ul className="col gap-2 meta">
            <li><code className="mono">{`<HọTên>`}</code> - Tên sinh viên, viết liền không dấu (hoặc có dấu)</li>
            <li><code className="mono">{`<MSSV>`}</code> - Mã số sinh viên</li>
            <li><code className="mono">{`.zip`}</code> - File nén chuẩn ZIP</li>
          </ul>
        </div>
        <div className="col gap-4">
          <strong>Ví dụ đúng:</strong>
          <div className="row gap-8 mono selectable">
            <span>HoDienCong_23546.zip</span>
            <span>NguyenVanA_20230001.zip</span>
            <span>TranThiB_123456.zip</span>
          </div>
        </div>
        <div className="col gap-4">
          <strong>Ví dụ sai:</strong>
          <div className="row gap-8 mono">
            <span className="error">23546.zip</span>
            <span className="error">NguyenVanA.zip</span>
            <span className="error">BaiTap1_NguyenVanA_23546.7z</span>
            <span className="error">Nguyen Van A_23546.zip</span>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">2. Mẫu MSSV (Student ID Pattern)</div>
      <div className="col gap-8">
        <div className="meta">
          Bạn có thể cấu hình mẫu MSSV trong Cài đặt → Chung → "Mẫu MSSV (regex)"
        </div>
        <div className="col gap-4">
          <strong>Mặc định:</strong>
          <code className="mono">{'^\\d{4,12}$'}</code>
          <span className="meta">(4 đến 12 chữ số)</span>
        </div>
        <div className="col gap-4">
          <strong>Ví dụ mẫu MSSV:</strong>
          <div className="row gap-8 mono">
            <div className="col gap-2">
              <code>{'^\\d{4,12}$'}</code>
              <span className="meta">4-12 chữ số</span>
            </div>
            <div className="col gap-2">
              <code>^[A-Z]\d{8}$</code>
              <span className="meta">1 chữ cái + 8 chữ số</span>
            </div>
            <div className="col gap-2">
              <code>^\d{7}$</code>
              <span className="meta">Chính xác 7 chữ số</span>
            </div>
          </div>
        </div>
        <div className="callout info">
          <div className="col gap-4">
            <strong>Lưu ý:</strong>
            <span>Nếu tên file không khớp với mẫu MSSV, ứng dụng sẽ yêu cầu bạn gán MSSV thủ công.</span>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">3. Định dạng file nén</div>
      <div className="col gap-8">
        <div className="row gap-12">
          <strong>✅ Được hỗ trợ:</strong>
          <div className="row wrap gap-4 mono">
            <span>.zip</span>
            <span>.rar</span>
            <span>.7z</span>
            <span>.tar</span>
            <span>.tar.gz / .tgz</span>
            <span>.tar.bz2</span>
            <span>.tar.xz</span>
            <span>.iso</span>
            <span>.dmg</span>
            <span>.arj</span>
            <span>.cab</span>
            <span>.lzh</span>
          </div>
        </div>
        <div className="row gap-12">
          <strong className="error">❌ Không hỗ trợ:</strong>
          <div className="row gap-4 mono error">
            <span>file nén có mật khẩu</span>
            <span>.arc / .pak kiểu cũ (DOS)</span>
          </div>
        </div>
        <div className="callout info">
          <span>
            .zip được đọc trực tiếp; các định dạng khác đọc bằng 7-Zip đóng gói sẵn trong app. File .arc / .pak chỉ mở được
            nếu bên trong thực chất là zip / 7z / rar — nếu không, hãy yêu cầu sinh viên nén lại thành .zip.
          </span>
        </div>
        <div className="callout info">
          <span>
            Assignment loại <b>Chấm báo cáo</b> nhận thêm file Word / Excel / PowerPoint nộp thẳng (.doc, .docx, .xls, .xlsx, .ppt, .pptx, .rtf), ví dụ{' '}
            <code>HoDienCong_23546.docx</code> (hoặc file nén chứa các file đó). .doc và .docx đọc như nhau (app nhận diện theo nội dung file, không theo đuôi). File .pdf
            chưa đọc được — yêu cầu sinh viên nộp file Office. Assignment chấm code bỏ qua các file này ở folder bài nộp.
          </span>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">4. Cấu trúc thư mục bên trong file ZIP</div>
      <div className="col gap-8">
        <div className="meta">
          File ZIP nên chứa trực tiếp mã nguồn của sinh viên, không nên có thư mục con không cần thiết.
        </div>
        <div className="col gap-4">
          <strong>Cấu trúc khuyến nghị:</strong>
          <pre className="code-block">
HoDienCong_23546.zip
├── Main.java
├── Student.java
└── README.md
          </pre>
        </div>
        <div className="col gap-4">
          <strong>Cấu trúc cho Android:</strong>
          <pre className="code-block">
NguyenVanA_20230001.zip
├── AndroidManifest.xml
├── app/
│   └── src/
│       └── main/
│           ├── java/
│           └── res/
└── build.gradle
          </pre>
        </div>
        <div className="col gap-4">
          <strong>Cấu trúc cho Next.js:</strong>
          <pre className="code-block">
TranThiB_123456.zip
├── package.json
├── pages/
│   └── index.js
├── components/
└── styles/
          </pre>
        </div>
        <div className="callout warning">
          <div className="col gap-4">
            <strong>⚠️ LƯU Ý:</strong>
            <span>Không nén thư mục cha (ví dụ: <code className="mono">BaiTap1/</code>) vào trong ZIP.</span>
            <span>Hãy chắc chắn rằng file mã nguồn ở ngay trong gốc của file ZIP.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Workflow(): JSX.Element {
  const t = useT()
  return (
    <div className="card col gap-16" style={{ maxWidth: 900 }}>
      <div className="card-title">Quy trình chấm bài cơ bản</div>
      <div className="col gap-12">
        <div className="row gap-12">
          <span className="step-badge">1</span>
          <div className="col gap-2">
            <strong>Cấu hình ban đầu</strong>
            <div className="meta">
              • Cài đặt AI Model (Local hoặc Cloud)
              <br />
              • Tạo Tech Profiles cho môn học
              <br />
              • Cấu hình thiết bị (Android SDK, JDK nếu cần)
            </div>
          </div>
        </div>
        <div className="row gap-12">
          <span className="step-badge">2</span>
          <div className="col gap-2">
            <strong>Tạo Assignment</strong>
            <div className="meta">
              • Đặt tên assignment, chọn Tech Profile
              <br />
              • Chọn thư mục chứa bài nộp
              <br />
              • Cấu hình Rubric (tiêu chí chấm)
              <br />
              • Thêm test cases (nếu có)
            </div>
          </div>
        </div>
        <div className="row gap-12">
          <span className="step-badge">3</span>
          <div className="col gap-2">
            <strong>Quét bài nộp</strong>
            <div className="meta">
              • Ứng dụng tự động quét thư mục bài nộp
              <br />
              • Nhận diện sinh viên dựa trên tên file
              <br />
              • Gán MSSV tự động (nếu tên file đúng định dạng)
            </div>
          </div>
        </div>
        <div className="row gap-12">
          <span className="step-badge">4</span>
          <div className="col gap-2">
            <strong>Bắt đầu chấm</strong>
            <div className="meta">
              • Nhấn "Bắt đầu chấm" hoặc dùng phím tắt <span className="kbd">F5</span>
              <br />
              • Ứng dụng sẽ tự động:
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Giải nén và phân tích mã nguồn
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Biên dịch code
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Chạy test cases
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Phân tích tĩnh (Static Analysis)
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Kiểm tra đạo code (Similarity)
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;- Phát hiện AI-generated code
            </div>
          </div>
        </div>
        <div className="row gap-12">
          <span className="step-badge">5</span>
          <div className="col gap-2">
            <strong>Xem và sửa kết quả</strong>
            <div className="meta">
              • Xem kết quả chấm trong "Hàng đợi chấm" và "Code Review"
              <br />
              • Sửa điểm thủ công nếu cần
              <br />
              • Duyệt kết quả (<span className="kbd">Ctrl+Enter</span>)
            </div>
          </div>
        </div>
        <div className="row gap-12">
          <span className="step-badge">6</span>
          <div className="col gap-2">
            <strong>Xuất báo cáo</strong>
            <div className="meta">
              • Xuất Excel/CSV cho bảng điểm cả lớp
              <br />
              • Xuất PDF nhận xét cho từng sinh viên
              <br />
              • Sử dụng phím tắt <span className="kbd">Ctrl+E</span> để mở trang xuất báo cáo
            </div>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">Phím tắt hữu ích</div>
      <div className="form-grid">
        <div className="row gap-8">
          <span className="kbd">Ctrl+O</span>
          <span className="grow">Chọn folder bài nộp</span>
        </div>
        <div className="row gap-8">
          <span className="kbd">F5</span>
          <span className="grow">Chấm lại</span>
        </div>
        <div className="row gap-8">
          <span className="kbd">Ctrl+Enter</span>
          <span className="grow">Duyệt & sang sinh viên tiếp theo</span>
        </div>
        <div className="row gap-8">
          <span className="kbd">Alt+←/→</span>
          <span className="grow">Sinh viên trước/sau</span>
        </div>
        <div className="row gap-8">
          <span className="kbd">Ctrl+F</span>
          <span className="grow">Tìm trong code</span>
        </div>
        <div className="row gap-8">
          <span className="kbd">Ctrl+E</span>
          <span className="grow">Mở trang xuất báo cáo</span>
        </div>
      </div>
    </div>
  )
}

function Troubleshooting(): JSX.Element {
  const t = useT()
  return (
    <div className="card col gap-16" style={{ maxWidth: 900 }}>
      <div className="card-title">Khắc phục sự cố thường gặp</div>
      <div className="col gap-12">
        <div className="callout error">
          <div className="col gap-4">
            <strong>Vấn đề: Không nhận diện được sinh viên</strong>
            <div className="meta">
              <strong>Nguyên nhân:</strong> Tên file không đúng định dạng
              <br />
              <strong>Giải pháp:</strong>
              <br />
              • Kiểm tra tên file có đúng định dạng <code className="mono">HọTên_MSSV.zip</code>
              <br />
              • Kiểm tra mẫu MSSV trong Cài đặt → Chung
              <br />
              • Nếu cần, gán MSSV thủ công trong trang Assignments
            </div>
          </div>
        </div>
        <div className="callout error">
          <div className="col gap-4">
            <strong>Vấn đề: File nén bị từ chối</strong>
            <div className="meta">
              <strong>Nguyên nhân:</strong>
              <br />
              • Định dạng không đọc được (vd. .arc / .pak kiểu cũ) hoặc máy thiếu 7-Zip
              <br />
              • File nén có mật khẩu
              <br />
              • File nén bị hỏng
              <br />
              • File nén có dung lượng quá lớn
              <br />
              <strong>Giải pháp:</strong>
              <br />
              • Yêu cầu sinh viên nộp lại file .zip đúng định dạng
              <br />
              • Kiểm tra file nén có thể mở được không
              <br />
              • Tăng giới hạn giải nén trong Cài đặt → Chung nếu file quá lớn
            </div>
          </div>
        </div>
        <div className="callout error">
          <div className="col gap-4">
            <strong>Vấn đề: Code không biên dịch được</strong>
            <div className="meta">
              <strong>Nguyên nhân:</strong>
              <br />
              • Thiếu file cần thiết (Main.java, build.gradle, v.v.)
              <br />
              • Lỗi cú pháp
              <br />
              • Cấu hình Tech Profile không đúng
              <br />
              <strong>Giải pháp:</strong>
              <br />
              • Kiểm tra cấu trúc thư mục trong file ZIP
              <br />
              • Kiểm tra Tech Profile đã chọn đúng loại dự án
              <br />
              • Xem log lỗi trong "Kết quả chấm"
            </div>
          </div>
        </div>
        <div className="callout error">
          <div className="col gap-4">
            <strong>Vấn đề: AI không hoạt động</strong>
            <div className="meta">
              <strong>Nguyên nhân:</strong>
              <br />
              • Chưa cài đặt AI Model
              <br />
              • AI Model chưa tải xong
              <br />
              • Cloud AI chưa cấu hình
              <br />
              <strong>Giải pháp:</strong>
              <br />
              • Vào AI Models để cài đặt và tải model
              <br />
              • Kiểm tra trạng thái AI trong thanh trên cùng
              <br />
              • Cấu hình Cloud AI trong Cài đặt → AI Configuration
            </div>
          </div>
        </div>
        <div className="callout error">
          <div className="col gap-4">
            <strong>Vấn đề: Chấm bài chậm</strong>
            <div className="meta">
              <strong>Nguyên nhân:</strong>
              <br />
              • Lớp có nhiều sinh viên
              <br />
              • AI đang phân tích code
              <br />
              • Máy tính có cấu hình thấp
              <br />
              <strong>Giải pháp:</strong>
              <br />
              • Chấm từng nhóm nhỏ sinh viên
              <br />
              • Tắt tính năng so sánh trùng lặp nếu không cần
              <br />
              • Tắt tính năng AI nếu không cần
              <br />
              • Sử dụng Cloud AI để tăng tốc độ
            </div>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="card-title">Liên hệ hỗ trợ</div>
      <div className="meta">
        Nếu gặp sự cố không thể giải quyết, vui lòng:
        <br />
        • Kiểm tra nhật ký ứng dụng trong thư mục <code className="mono">logs/</code>
        <br />
        • Chuẩn bị thông tin: phiên bản app, hệ điều hành, mô tả chi tiết lỗi
        <br />
        • Liên hệ với nhóm phát triển
      </div>
    </div>
  )
}


