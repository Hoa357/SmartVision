import os
import cv2
import numpy as np
from PIL import Image

# 1. LOAD PADDLE FIRST (Tránh lỗi Segmentation Fault với Torch)
from paddleocr import PaddleOCR
ocr_det = PaddleOCR(lang='vi')

# 2. LOAD TORCH SECOND
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

# Khoi tao TrOCR cho viec Recognition (Doc chu tu vung da tim)
device = "cuda" if torch.cuda.is_available() else "cpu"
processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-printed")
model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-printed").to(device)

def perform_ocr(image_path):
    """
    Quy trinh:
    1. PaddleOCR tim cac o vuong chua chu (Detection)
    2. Cat cac o vuong do ra
    3. Dung TrOCR de doc noi dung tung o (Recognition)
    4. Ghep lai thanh van ban hoan chinh
    """
    img = cv2.imread(image_path)
    if img is None:
        return "Loi: Khong the doc anh."

    # Buoc 1: Detection bang PaddleOCR
    result = ocr_det.ocr(image_path, rec=False) # Chi lay Detection (rec=False)
    
    if not result or not result[0]:
        return "Khong tim thay van ban nao."

    final_text = []
    
    # Buoc 2 & 3: Cat anh va doc bang TrOCR
    # result[0] chua danh sach cac toa do [ [x1,y1], [x2,y2], [x3,y3], [x4,y4] ]
    boxes = result[0]
    
    # Sap xep các box tu tren xuong duoi, trai sang phai
    boxes.sort(key=lambda x: (x[0][1], x[0][0]))

    for box in boxes:
        # Lay toa do cat
        pts = np.array(box, dtype=np.int32)
        x, y, w, h = cv2.boundingRect(pts)
        
        # Crop vung chu (co padding mot chut de TrOCR doc tot hon)
        padding = 2
        crop_img = img[max(0, y-padding):min(img.shape[0], y+h+padding), 
                       max(0, x-padding):min(img.shape[1], x+w+padding)]
        
        if crop_img.size == 0:
            continue
            
        # Chuyen sang PIL Image cho TrOCR
        pil_img = Image.fromarray(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB))
        
        # Doc chu bang TrOCR
        pixel_values = processor(images=pil_img, return_tensors="pt").pixel_values.to(device)
        generated_ids = model.generate(pixel_values)
        generated_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        if generated_text.strip():
            final_text.append(generated_text)

    return " ".join(final_text)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        # Reconfigure stdout to handle UTF-8 printing on Windows
        if sys.platform == "win32":
            import io
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
            
        text = perform_ocr(sys.argv[1])
        print(text)
