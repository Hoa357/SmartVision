# Sổ Tay Tiến Độ Dự Án SmartVision (Work Log)

Tài liệu này lưu trữ tóm tắt các công việc, tính năng và lỗi đã được giải quyết trong quá trình phát triển dự án SmartVision (tổng hợp từ các phiên làm việc trước).

## 1. Thiết lập & Tiêu chuẩn hóa dự án (Project Standards)
- **Thiết lập `.cursorrules`**: Ban hành và áp dụng chặt chẽ các tiêu chuẩn code, guidelines về clean architecture, hướng dẫn optimize và testing cho cả Next.js (Dashboard) và React Native (Mobile App).
- **Tối ưu React Native**: Bổ sung các chỉ dẫn thực hành tốt nhất (best practices) để tối ưu hiệu suất, quản lý FPS, ảo hóa danh sách (FlatList/FlashList) và các chiến lược test/profile lên `.cursorrules`.
- **Cập nhật tài liệu dự án**: Đã viết lại và cải thiện nội dung `project_summary.md` nhằm phản ánh chính xác nhất cấu trúc và các chức năng mới của hệ thống.

## 2. Phát triển Tính năng & Giao diện (UI/UX & Features)
- **Tự động hóa nhận diện & UI**: Triển khai thiết kế giao diện hiện đại (Dark-theme), hỗ trợ render bounding box theo thời gian thực (real-time). Tự động kích hoạt quy trình nhận diện ngay sau khi upload hình ảnh hoặc video.
- **Khắc phục OCR & Ứng dụng LLM**: Thay thế module OCR cũ bằng mô hình Gemini vision, giúp trích xuất và tóm tắt văn bản từ hình ảnh một cách thông minh và chính xác hơn hẳn.
- **Tính năng Đa ngôn ngữ & Cảnh báo (TTS)**: Dịch các nhãn nhận diện AI (labels) sang tiếng Việt. Thiết lập cơ chế ngắt quãng/giới hạn (throttling 30 giây) cho các cảnh báo tự động bằng giọng nói để tránh làm phiền người dùng.

## 3. Tích hợp Mô hình AI (AI Integration)
- **Đồng bộ mô hình YOLOv11**: Nâng cấp môi trường `ultralytics` ở local để tương thích hoàn toàn với YOLOv11. 
- **Tự động tải & Cập nhật**: Cấu hình thành công AI service, cho phép tự động tải các model weights mới nhất từ repository HuggingFace Space cục bộ. Đảm bảo luồng kết nối ổn định xuyên suốt giữa giao diện (frontend) và hệ thống inference ở backend.
- **Sửa lỗi môi trường**: Xử lý triệt để lỗi "No such file or directory" khi kích hoạt virtual environment (Python) qua Git Bash trên Windows, đảm bảo dự án backend khởi tạo thành công.

## 4. Xử lý Lỗi (Bug Fixes & Maintenance)
- **Sửa lỗi Next.js Hydration (Trang Đăng Nhập)**: Đã khắc phục sự cố nghiêm trọng liên quan đến lỗi Hydration mismatch giữa Server-Side Rendering (SSR) HTML và client-DOM. Nguyên nhân do Video component và một tiện ích mở rộng của trình duyệt (`youtube-dubbing-button`) can thiệp. Đã cấu hình và xử lý phần render để chạy on-client (CSR) hiệu quả.

---
*Ghi chú: File này có thể được cập nhật thường xuyên khi bạn hoàn thành thêm các tính năng mới.*
