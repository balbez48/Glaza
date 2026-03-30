import { RefObject } from 'react';
import { CameraView } from 'expo-camera';

const CREDENTIALS = "MDE5ZDBhYjEtYzg3Yy03MmE5LWIzODQtZWYyNjdjMDhkODM3OjE1Njg4NTg1LWY4ZGUtNGY1ZS04NzQ1LWU3OGYyZjM1M2Q0Yw==";
const SCOPE = "GIGACHAT_API_PERS";
const MODEL = "GigaChat-2-Pro";

const PROMPT = `Ты помогаешь слабовидящему человеку понять, что на фотографии.
Опиши изображение чётко и кратко (2–4 предложения).
Начни с самого главного объекта или действия.
Если на изображении есть текст — обязательно прочитай его.
Не используй слова "изображение", "фото", "на картинке" — говори напрямую.
Отвечай только на русском языке.`;

async function getAccessToken() {
    const url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": `Basic ${CREDENTIALS}`,
        "RqUID": "12345678-1234-1234-1234-123456789012",
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: `scope=${SCOPE}`
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        };

        const data = await response.json();
        return data.access_token;

    } catch (error) {
        console.error('Error getting access token: ', error);
    }
}

async function describeImage(cameraRef: RefObject<CameraView>) {
    const token = getAccessToken();
    const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
    });
    const base64 = photo.base64;
}