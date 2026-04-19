# Glaza — Expo Go 54 (iPhone через QR)

## 1) Запуск backend

```bash
cd Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Backend поднимется на `http://0.0.0.0:8000`.

## 2) Запуск frontend в Expo Go

```bash
cd Frontend/Glaza
npm install
npm run start:go
```

Откроется Metro с QR-кодом.

## 3) Запуск на iPhone

1. Установите **Expo Go** на iPhone (версия SDK 54 совместима).
2. Убедитесь, что iPhone и ваш ПК в одной Wi-Fi сети.
3. Сканируйте QR-код камерой iPhone (или сканером внутри Expo Go).
4. Откройте проект в Expo Go.

## Если QR не подключается

Запустите tunnel режим:

```bash
cd Frontend/Glaza
npm run start:tunnel
```

## Если приложение на iPhone не достаёт backend

Создайте `Frontend/Glaza/.env` и укажите LAN IP вашего ПК:

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP_ВАШЕГО_ПК>:8000/api
```

Пример: `http://192.168.0.16:8000/api`
