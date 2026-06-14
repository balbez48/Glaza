import io
import os
import base64
import requests
import urllib3
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
import uvicorn

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = FastAPI()

FOLDER_ID = os.getenv("FOLDER_ID")
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")


def post_process_with_yandex_gpt(raw_text: str, mode: str) -> str:
    """Текстовый YandexGPT, который редактирует 'грязный' OCR-текст и адаптирует его под выбранный режим"""
    if not raw_text or len(raw_text.strip()) < 3:
        return ""
        
    url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Api-Key {YANDEX_API_KEY}"
    }

    # Настраиваем жесткие системные промпты под ТЕКСТ и ДЕНЬГИ
    if mode == "text":
        system_prompt = (
            "Ты — умный редактор интерфейса для слепых людей. Твоя задача — взять сырой, "
            "плохо распознанный OCR-текст с картинки и превратить его в связный, легко читаемый текст. "
            "Исправь опечатки, восстанови разбитые слова, расставь знаки препинания. "
            "Выведи ТОЛЬКО исправленный текст, без твоих комментариев и лишних слов."
        )
    elif mode == "money":
        system_prompt = (
            "Ты — ассистент для незрячих и пожилых людей. Тебе дают сырой текст, считанный OCR-сканером с денежной купюры. "
            "Твоя задача — проанализировать эти обрывки текста, цифры, надписи и определить номинал и валюту банкноты "
            "(например: 100 рублей, 500 рублей, 50 рублей, 1000 рублей, 5000 рублей или доллары/евро). "
            "Сформулируй ответ очень кратко и понятно, например: 'Это пятьсот рублей' или 'Перед вами купюра номиналом сто рублей'. "
            "Если из текста абсолютно невозможно понять номинал денег, ответь строго одной фразой: 'Купюра не распознана'."
            "Выводи только готовый ответ, без комментариев."
        )
    else:  # fallback на случай, если прилетит старый режим scene
        system_prompt = (
            "Ты — ассистент для слабовидящих. Тебе дают сырой распознанный текст с объекта. "
            "Сформулируй на основе этих данных краткое, вежливое описание для человека. "
            "Выведи только готовый ответ."
        )

    payload = {
        "modelUri": f"gpt://{FOLDER_ID}/yandexgpt/latest",
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,  # Минимальная температура для максимальной точности без фантазий
            "maxTokens": 150
        },
        "messages": [
            {"role": "system", "text": system_prompt},
            {"role": "user", "text": raw_text}
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.ok:
            res_json = response.json()
            return res_json['result']['alternatives'][0]['message']['text'].strip()
    except Exception as e:
        print(f"Ошибка постобработки YandexGPT: {e}")
    
    return raw_text


def read_text_via_yandex_ocr(image_bytes: bytes) -> str:
    """Быстрое чтение текста через Yandex Vision OCR (RU/EN)"""
    if not YANDEX_API_KEY or not FOLDER_ID:
        raise Exception("Переменные FOLDER_ID или YANDEX_API_KEY не заданы!")
        
    url = "https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze"
    
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.thumbnail((800, 800)) 
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=75)
        compressed_bytes = buffer.getvalue()
    except Exception:
        compressed_bytes = image_bytes

    image_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Api-Key {YANDEX_API_KEY}"
    }
    
    payload = {
        "folderId": FOLDER_ID,
        "analyze_specs": [{
            "content": image_base64,
            "features": [{
                "type": "TEXT_DETECTION",
                "text_detection_config": {"language_codes": ["ru", "en"]}
            }]
        }]
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    if not response.ok:
        raise Exception(f"Ошибка Yandex OCR API: {response.text}")
        
    recognized_blocks = []
    try:
        results = response.json().get('results', [])
        if results and results[0].get('results'):
            pages = results[0]['results'][0].get('textDetection', {}).get('pages', [])
            for page in pages:
                for block in page.get('blocks', []):
                    block_lines = []
                    for line in block.get('lines', []):
                        words = [word.get('text', '') for word in line.get('words', [])]
                        if words:
                            block_lines.append(" ".join(words))
                    if block_lines:
                        block_text = " ".join(block_lines).strip()
                        if len(block_text) > 1:  # Снизили до 1, чтобы одиночные цифры номинала (например, "50") не терялись
                            recognized_blocks.append(block_text)
    except Exception:
        pass
        
    return " ".join(recognized_blocks).strip()


@app.post("/describe")
async def describe(mode: str = Form(...), file: UploadFile = File(...)):
    try:
        print(f"--- НАЖАТА КНОПКА: {mode} (OCR + Редактор YandexGPT) ---")
        image_bytes = file.file.read() 
        
        # Шаг 1: Извлекаем сырой текст (цифры, буквы, знаки)
        raw_text = read_text_via_yandex_ocr(image_bytes)
        
        # Если OCR вообще ничего не нашел на картинке
        if not raw_text:
            if mode == 'money':
                return {"success": True, "description": "Купюра не распознана. Попробуйте изменить освещение или ракурс."}
            return {"success": True, "description": "Текст на фотографии не обнаружен."}

        # Шаг 2: Направляем в YandexGPT со специализированным промптом под Текст или Деньги
        beautiful_text = post_process_with_yandex_gpt(raw_text, mode)
        
        return {"success": True, "description": beautiful_text}
            
    except Exception as e:
        import traceback
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "details": traceback.format_exc()}
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)