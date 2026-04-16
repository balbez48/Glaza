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

export async function getAccessToken() {
    const url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": `Basic ${CREDENTIALS}`,
        "RqUID": crypto.randomUUID(),
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
        console.log('Token: ', data);
        return data.access_token;

    } catch (error) {
        console.error('Error getting access token: ', error);
    }
}

export async function describeImage(base64: String) {
    const token = await getAccessToken();
    const url = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
    };

    const payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    { "type": "text", text: PROMPT },
                    { "type": "image_url", image_url: { url: "data:image/jpeg;base64," + base64 } }
                ],
            }
        ],
        "max_tokens": 500,
    }


    const answer = await fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: headers
    }).then(response => {
        if (response.status === 200 || response.status === 201) {
            return response.json();
        } else {
            throw new Error(String(response.status));
        }
    }).then(data => {
        return data;
    }).catch(error => {
        return "Ошибка: " + error;
    })

    return answer;
}