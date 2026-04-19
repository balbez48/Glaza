import Constants from 'expo-constants';
import { Platform } from 'react-native';

const REQUEST_TIMEOUT_MS = 180000;
const HEALTHCHECK_TIMEOUT_MS = 10000;

function pickHostFromExpoManifest(): string | null {
  const constantsAny = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };

  const hostUri =
    constantsAny.expoConfig?.hostUri ??
    constantsAny.manifest2?.extra?.expoClient?.hostUri ??
    constantsAny.manifest?.debuggerHost;

  if (!hostUri) return null;
  return hostUri.split(':')[0] ?? null;
}

function isPrivateIpv4(host: string): boolean {
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function resolveDefaultApiBase(): string {
  const manifestHost = pickHostFromExpoManifest();

  if (manifestHost && isPrivateIpv4(manifestHost)) {
    const url = `http://${manifestHost}:8000/api`;
    console.log('[gigachat] resolved from manifest:', url);
    return url;
  }

  if (Platform.OS === 'android') {
    console.log('[gigachat] fallback android emulator');
    return 'http://10.0.2.2:8000/api';
  }

  // iOS — 127.0.0.1 не работает в Expo Go / на реальном устройстве.
  // Укажи свой IP вручную через EXPO_PUBLIC_API_BASE_URL в .env
  console.warn(
    '[gigachat] Не удалось определить IP сервера автоматически. ' +
    'Задайте EXPO_PUBLIC_API_BASE_URL=http://<IP_вашего_ПК>:8000/api в файле .env'
  );
  return 'http://127.0.0.1:8000/api';
}

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? resolveDefaultApiBase()
).replace(/\/+$/, '');

console.log('[gigachat] API_BASE =', API_BASE);

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('timed out') || msg.includes('abort') || msg.includes('timeout');
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('network request failed') || msg.includes('failed to fetch');
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
// Healthcheck
// ─────────────────────────────────────────────

async function ensureBackendReachable(): Promise<void> {
  const healthUrl = API_BASE.replace(/\/api$/, '/health');
  console.log('[gigachat] healthcheck ->', healthUrl);

  try {
    const response = await fetchWithTimeout(
      healthUrl,
      { method: 'GET' },
      HEALTHCHECK_TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(`Healthcheck вернул HTTP ${response.status}`);
    }

    console.log('[gigachat] healthcheck OK');
  } catch (err) {
    console.error('[gigachat] healthcheck FAILED:', err);

    if (isNetworkError(err)) {
      throw new Error(
        `Не удаётся подключиться к серверу по адресу ${API_BASE}.\n\n` +
        `Проверьте:\n` +
        `1. Бэкенд запущен на ПК (python server.py)\n` +
        `2. Телефон и ПК в одной Wi-Fi сети\n` +
        `3. В .env задан правильный IP: EXPO_PUBLIC_API_BASE_URL=http://<IP_ПК>:8000/api\n` +
        `4. Брандмауэр Windows не блокирует порт 8000`
      );
    }

    if (isTimeoutError(err)) {
      throw new Error(
        `Сервер не отвечает на healthcheck (таймаут ${HEALTHCHECK_TIMEOUT_MS / 1000}с).\n` +
        `Проверьте доступность ${API_BASE} с телефона.`
      );
    }

    throw err;
  }
}

// ─────────────────────────────────────────────
// Запрос описания
// ─────────────────────────────────────────────

type DescribeResponse = {
  success?: boolean;
  description?: string;
  detail?: string;
};

async function requestDescription(
  base64Image: string,
  filename: string
): Promise<string> {
  const url = `${API_BASE}/describe`;
  console.log('[gigachat] POST', url, '| filename:', filename);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64Image, filename }),
    },
    REQUEST_TIMEOUT_MS
  );

  const data = (await response.json().catch(() => ({}))) as DescribeResponse;

  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : `HTTP ${response.status}`;
    console.error('[gigachat] describe error:', detail);
    throw new Error(detail);
  }

  if (data.success === false || typeof data.description !== 'string') {
    throw new Error('Сервер вернул некорректный ответ');
  }

  console.log('[gigachat] describe OK, length:', data.description.length);
  return data.description;
}

// ─────────────────────────────────────────────
// Публичный API
// ─────────────────────────────────────────────

export async function describeImage(
  base64Image: string,
  filename = 'image.jpg'
): Promise<string> {
  await ensureBackendReachable();

  try {
    return await requestDescription(base64Image, filename);
  } catch (firstError) {
    // Повторная попытка только при сетевых/таймаут ошибках
    if (!isTimeoutError(firstError) && !isNetworkError(firstError)) {
      throw firstError;
    }

    console.warn('[gigachat] первая попытка не удалась, повтор через 2с...', firstError);
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      return await requestDescription(base64Image, filename);
    } catch (retryError) {
      if (isTimeoutError(retryError)) {
        throw new Error(
          'Сервер отвечает слишком долго. ' +
          'Попробуйте сделать более простой снимок или проверьте интернет-соединение на ПК с бэкендом.'
        );
      }
      if (isNetworkError(retryError)) {
        throw new Error(
          `Потеряно соединение с сервером (${API_BASE}).\n` +
          'Убедитесь, что телефон и ПК находятся в одной Wi-Fi сети.'
        );
      }
      throw retryError;
    }
  }
}

export async function getAccessToken(): Promise<void> {
  console.log('[gigachat] токен запрашивается на стороне сервера');
}