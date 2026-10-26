import { z } from 'zod';

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const INTERESTS = [
  'Beaches', 'Mountains', 'Food', 'Culture', 'Historical places', 'Wildlife',
  'Adventure', 'Photography', 'Road trips', 'Backpacking', 'Luxury travel', 'Budget travel',
] as const;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, 'Use 3–30 lowercase letters, numbers or underscores');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
// Length matters more than composition rules (NIST 800-63B); Supabase Auth enforces its own minimum too.
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'Enter your name').max(80),
  acceptTerms: z.literal(true, { error: 'Please accept the Terms and Privacy Policy' }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  username: usernameSchema.optional(),
  bio: z.string().max(300).optional(),
  home_region: z.string().trim().max(80).nullable().optional(),
  travel_interests: z.array(z.enum(INTERESTS)).max(12).optional(),
  account_visibility: z.enum(['public', 'private']).optional(),
  live_location_sharing: z.enum(['off', 'followers', 'selected']).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const tripInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Give your trip a name (at least 3 characters)').max(140),
    description: z.string().max(2000).default(''),
    start_date: isoDate.nullable().default(null),
    end_date: isoDate.nullable().default(null),
    visibility: z.enum(['public', 'followers', 'private']).default('private'),
    travel_style: z.string().trim().max(40).nullable().default(null),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'The end date must be on or after the start date',
  });
export type TripInput = z.infer<typeof tripInputSchema>;

export const stopInputSchema = z
  .object({
    destination_id: z.uuid().nullable().default(null),
    custom_name: z.string().trim().min(1).max(120).nullable().default(null),
    custom_latitude: z.number().min(-90).max(90).nullable().default(null),
    custom_longitude: z.number().min(-180).max(180).nullable().default(null),
    notes: z.string().max(600).default(''),
    planned_arrival_at: z.iso.datetime({ offset: true }).nullable().default(null),
    planned_departure_at: z.iso.datetime({ offset: true }).nullable().default(null),
    target_minutes: z.number().int().min(0).max(14_400).nullable().default(null),
  })
  .refine((v) => v.destination_id || (v.custom_name && v.custom_latitude !== null && v.custom_longitude !== null), {
    message: 'Choose a destination or provide a name and coordinates',
  })
  .refine((v) => !v.planned_arrival_at || !v.planned_departure_at || v.planned_departure_at >= v.planned_arrival_at, {
    path: ['planned_departure_at'],
    message: 'Departure must be after arrival',
  });

export const stopCompletionSchema = z.object({
  method: z.enum(['manual', 'gps_assisted']),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  tip: z.string().max(400).nullable().default(null),
  distanceM: z.number().int().min(0).nullable().default(null),
});

export const postInputSchema = z
  .object({
    caption: z.string().max(2000).default(''),
    visibility: z.enum(['public', 'followers', 'private']).default('public'),
    post_type: z.enum(['text', 'image', 'video', 'checkin', 'tip']).default('text'),
    trip_id: z.uuid().nullable().default(null),
    destination_id: z.uuid().nullable().default(null),
    mediaCount: z.number().int().min(0).max(10).default(0),
  })
  .refine((v) => v.caption.trim().length > 0 || v.mediaCount > 0, { path: ['caption'], message: 'Add a caption or at least one photo or video' });

export const commentInputSchema = z.object({
  post_id: z.uuid(),
  parent_comment_id: z.uuid().nullable().default(null),
  body: z.string().trim().min(1, 'Write a comment').max(1000),
});

export const reportInputSchema = z.object({
  target_type: z.enum(['post', 'comment', 'profile', 'trip', 'message']),
  target_id: z.uuid(),
  reason: z.enum(['spam', 'harassment', 'unsafe', 'inappropriate', 'private_location', 'other']),
  detail: z.string().max(500).default(''),
});

export const messageInputSchema = z.object({ conversation_id: z.uuid(), body: z.string().trim().min(1).max(2000) });

export const gpsPointSchema = z.object({
  seq: z.number().int().min(0),
  t: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid timestamp'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  acc: z.number().min(0).max(10_000).nullish(),
  alt: z.number().nullish(),
  spd: z.number().min(0).nullish(),
});
export const syncBatchSchema = z.array(gpsPointSchema).min(1).max(500);

export const searchQuerySchema = z
  .string()
  .transform((s) => s.normalize('NFKC').replace(/\p{Cc}/gu, ' ').trim().slice(0, 100))
  .pipe(z.string().min(2, 'Type at least 2 characters'));

// ---------- uploads ----------
export type UploadKind = 'avatar' | 'cover' | 'post-image' | 'post-video' | 'message-image';

const LIMITS: Record<UploadKind, { mimes: Record<string, string[]>; maxBytes: number }> = {
  avatar: { mimes: { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }, maxBytes: 5 * 1024 * 1024 },
  cover: { mimes: { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }, maxBytes: 10 * 1024 * 1024 },
  'post-image': { mimes: { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }, maxBytes: 10 * 1024 * 1024 },
  'post-video': { mimes: { 'video/mp4': ['mp4'], 'video/quicktime': ['mov'], 'video/webm': ['webm'] }, maxBytes: 100 * 1024 * 1024 },
  'message-image': { mimes: { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }, maxBytes: 10 * 1024 * 1024 },
};

export interface UploadCheck {
  ok: boolean;
  error?: string;
  ext?: string;
}

/** First-line client validation. The storage bucket re-enforces mime type and size server-side. */
export function validateUpload(file: { name: string; type: string; size: number }, kind: UploadKind): UploadCheck {
  const rule = LIMITS[kind];
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const allowedExts = rule.mimes[file.type];
  if (!allowedExts) return { ok: false, error: 'This file type is not supported' };
  if (!allowedExts.includes(ext)) return { ok: false, error: 'The file extension does not match its type' };
  if (file.size <= 0) return { ok: false, error: 'The file is empty' };
  if (file.size > rule.maxBytes) return { ok: false, error: `File is too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB)` };
  return { ok: true, ext: ext === 'jpeg' ? 'jpg' : ext };
}

/** Storage object path convention enforced by RLS: <user uuid>/<random uuid>.<ext>. Never uses the user's filename. */
export function buildStoragePath(userId: string, ext: string, uuid: () => string = () => crypto.randomUUID()): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid user id');
  if (!/^(jpg|png|webp|mp4|mov|webm)$/.test(ext)) throw new Error('Invalid extension');
  return `${userId}/${uuid()}.${ext}`;
}
