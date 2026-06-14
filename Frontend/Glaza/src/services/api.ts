const YANDEX_URL = 'https://bba09npdmtvahmuc1h9f.containers.yandexcloud.net';
const SBER_URL = 'https://glaza-sber-backend.containerapps.ru';

export async function sendPhotoToBack(photo: any, mode: 'scene' | 'text' | 'money') {
    const data = new FormData();

    // Передаем mode для Яндекса (и для текста, и для денег)
    if (mode === 'text' || mode === 'money') {
        data.append('mode', mode);
    }

    data.append('file', {
        uri: photo.uri,
        name: 'photo.jpg',
        type: 'image/jpeg'
    } as any);

    const targetUrl = (mode === 'text' || mode === 'money')
        ? `${YANDEX_URL}/describe`
        : `${SBER_URL}/scene`;

    try {
        console.log(`[API] Отправка фото. Режим: ${mode}, URL: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: "POST",
            body: data,
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error || `Ошибка сервера: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Ошибка бэкенда (${mode}):`, error);
        throw error;
    }
}