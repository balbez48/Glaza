import os
import sys
import base64
import logging
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager
from uuid import uuid4

import requests
import urllib3
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Disable warnings for self-signed certs in development only.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def setup_logging() -> logging.Logger:
    log_dir = Path('logs')
    log_dir.mkdir(exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.FileHandler(log_dir / f"app_{datetime.now().strftime('%Y%m%d')}.log", encoding='utf-8'),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return logging.getLogger(__name__)


logger = setup_logging()

CREDENTIALS = os.getenv(
    'GIGACHAT_CREDENTIALS',
    'MDE5ZDBhYjEtYzg3Yy03MmE5LWIzODQtZWYyNjdjMDhkODM3OjE1Njg4NTg1LWY4ZGUtNGY1ZS04NzQ1LWU3OGYyZjM1M2Q0Yw==',
)
SCOPE = os.getenv('GIGACHAT_SCOPE', 'GIGACHAT_API_PERS')
MODEL = os.getenv('GIGACHAT_MODEL', 'GigaChat-2-Pro')
MAX_IMAGE_BYTES = 12 * 1024 * 1024

PROMPT = """РўС‹ РїРѕРјРѕРіР°РµС€СЊ СЃР»Р°Р±РѕРІРёРґСЏС‰РµРјСѓ С‡РµР»РѕРІРµРєСѓ РїРѕРЅСЏС‚СЊ, С‡С‚Рѕ РЅР° С„РѕС‚РѕРіСЂР°С„РёРё.
РћРїРёС€Рё СѓРІРёРґРµРЅРЅРѕРµ С‡С‘С‚РєРѕ Рё РєСЂР°С‚РєРѕ (2-4 РїСЂРµРґР»РѕР¶РµРЅРёСЏ).
РќР°С‡РЅРё СЃ СЃР°РјРѕРіРѕ РіР»Р°РІРЅРѕРіРѕ РѕР±СЉРµРєС‚Р° РёР»Рё РґРµР№СЃС‚РІРёСЏ.
Р•СЃР»Рё РµСЃС‚СЊ С‚РµРєСЃС‚, РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РїСЂРѕС‡РёС‚Р°Р№ РµРіРѕ.
РќРµ РёСЃРїРѕР»СЊР·СѓР№ СЃР»РѕРІР° \"РёР·РѕР±СЂР°Р¶РµРЅРёРµ\", \"С„РѕС‚Рѕ\", \"РЅР° РєР°СЂС‚РёРЅРєРµ\" вЂ” РіРѕРІРѕСЂРё РЅР°РїСЂСЏРјСѓСЋ.
РћС‚РІРµС‡Р°Р№ С‚РѕР»СЊРєРѕ РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ."""


class DescribeRequest(BaseModel):
    image_base64: str
    filename: str = 'image.jpg'


def get_access_token() -> str:
    logger.info('Р—Р°РїСЂРѕСЃ С‚РѕРєРµРЅР° РґРѕСЃС‚СѓРїР°...')

    if not CREDENTIALS:
        raise RuntimeError('РќРµ Р·Р°РґР°РЅ GIGACHAT_CREDENTIALS')

    url = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': f'Basic {CREDENTIALS}',
        'RqUID': str(uuid4()),
    }

    try:
        response = requests.post(url, headers=headers, data=f'scope={SCOPE}', verify=False, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.error('РћС€РёР±РєР° РїСЂРё РїРѕР»СѓС‡РµРЅРёРё С‚РѕРєРµРЅР°: %s', exc, exc_info=True)
        raise

    token = response.json().get('access_token')
    if not token:
        raise RuntimeError('GigaChat РЅРµ РІРµСЂРЅСѓР» access_token')

    logger.info('РўРѕРєРµРЅ СѓСЃРїРµС€РЅРѕ РїРѕР»СѓС‡РµРЅ')
    return token


def upload_image_bytes(image_bytes: bytes, filename: str, token: str) -> str:
    logger.info('Р—Р°РіСЂСѓР·РєР° РёР·РѕР±СЂР°Р¶РµРЅРёСЏ %s (%s Р±Р°Р№С‚)', filename, len(image_bytes))

    url = 'https://gigachat.devices.sberbank.ru/api/v1/files'

    if filename.lower().endswith(('.jpg', '.jpeg')):
        mime_type = 'image/jpeg'
    elif filename.lower().endswith('.png'):
        mime_type = 'image/png'
    else:
        mime_type = 'image/jpeg'
        logger.warning('РќРµРёР·РІРµСЃС‚РЅС‹Р№ С„РѕСЂРјР°С‚ С„Р°Р№Р»Р° %s, РёСЃРїРѕР»СЊР·СѓРµРј %s', filename, mime_type)

    headers = {
        'Authorization': f'Bearer {token}',
        'X-Session-ID': str(uuid4()),
    }
    files = {
        'file': (filename, image_bytes, mime_type),
        'purpose': (None, 'general'),
    }

    try:
        response = requests.post(url, headers=headers, files=files, verify=False, timeout=60)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏ: %s', exc, exc_info=True)
        raise

    file_id = response.json().get('id')
    if not file_id:
        raise RuntimeError('GigaChat РЅРµ РІРµСЂРЅСѓР» file_id РїРѕСЃР»Рµ Р·Р°РіСЂСѓР·РєРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏ')

    logger.info('РР·РѕР±СЂР°Р¶РµРЅРёРµ Р·Р°РіСЂСѓР¶РµРЅРѕ, file_id=%s', file_id)
    return file_id


def describe_image_bytes(image_bytes: bytes, filename: str = 'image.jpg') -> str:
    if not image_bytes:
        raise ValueError('РџСѓСЃС‚РѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ')
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f'РЎР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ С„Р°Р№Р»: {len(image_bytes)} Р±Р°Р№С‚')

    logger.info('РќР°С‡Р°Р»Рѕ РѕР±СЂР°Р±РѕС‚РєРё РёР·РѕР±СЂР°Р¶РµРЅРёСЏ: %s', filename)

    token = get_access_token()
    file_id = upload_image_bytes(image_bytes, filename, token)

    url = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    payload = {
        'model': MODEL,
        'messages': [{'role': 'user', 'content': PROMPT, 'attachments': [file_id]}],
        'max_tokens': 500,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, verify=False, timeout=120)
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.error('РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР° Рє РјРѕРґРµР»Рё: %s', exc, exc_info=True)
        raise

    data = response.json()
    description = data.get('choices', [{}])[0].get('message', {}).get('content')
    if not description:
        raise RuntimeError('GigaChat РІРµСЂРЅСѓР» РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚')

    logger.info('РћС‚РІРµС‚ РѕС‚ РЅРµР№СЂРѕСЃРµС‚Рё РїРѕР»СѓС‡РµРЅ')
    return description.strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('РЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ')
    yield
    logger.info('РЎРµСЂРІРµСЂ РѕСЃС‚Р°РЅРѕРІР»РµРЅ')


app = FastAPI(title='GigaChat Helper API', lifespan=lifespan)


@app.post('/api/describe')
async def describe_endpoint(request: DescribeRequest):
    try:
        logger.info('РџРѕР»СѓС‡РµРЅ Р·Р°РїСЂРѕСЃ РЅР° РѕРїРёСЃР°РЅРёРµ: %s', request.filename)

        base64_str = request.image_base64.strip()
        if not base64_str:
            raise HTTPException(status_code=400, detail='РџСѓСЃС‚РѕРµ РїРѕР»Рµ image_base64')

        if ',' in base64_str:
            base64_str = base64_str.split(',', 1)[1]

        compact_base64 = ''.join(base64_str.split())
        image_bytes = base64.b64decode(compact_base64, validate=True)

        description = describe_image_bytes(image_bytes, request.filename)
        return JSONResponse(content={'success': True, 'description': description})

    except (base64.binascii.Error, ValueError) as exc:
        logger.error('РћС€РёР±РєР° РґРµРєРѕРґРёСЂРѕРІР°РЅРёСЏ base64: %s', exc)
        raise HTTPException(status_code=400, detail='РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ С„РѕСЂРјР°С‚ base64')
    except HTTPException:
        raise
    except Exception as exc:
        logger.error('РќРµРѕР±СЂР°Р±РѕС‚Р°РЅРЅР°СЏ РѕС€РёР±РєР°: %s', exc, exc_info=True)
        raise HTTPException(status_code=500, detail='Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ РѕС€РёР±РєР° СЃРµСЂРІРµСЂР°')


@app.post('/api/describe-upload')
async def describe_upload_endpoint(file: UploadFile = File(...)):
    try:
        logger.info('РџРѕР»СѓС‡РµРЅ С„Р°Р№Р»: %s, С‚РёРї: %s', file.filename, file.content_type)
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail='РџСѓСЃС‚РѕР№ С„Р°Р№Р»')

        description = describe_image_bytes(image_bytes, file.filename or 'image.jpg')
        return {'success': True, 'description': description}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error('РћС€РёР±РєР° РїСЂРё Р·Р°РіСЂСѓР·РєРµ С„Р°Р№Р»Р°: %s', exc, exc_info=True)
        raise HTTPException(status_code=500, detail='Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ РѕС€РёР±РєР° СЃРµСЂРІРµСЂР°')


@app.get('/health')
async def health_check():
    return {'status': 'ok', 'timestamp': datetime.now().isoformat()}


if __name__ == '__main__':
    logger.info('Р—Р°РїСѓСЃРє СЃРµСЂРІРµСЂР° РЅР° http://0.0.0.0:8000')
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)

