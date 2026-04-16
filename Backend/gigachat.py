import sys
import os
import io
import requests
import urllib3
from pathlib import Path
from datetime import datetime
from PIL import Image

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


CREDENTIALS = "MDE5ZDBhYjEtYzg3Yy03MmE5LWIzODQtZWYyNjdjMDhkODM3OjE1Njg4NTg1LWY4ZGUtNGY1ZS04NzQ1LWU3OGYyZjM1M2Q0Yw=="
SCOPE = "GIGACHAT_API_PERS"
MODEL = "GigaChat-2-Pro"

PROMPT = """Ты помогаешь слабовидящему человеку понять, что на фотографии.
Опиши изображение чётко и кратко (2–4 предложения).
Начни с самого главного объекта или действия.
Если на изображении есть текст — обязательно прочитай его.
Не используй слова "изображение", "фото", "на картинке" — говори напрямую.
Отвечай только на русском языке."""


def convert_to_jpeg(image_path: str) -> tuple[bytes, str]:
    """Конвертируем любой формат в JPEG в памяти (без сохранения файла)"""
    with Image.open(image_path) as img:
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue(), "image/jpeg"


def get_access_token() -> str:
    url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": f"Basic {CREDENTIALS}",
        "RqUID": "12345678-1234-1234-1234-123456789012",
    }
    response = requests.post(url, headers=headers,
                             data=f"scope={SCOPE}", verify=False)
    response.raise_for_status()
    return response.json()["access_token"]


def upload_image(image_path: str, token: str) -> str:
    """Загружаем изображение — всегда как JPEG"""
    url = "https://gigachat.devices.sberbank.ru/api/v1/files"

    image_bytes, mime_type = convert_to_jpeg(image_path)
    filename = Path(image_path).stem + ".jpg"

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Session-ID": "12345678-1234-1234-1234-123456789012",
    }
    files = {
        "file": (filename, image_bytes, mime_type),
        "purpose": (None, "general"),
    }

    response = requests.post(url, headers=headers, files=files, verify=False)
    if not response.ok:
        print(f"Ошибка загрузки ({response.status_code}): {response.text}")
    response.raise_for_status()
    return response.json()["id"]


def describe_image(image_path: str) -> str:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Файл не найден: {image_path}")

    print("Обработка токена")
    token = get_access_token()

    print("Изображение передается в GigaChat...")
    file_id = upload_image(image_path, token)

    print("Запрос к нейросети")
    url = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": PROMPT,
                "attachments": [file_id]
            }
        ],
        "max_tokens": 500,
    }

    response = requests.post(url, headers=headers, json=payload, verify=False)
    if not response.ok:
        print(f"Ошибка чата ({response.status_code}): {response.text}")
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def save_result(image_path: str, description: str) -> str:
    base = Path(image_path).stem
    folder = Path(image_path).parent
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = folder / f"{base}_описание_{timestamp}.txt"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Файл: {image_path}\n")
        f.write(f"Модель: {MODEL} (GigaChat)\n")
        f.write(f"Дата: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}\n")
        f.write("-" * 40 + "\n")
        f.write(description)

    return str(output_path)


def main():
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        image_path = input("Введите путь к фото: ").strip().strip('"')

    print(f"\nОбрабатываю: {image_path}")

    description = describe_image(image_path)

    print("\n" + "=" * 40)
    print("ОПИСАНИЕ:")
    print("=" * 40)
    print(description)
    print("=" * 40)

    output_file = save_result(image_path, description)
    print(f"\nСохранено в: {output_file}")


if __name__ == "__main__":
    main()