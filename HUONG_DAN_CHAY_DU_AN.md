# Hướng Dẫn Khởi Chạy Dự Án SmartVision

Dự án SmartVision gồm 2 thành phần chính: **AI Server (Backend)** xử lý hình ảnh & giọng nói, và **Mobile App (Frontend)** dành cho người dùng chụp ảnh.

Để hệ thống hoạt động trơn tru, bạn cần khởi chạy Backend trước rồi mới chạy Mobile App. Điện thoại và máy tính **bắt buộc phải dùng chung một mạng WiFi**.

---

## Phần 1: Khởi Chạy Khối Trí Tuệ Nhân Tạo (AI Server)
Khối này chịu trách nhiệm nhận ảnh từ điện thoại, phân tích hình ảnh bằng AI (Florence-2), dịch sang tiếng Việt (Marian-MT) và tạo giọng nói MP3 (Google TTS).

**Các bước chạy:**
1. Mở Terminal (Command Prompt / Git Bash / PowerShell) và trỏ vào thư mục `SmartVision_Server`.
2. Kích hoạt môi trường lập trình ảo (đã cài sẵn các gói AI):
   - Chạy lệnh: `env\Scripts\activate`
   - *(Bạn sẽ thấy chữ `(env)` xuất hiện ở đầu dòng lệnh).*
3. Bật máy chủ AI Server với quyền truy cập mạng cục bộ:
   - Chạy lệnh: `uvicorn server:app --host 0.0.0.0 --port 8000`
   - *(Đợi khoảng 10-30 giây để máy tính load các mô hình AI hạng nặng vào RAM. Khi thấy dòng chữ `Hệ thống AI đã sẵn sàng hoạt động!`, tức là Server đã xong mảng của nó).*

---

## Phần 2: Cấu Hình & Chạy Mobile App (React Native - Expo)
Khối này là giao diện trên điện thoại để người dùng (người khiếm thị) chụp ảnh và nghe kết quả.

**Các bước cấu hình (Rất quan trọng):**
1. Lấy địa chỉ IP mạng WiFi của máy tính bạn (IPv4 Address). Bạn có thể mở CMD và gõ lệnh `ipconfig` để lấy dãy số này (thường có dạng `192.168.1.x`).
2. Mở file `App.js` trong thư mục `SmartVisionMobile`. 
3. Tìm đến dòng số 10 chứa biến `BACKEND_URL` và thay IP hiện tại bằng IP máy tính của bạn:
   ```javascript
   const BACKEND_URL = "http://ĐIỀN-IP-CỦA-BẠN-VÀO-ĐÂY:8000/analyze";
   ```
4. Lưu file `App.js` lại.

**Các bước khởi chạy:**
1. Mở thêm 1 cửa sổ Terminal mới, trỏ vào thư mục `SmartVisionMobile`.
2. Khởi động hệ thống đóng gói ứng dụng (Metro bundler):
   - Chạy lệnh: `npx expo start -c`
3. Một mã QR Code sẽ hiện ra trên màn hình Terminal.
   - Nếu bạn dùng **Android**: Mở app **Expo Go** trên điện thoại, bấm "Scan QR code" và quét mã này.
   - Nếu bạn dùng **iPhone (iOS)**: Mở ứng dụng **Camera** mặc định của iPhone, quét mã và bấm vào link Expo Go hiện lên.

---

## Phần 3: Cách Kiểm Tra Lỗi Lặt Vặt (Troubleshooting)

**1. Sập lỗi `Network request failed` (Mất mạng):**
- Nguyên nhân 99% là do Tường Lửa (Firewall) trên Window đang chặn cổng `8000`. 
- **Cách sửa:** Vào thanh tìm kiếm Windows gõ *Windows Defender Firewall* -> Chọn *Turn Windows Defender Firewall on or off* -> Chọn **Turn Off** cho cả hai mục Private và Public (hoặc tự thiết lập Rules mở cổng 8000).
- Hoặc kiểm tra lại xem IP điền trong `App.js` đã chuẩn chưa. Cấm dùng `localhost` trong App.js nhé!

**2. Lỗi `ModuleNotFoundError` ở Server:**
- Nghĩa là bạn quên chưa chạy lệnh `env\Scripts\activate` trước khi gõ `uvicorn`.

**3. Test xem Server có đang nhận lệnh không?**
- Trong lúc App Mobile đang phân tích, bạn có thể nhìn qua Terminal của AI Server. Nếu nó hiện dòng log: *"🚀 [SERVER] Đã nhận được yêu cầu phân tích ảnh..."* thì chúc mừng, điện thoại và máy tính đã thông nhau!
