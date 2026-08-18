import { API_BASE_URL } from './config';
import { getJwtToken, ApiError } from './client';
import type { Proxy, UploadProxyBulkResponse } from './types';

interface UploadPhotoResponse { url: string; }

const authHeaders = (): Record<string, string> => {
  const token = getJwtToken();
  if (!token) return {};
  return { Authorization: token.startsWith('Bearer') ? token : `Bearer ${token}` };
};

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    try {
      const json = JSON.parse(txt) as { message?: string; error?: string };
      return json.message || json.error || txt.slice(0, 300);
    } catch {
      return txt.slice(0, 300);
    }
  } catch {
    return '';
  }
}

export const uploadService = {
  async uploadPhoto(file: File): Promise<UploadPhotoResponse> {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`${API_BASE_URL}/api/upload-photo`, {
      method: 'POST',
      body: formData,
      headers: authHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const msg = await parseErrorBody(res);
      throw new ApiError(res.status, msg || `Upload failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as UploadPhotoResponse;
  },

  buildImageUrl(relative: string) {
    if (!relative) return '';
    if (/^https?:/i.test(relative)) return relative;
    if (relative.startsWith('//')) return '/images' + relative.replace(/^\/\//, '/');
    if (relative.startsWith('/')) return relative;
    return `/images/${relative}`;
  },

  /** POST /api/upload-proxy — один прокси. */
  async uploadProxy(data: Record<string, unknown>): Promise<{ message?: string; proxy?: Proxy }> {
    const res = await fetch(`${API_BASE_URL}/api/upload-proxy`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include',
    });
    if (!res.ok) {
      const msg = await parseErrorBody(res);
      throw new ApiError(res.status, msg || 'Не удалось загрузить прокси');
    }
    return (await res.json()) as { message?: string; proxy?: Proxy };
  },

  /** POST /api/upload-proxy-bulk — файлы со списками прокси. */
  async uploadProxyBulk(params: {
    files: File[];
    protocol: string;
    isRotating?: boolean;
    refreshUrl?: string;
  }): Promise<UploadProxyBulkResponse> {
    const formData = new FormData();
    for (const f of params.files) {
      formData.append('proxies', f, f.name);
    }
    formData.append('protocol', params.protocol);
    formData.append('isRotating', params.isRotating ? 'true' : 'false');
    if (params.refreshUrl?.trim()) {
      formData.append('refreshUrl', params.refreshUrl.trim());
    }

    const res = await fetch(`${API_BASE_URL}/api/upload-proxy-bulk`, {
      method: 'POST',
      body: formData,
      headers: authHeaders(),
      credentials: 'include',
    });

    if (!res.ok) {
      const msg = await parseErrorBody(res);
      throw new ApiError(res.status, msg || 'Не удалось загрузить прокси');
    }
    return (await res.json()) as UploadProxyBulkResponse;
  },
};
