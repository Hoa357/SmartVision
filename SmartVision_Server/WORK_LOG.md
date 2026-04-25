# Sổ Tay Tiến Độ - SmartVision Server (Backend / AI Service)

Tài liệu này lưu trữ các công việc, tính năng cốt lõi và các bản vá lỗi (bug fixes) dành riêng cho thành phần **Server/Backend** của dự án SmartVision.

## 1. Thiết Lập API Server (FastAPI)
- **Khởi tạo Server**: Xây dựng thành công máy chủ AI cục bộ (local server) dựa trên framework **FastAPI** kết hợp với Uvicorn.
- **Endpoint `/analyze`**: Xây dựng luồng nhận file hình ảnh (`UploadFile`) từ máy khách (Mobile App / Dashboard), giải quyết dữ liệu thô và tiến hành luân chuyển nội dung qua các mô hình AI.
- **Endpoint `/voice-command`**: Nhận file âm thanh (`.m4a`) từ điện thoại, phân tích giọng nói và trả về tên chức năng cần kích hoạt.
- **Quản lý Cấu hình**: Áp dụng `.env` để dễ dàng điều chỉnh cấu hình phần cứng (Thiết lập `DEVICE` chạy trên CPU hoặc GPU) và linh hoạt cấp quyền đổi `MODEL_ID` mà không cần sửa code cốt lõi.

## 2. Tích Hợp Đa Mô Hình AI (Pipeline)
Hệ thống hiện tại tích hợp **2 Pipeline song song** tại Server:

### 📷 Pipeline 1: Phân Tích Hình Ảnh - mô tả ảnh (Trigger: Chạm màn hình)
**🔄 Luồng hoạt động:**
`Ảnh (Camera)` ➡️ **Florence-2** *(Ảnh → Mô tả Tiếng Anh)* ➡️ **Marian-MT** *(Tiếng Anh → Tiếng Việt)* ➡️ **gTTS** *(Tiếng Việt → Giọng nói MP3 Base64)* ➡️ **Mobile App (`expo-av`)** *(Phát âm thanh)*

- **Nhận diện Bằng VLM (Vision-Language Model)**: Nhúng thành công mô hình **`microsoft/Florence-2-base`**. Xử lý ảnh đầu vào và tự động sinh ra câu mô tả bằng tiếng Anh phân tích chi tiết hình ảnh (Image Captioning).
- **Dịch Thuật Tự Động (NMT)**: Liên kết kết quả đầu ra của VLM vào cấu trúc mô hình máy dịch **`Helsinki-NLP/opus-mt-en-vi`** (Marian-MT) để chuyển ngôn ngữ. Đã tích hợp các biến cấu hình (như `no_repeat_ngram_size`) giúp ngăn chặn triệt để lỗi sinh văn bản lặp vô nghĩa (hallucination).
- **Tổng hợp Giọng Nói (TTS)**: Server dùng **Google Cloud TTS (`gTTS`)** chuyển bản dịch thành file MP3, mã hóa Base64 và gửi về `expo-av` trên điện thoại để phát. Đảm bảo giọng đọc tiếng Việt chuẩn bất kể cài đặt thiết bị.

### 🎤 Pipeline 2: Điều Khiển Giọng Nói - để mở đúng app (Trigger: Nhấn nút Micro)
**🔄 Luồng hoạt động:**
`Giọng nói (Mic)` ➡️ **`expo-av` Recording** *(Thu âm M4A 5 giây)* ➡️ **OpenAI Whisper (local)** *(Giọng nói → Văn bản Tiếng Việt)* ➡️ **Command Parser** *(Nhận diện lệnh)* ➡️ **Mobile App** *(Kích hoạt chức năng tương ứng)*

- **Speech-to-Text bằng OpenAI Whisper**: Thay thế hoàn toàn Google Cloud STT API (có phí) bằng mô hình **`openai-whisper` (model: `small`)** chạy hoàn toàn local trên Server. Không cần API Key, miễn phí vĩnh viễn, hỗ trợ tiếng Việt cực tốt, không phụ thuộc internet.
- **Command Parser**: Bảng ánh xạ từ khóa(`COMMAND_MAP`) nhận diện các lệnh sau từ văn bản đã nhận diện:

| Từ khóa nói | Chức năng kích hoạt |
|---|---|
| "Mô tả cảnh vật" | Chụp ảnh và phân tích AI |
| "Nhận diện tiền" | Nhận diện tờ tiền (đang phát triển) |
| "Đọc văn bản" | OCR đọc văn bản (đang phát triển) |
| "Tìm đồ vật" | Tìm kiếm đồ vật (đang phát triển) |
| "Sản phẩm / Hàng hóa" | Nhận diện sản phẩm (đang phát triển) |
| "Tránh vật cản" | Phát hiện chướng ngại vật (đang phát triển) |

## 3. Khắc Phục Sự Cố (Bug Fixes & Hacks)
- **Khắc phục lỗi OCR không nhận diện được chữ**: Thay thế quy trình OCR cũ (PaddleOCR + TrOCR chạy qua subprocess chậm và lỗi) bằng khả năng OCR tích hợp sẵn của **Florence-2** (`task: <OCR>`). Phương pháp này giúp nhận diện cực nhanh vì model đã nằm sẵn trong RAM, độ chính xác cao và không bị lỗi vỡ ảnh.
- **Tối ưu chất lượng ảnh chụp**: Nâng cao tham số `quality` khi chụp ảnh từ `0.5` lên `1.0` trong Mobile App để đảm bảo văn bản nhỏ vẫn rõ nét khi gửi lên Server.
- **Xử lý lỗi Unicode trên Windows**: Thay thế toàn bộ chuỗi tiếng Việt trong lệnh `print()` tại Server sang dạng không dấu (ASCII) để tránh `UnicodeEncodeError` khi chạy trên CMD/PowerShell của Windows.


### 📄 Pipeline 3: Nhận diện văn bản (OCR) - Đọc chữ viết
- **Mục tiêu**: Trích xuất văn bản từ hình ảnh để hỗ trợ đọc sách, biển báo.
- **Cải tiến**: Đã chuyển sang dùng trực tiếp **Florence-2** (prompt `<OCR>`). Nhận diện tốt hơn bản cũ, tốc độ phản hồi từ ~15 giây giảm xuống còn ~2 giây.

---
*Ghi chú: Mọi tính năng xử lý model lớn, tích hợp model mới hoặc cấu hình endpoint bên cạnh `/analyze` sẽ tiếp tục được cập nhật vào tài liệu này.*
