import io
import os
import uuid
import requests
import urllib3
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Отключаем предупреждения о проверке SSL-сертификатов Сбера
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = FastAPI()

# Разрешаем CORS, чтобы твое Expo-приложение могло слать запросы напрямую
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Берем секретный токен Сбера из переменных окружения облака
GIGACHAT_AUTH_KEY = os.getenv("GIGACHAT_AUTH_KEY")

@app.post("/scene")
async def describe_scene(file: UploadFile = File(...)):
    try:
        print("--- МИКРОСЕРВИС СБЕРА: Получен запрос на описание обстановки ---")
        if not GIGACHAT_AUTH_KEY:
            raise Exception("Ошибка конфигурации: GIGACHAT_AUTH_KEY не задан в облаке Cloud.ru")
            
        # Читаем байты файла напрямую из буфера памяти (ускоряет работу)
        image_bytes = file.file.read()

        # Шаг 1: Получаем токен доступа (Bearer token) от Сбера
        auth_url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
        auth_headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": f"Basic {GIGACHAT_AUTH_KEY}",
            "RqUID": str(uuid.uuid4()) # Уникальный ID запроса
        }
        
        # verify=False нужен, так как у Сбера свои внутренние сертификаты, которые Python без костылей не знает
        auth_response = requests.post(
            auth_url, 
            headers=auth_headers, 
            data="scope=GIGACHAT_API_PERS", 
            verify=False, 
            timeout=15
        )
        if not auth_response.ok:
            raise Exception(f"Ошибка авторизации в Сбере: {auth_response.status_code} - {auth_response.text}")
        token = auth_response.json()["access_token"]

        # Шаг 2: Оптимизируем размер фото, чтобы оно улетало за миллисекунды
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img.thumbnail((800, 800))
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=80)
            file_data = buffer.getvalue()
        except Exception:
            file_data = image_bytes

        # Шаг 3: Загружаем пожатую картинку во временное хранилище Сбера
        upload_url = "https://gigachat.devices.sberbank.ru/api/v1/files"
        upload_headers = {
            "Authorization": f"Bearer {token}",
            "X-Session-ID": str(uuid.uuid4())
        }
        files = {
            "file": ("photo.jpg", file_data, "image/jpeg"),
            "purpose": (None, "general"),
        }
        upload_response = requests.post(upload_url, headers=upload_headers, files=files, verify=False, timeout=20)
        if not upload_response.ok:
            raise Exception(f"Ошибка сохранения фото в Сбере: {upload_response.text}")
        file_id = upload_response.json()["id"]

        # Шаг 4: Отправляем промпт и прикрепленный файл в GigaChat Pro
        chat_url = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
        chat_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        prompt_text = (
            "Ты помогаешь слабовидящему человеку понять, что на фотографии. "
            "Опиши изображение чётко и кратко (2–4 sentences). "
            "Начни с самого главного объекта или действия. "
            "Не используй слова 'изображение', 'фото', 'на картинке' — говори напрямую. "
            "Отвечай только на русском языке."
        )

        chat_payload = {
            "model": "GigaChat-2-Pro",
            "messages": [
                {
                    "role": "user", 
                    "content": prompt_text, 
                    "attachments": [file_id] # Передаем ID загруженного ранее файла
                }
            ],
            "max_tokens": 400,
        }
        
        chat_response = requests.post(chat_url, headers=chat_headers, json=chat_payload, verify=False, timeout=20)
        if not chat_response.ok:
            raise Exception(f"Ошибка нейросети GigaChat: {chat_response.text}")
            
        description = chat_response.json()["choices"][0]["message"]["content"].strip()
        return {"success": True, "description": description}

    except Exception as e:
        import traceback
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e), "details": traceback.format_exc()}
        )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)