import React, { useEffect, useRef } from 'react';

function App() {
  const videoRef = useRef(null);

  useEffect(() => {
    // 1. Hàm chào mừng bằng giọng nói
    const speak = (text) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      window.speechSynthesis.speak(utterance);
    };

    // 2. Hàm mở Camera sau
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        speak("Ứng dụng V Vision đã sẵn sàng. Đang mở camera.");
      } catch (err) {
        console.error("Lỗi camera: ", err);
        speak("Không thể mở camera. Vui lòng kiểm tra quyền truy cập.");
      }
    };

    startCamera();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative' }}>
      {/* Luồng Camera */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Giao diện hướng dẫn cho người khiếm thị (Nút bấm lớn) */}
      <div style={{ 
        position: 'absolute', 
        bottom: '50px', 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'center' 
      }}>
        <button 
          onClick={() => {
            const utterance = new SpeechSynthesisUtterance("Đang nhận diện, vui lòng giữ chắc điện thoại");
            utterance.lang = 'vi-VN';
            window.speechSynthesis.speak(utterance);
          }}
          style={{
            padding: '20px 40px',
            fontSize: '20px',
            borderRadius: '50px',
            border: 'none',
            backgroundColor: '#2ecc71',
            color: 'white',
            fontWeight: 'bold',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}
        >
          NHẬN DIỆN NGAY
        </button>
      </div>
    </div>
  );
}

export default App;