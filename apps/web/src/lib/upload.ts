'use client';

import { buildStoragePath, validateUpload, type UploadKind } from '@solotrav/validation';
import { env } from '@/lib/env';
import { getBrowserSupabase } from '@/lib/supabase/client';

const BUCKET: Record<UploadKind, string> = { avatar: 'avatars', cover: 'covers', 'post-image': 'post-media', 'post-video': 'post-media', 'message-image': 'message-media' };

export class UploadError extends Error {
  constructor(message: string, public readonly code: 'INVALID' | 'NETWORK' | 'ABORTED' | 'SERVER' | 'AUTH') { super(message); }
}

/**
 * Uploads one file to Supabase Storage with REAL progress events (XHR), cancellation and a generated path.
 * The bucket enforces mime type and size again server-side. Retry = call again (new random path, upsert off).
 */
export async function uploadWithProgress(file: File, kind: UploadKind, o: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<{ path: string; bucket: string }> {
  const check = validateUpload(file, kind);
  if (!check.ok) throw new UploadError(check.error ?? 'Invalid file', 'INVALID');
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new UploadError('Please log in again to upload.', 'AUTH');
  const userId = data.session?.user.id as string;
  const path = buildStoragePath(userId, check.ext as string);
  const bucket = BUCKET[kind];

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${env.supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', env.supabaseAnonKey as string);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) o.onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(xhr.status === 413 ? 'The file is too large.' : xhr.status === 415 || xhr.status === 400 ? 'This file type is not accepted.' : 'The upload was rejected by the server.', 'SERVER')));
    xhr.onerror = () => reject(new UploadError('Network problem during upload. Check your connection and retry.', 'NETWORK'));
    xhr.onabort = () => reject(new UploadError('Upload cancelled.', 'ABORTED'));
    if (o.signal) { if (o.signal.aborted) { reject(new UploadError('Upload cancelled.', 'ABORTED')); return; } o.signal.addEventListener('abort', () => xhr.abort(), { once: true }); }
    xhr.send(file);
  });
  o.onProgress?.(1);
  return { path, bucket };
}

export async function removeUploaded(bucket: string, paths: string[]) {
  if (paths.length) await getBrowserSupabase().storage.from(bucket).remove(paths).catch(() => undefined);
}

/** Reads dimensions so posts can reserve layout space (images only). */
export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
