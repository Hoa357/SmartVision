import os
# Tu dong them thu muc hien tai vao PATH de tim ffmpeg.exe
os.environ["PATH"] += os.pathsep + os.path.dirname(os.path.abspath(__file__))
# Ngăn lỗi xung đột thư viện giữa Torch và Paddle (Segmentation Fault)
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["OMP_NUM_THREADS"] = "1"

from dotenv import load_dotenv
import subprocess
import sys
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
from transformers import AutoProcessor, AutoModelForCausalLM, MarianMTModel, MarianTokenizer
from PIL import Image
import io
import torch
import base64
import requests
import tempfile
import whisper
from gtts import gTTS

# --- TUYỆT CHIÊU HACK BỎ QUA LỖI FLASH_ATTN TRÊN WINDOWS ---
from unittest.mock import patch
from transformers.dynamic_module_utils import get_imports

def fixed_get_imports(filename: str | os.PathLike) -> list[str]:
    # Lấy danh sách các thư viện model yêu cầu
    imports = get_imports(filename)
    # Nếu có mặt thằng 'flash_attn' thì âm thầm xóa nó đi
    if "flash_attn" in imports:
        imports.remove("flash_attn")
    return imports
# ------------------------------------------------------------

# Tải cấu hình từ file .env
load_dotenv()

app = FastAPI()

print("Dang khoi dong AI Model... Vui long doi chut nhe!")

DEVICE = os.getenv("DEVICE", "cpu")

# Load Whisper model (tai cho toc do nhanh hon)
print("Dang tai Whisper STT model (base)...")
whisper_model = whisper.load_model("base")
print("Whisper da san sang!")

# Bọc lệnh tải Florence-2 bên trong cái "patch" để lách luật
with patch("transformers.dynamic_module_utils.get_imports", fixed_get_imports):
    # 1. Tải mô hình Florence-2 (Chuyên gia nhìn ảnh)
    florence_model_id = os.getenv("MODEL_VLM", "microsoft/Florence-2-base")
    florence_model = AutoModelForCausalLM.from_pretrained(florence_model_id, trust_remote_code=True).to(DEVICE)
    florence_processor = AutoProcessor.from_pretrained(florence_model_id, trust_remote_code=True)

# 2. Tải mô hình Marian-MT (Chuyên gia dịch thuật Anh -> Việt)
marian_model_id = os.getenv("MODEL_TRANSLATION", "Helsinki-NLP/opus-mt-en-vi")
marian_tokenizer = MarianTokenizer.from_pretrained(marian_model_id)
marian_model = MarianMTModel.from_pretrained(marian_model_id).to(DEVICE)

print("He thong AI da san sang hoat dong!")

@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...), mode: str = "caption"):
    print(f"🚀 [SERVER] Yeu cau tu Mobile | File: {file.filename} | Che do: {mode}")
    try:
        # Bước A: Đọc ảnh từ App gửi lên
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        if mode == "ocr":
            print("📝 [SERVER] Su dung Florence-2 cho che do OCR...")
            # Ưu tiên dùng Florence-2 vì nó đã load sẵn trong RAM và rất mạnh
            prompt = "<OCR>"
            inputs = florence_processor(text=prompt, images=image, return_tensors="pt", padding="longest").to(DEVICE)
            generated_ids = florence_model.generate(**inputs, max_new_tokens=1024, num_beams=3)
            generated_text = florence_processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
            parsed_answer = florence_processor.post_process_generation(generated_text, task="<OCR>", image_size=(image.width, image.height))
            
            vietnamese_text = parsed_answer.get("<OCR>", "").strip()
            
            # Nếu Florence-2 không tìm thấy gì, mới thử dùng PaddleOCR (Subprocess)
            if not vietnamese_text:
                print("⚠️ [SERVER] Florence-2 khong tim thay chu, dang thu PaddleOCR...")
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    tmp.write(contents)
                    tmp_path = tmp.name
                    
                try:
                    proc = subprocess.run(
                        [sys.executable, "ocr_logic.py", tmp_path], 
                        capture_output=True, text=True, encoding='utf-8',
                        cwd=os.path.dirname(os.path.abspath(__file__))
                    )
                    vietnamese_text = proc.stdout.strip()
                    if not vietnamese_text:
                        print(f"❌ Subprocess stderr: {proc.stderr}")
                        vietnamese_text = "Không tìm thấy văn bản nào trong ảnh."
                except Exception as e:
                    print(f"❌ Loi subprocess OCR: {e}")
                    vietnamese_text = "Lỗi hệ thống khi đọc văn bản."
                finally:
                    if os.path.exists(tmp_path): os.unlink(tmp_path)
            
            english_caption = "OCR mode: " + vietnamese_text[:50]
        else:
            print("📸 [SERVER] Bat dau dua vao AI Florence-2 (Che do Capion)...")
            # Bước B: Florence-2 sinh câu mô tả tiếng Anh
            prompt = "<CAPTION>"
            try:
                inputs = florence_processor(text=prompt, images=image, return_tensors="pt", padding="longest").to(DEVICE)
            except Exception as e:
                print("❌ LOI O BUOC FLORENCE PROCESSOR!")
                import traceback; traceback.print_exc()
                return {"status": "error", "message": "Florence Processor error: " + str(e)}

            generated_ids = florence_model.generate(
                **inputs,
                max_new_tokens=1024,
                num_beams=3
            )
            
            generated_text = florence_processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
            parsed_answer = florence_processor.post_process_generation(generated_text, task="<CAPTION>", image_size=(image.width, image.height))
            english_caption = parsed_answer["<CAPTION>"]

            print(f"📝 Kết quả tiếng Anh: {english_caption}")

            # Bước C: Marian-MT dịch sang tiếng Việt
            try:
                # Nếu english_caption vô tình là List, ta lấy phần tử đầu tiên
                if isinstance(english_caption, list) and len(english_caption) > 0:
                    english_caption = english_caption[0]
                
                tokenizer_out = marian_tokenizer(text=english_caption, return_tensors="pt", padding=True).to(DEVICE)
                translated = marian_model.generate(
                    **tokenizer_out, 
                    max_new_tokens=100,
                    no_repeat_ngram_size=2,
                    num_beams=3
                )
                vietnamese_text = marian_tokenizer.batch_decode(translated, skip_special_tokens=True)[0]
            except Exception as e:
                print("❌ LOI O BUOC DICH THUAT!")
                vietnamese_text = english_caption # Fallback neu ko dich dc
                import traceback; traceback.print_exc()

        print(f"Da nhan dien: {vietnamese_text}")

        # Buoc D: Dung gTTS chuyen Tieng Viet thanh Giong noi (MP3 Base64)
        print("Dang tao am thanh bang Google TTS...")
        tts = gTTS(text=vietnamese_text, lang='vi', slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        audio_base64 = base64.b64encode(fp.read()).decode('utf-8')

        # Tra ket qua ve cho dien thoai
        return {
            "status": "success",
            "english": english_caption,
            "vietnamese": vietnamese_text,
            "audio_base64": audio_base64
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"Loi he thong: {e}")
        return {"status": "error", "message": str(e)}


# ============================================================
# VOICE COMMAND PIPELINE (OpenAI Whisper - Local STT)
# ============================================================
COMMAND_MAP = {
    # Khong dau (fallback)
    "mo ta canh vat": "describe_scene",
    "mo ta": "describe_scene",
    "canh vat": "describe_scene",
    "nhan dien tien": "recognize_money",
    "tien": "recognize_money",
    "doc van ban": "read_text",
    "van ban": "read_text",
    "tim do vat": "find_object",
    "do vat": "find_object",
    "san pham": "recognize_product",
    "hang hoa": "recognize_product",
    "tranh vat can": "avoid_obstacle",
    "vat can": "avoid_obstacle",
    # Unicode Tieng Viet co dau
    "m\u00f4 t\u1ea3 c\u1ea3nh v\u1eadt": "describe_scene",
    "m\u00f4 t\u1ea3": "describe_scene",
    "c\u1ea3nh v\u1eadt": "describe_scene",
    "nh\u1eadn di\u1ec7n ti\u1ec1n": "recognize_money",
    "ti\u1ec1n": "recognize_money",
    "\u0111\u1ecdc v\u0103n b\u1ea3n": "read_text",
    "v\u0103n b\u1ea3n": "read_text",
    "t\u00ecm \u0111\u1ed3 v\u1eadt": "find_object",
    "\u0111\u1ed3 v\u1eadt": "find_object",
    "s\u1ea3n ph\u1ea9m": "recognize_product",
    "h\u00e0ng h\u00f3a": "recognize_product",
    "tr\u00e1nh v\u1eadt c\u1ea3n": "avoid_obstacle",
    "v\u1eadt c\u1ea3n": "avoid_obstacle",
}

@app.post("/voice-command")
async def voice_command(file: UploadFile = File(...)):
    print(f"[SERVER] Nhan file am thanh: {file.filename}")
    try:
        audio_bytes = await file.read()

        # Luu file am thanh tam thoi de Whisper doc
        with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # Dung Whisper chuyen giong noi thanh van ban
        print("[Whisper] Dang phan tich giong noi...")
        try:
            result = whisper_model.transcribe(tmp_path, language="vi", fp16=False)
            transcript = result["text"].lower().strip()
        except Exception as e:
            if os.path.exists(tmp_path): os.unlink(tmp_path)
            if "ffmpeg" in str(e).lower() or "[WinError 2]" in str(e):
                return {"status": "error", "message": "May chu chua cai FFmpeg."}
            raise e

        # Xoa file tam thoi
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

        print(f"[Whisper] Da hieu: '{transcript}'")

        if not transcript or transcript in ["", " ", "."]:
            return {"status": "no_speech", "message": "Khong nghe ro, vui long noi lai"}

        # Phan tich lenh
        command = None
        for keyword, cmd in COMMAND_MAP.items():
            if keyword in transcript:
                command = cmd
                break

        if not command:
            return {"status": "unknown_command", "transcript": transcript,
                    "message": f"Khong hieu lenh: {transcript}"}

        return {"status": "success", "command": command, "transcript": transcript}

    except Exception as e:
        import traceback; traceback.print_exc()
        return {"status": "error", "message": str(e)}

@app.get("/tts")
def tts_endpoint(text: str):
    try:
        tts = gTTS(text=text, lang='vi', slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return StreamingResponse(fp, media_type="audio/mpeg")
    except Exception as e:
        return {"status": "error", "message": str(e)}