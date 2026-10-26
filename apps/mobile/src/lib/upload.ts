import * as FileSystem from 'expo-file-system/legacy';
import { buildStoragePath, validateUpload, type UploadKind } from '@solotrav/validation';
import { getDb, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const BUCKET: Record<UploadKind, string> = { avatar: 'avatars', cover: 'covers', 'post-image': 'post-media', 'post-video': 'post-media', 'message-image': 'message-media' };

export class UploadError extends Error {
  constructor(message: string, public readonly code: 'INVALID' | 'AUTH' | 'NETWORK' | 'SERVER' | 'ABORTED') { super(message); }
}

export interface PickedFile { uri: string; name: string; mimeType: string; size: number }

export interface UploadHandle { promise: Promise<{ path: string; bucket: string }>; cancel: () => Promise<void> }

/**
 * Upload with real progress and cancellation. The object path is generated (<user uuid>/<uuid>.<ext>), never the
 * device filename. The bucket re-validates type and size on the server.
 */
export function uploadFile(file: PickedFile, kind: UploadKind, onProgress?: (fraction: number) => void): UploadHandle {
  let task: ReturnType<typeof FileSystem.createUploadTask> | null = null;
  let aborted = false;
  const promise = (async () => {
    const check = validateUpload({ name: file.name, type: file.mimeType, size: file.size }, kind);
    if (!check.ok) throw new UploadError(check.error ?? 'Invalid file', 'INVALID');
    const { data } = await getDb().auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new UploadError('Please log in again to upload.', 'AUTH');
    const path = buildStoragePath(data.session!.user.id, check.ext as string);
    const bucket = BUCKET[kind];
    task = FileSystem.createUploadTask(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, file.uri, {
      httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey as string, 'Content-Type': file.mimeType, 'x-upsert': 'false' },
    }, (p) => { if (p.totalBytesExpectedToSend > 0) onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend); });
    let res: FileSystem.FileSystemUploadResult | null | undefined;
    try { res = await task.uploadAsync(); } catch { throw new UploadError(aborted ? 'Upload cancelled.' : 'Network problem during upload. Check your connection and retry.', aborted ? 'ABORTED' : 'NETWORK'); }
    if (aborted || !res) throw new UploadError('Upload cancelled.', 'ABORTED');
    if (res.status < 200 || res.status >= 300) throw new UploadError(res.status === 413 ? 'The file is too large.' : 'The upload was rejected by the server.', 'SERVER');
    onProgress?.(1);
    return { path, bucket };
  })();
  return { promise, cancel: async () => { aborted = true; await task?.cancelAsync().catch(() => undefined); } };
}
