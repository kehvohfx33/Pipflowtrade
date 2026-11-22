export function getCookie(name: string): string | null {
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      if (k === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCookie('pipflow_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const resp = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new ApiError(
      data?.error || data?.message || `Request failed (${resp.status})`,
      resp.status,
      data
    );
  }

  return data as T;
}
