import { describe, expect, it } from 'vitest';
import {
  buildStoragePath, commentInputSchema, gpsPointSchema, postInputSchema, profileUpdateSchema, reportInputSchema,
  searchQuerySchema, signUpSchema, stopInputSchema, syncBatchSchema, tripInputSchema, usernameSchema, validateUpload,
} from './index';

const uuid = '3f8a2b1c-0d4e-4f5a-9b6c-7d8e9f0a1b2c';

describe('auth and profile forms', () => {
  it('normalises and validates sign-up input', () => {
    const ok = signUpSchema.safeParse({ email: ' A@B.CO ', password: 'longenough', username: 'Anika_R', displayName: ' Anika ', acceptTerms: true });
    expect(ok.success && ok.data).toMatchObject({ email: 'a@b.co', username: 'anika_r', displayName: 'Anika' });
    expect(signUpSchema.safeParse({ email: 'nope', password: 'short', username: 'a', displayName: '', acceptTerms: false }).success).toBe(false);
  });

  it('rejects unsafe usernames', () => {
    for (const bad of ['ab', 'has space', 'semi;colon', 'x'.repeat(31), 'ünï', '<script>']) expect(usernameSchema.safeParse(bad).success).toBe(false);
    expect(usernameSchema.safeParse('good_name_1').success).toBe(true);
  });

  it('never lets privileged fields through a profile update', () => {
    const r = profileUpdateSchema.safeParse({ display_name: 'x', account_status: 'active', is_admin: true, role: 'super_administrator' });
    expect(r.success && Object.keys(r.data)).toEqual(['display_name']);
  });
});

describe('trips and stops', () => {
  it('allows trips without dates and rejects inverted ranges', () => {
    expect(tripInputSchema.safeParse({ title: 'Hill escape' }).success).toBe(true);
    const r = tripInputSchema.safeParse({ title: 'Hill escape', start_date: '2026-05-10', end_date: '2026-05-01' });
    expect(r.success).toBe(false);
    expect(tripInputSchema.safeParse({ title: 'ab' }).success).toBe(false);
  });

  it('requires a destination or a fully specified custom place', () => {
    expect(stopInputSchema.safeParse({}).success).toBe(false);
    expect(stopInputSchema.safeParse({ destination_id: uuid }).success).toBe(true);
    expect(stopInputSchema.safeParse({ custom_name: 'Tea stall', custom_latitude: 24.3, custom_longitude: 91.7 }).success).toBe(true);
    expect(stopInputSchema.safeParse({ custom_name: 'Tea stall', custom_latitude: 124.3, custom_longitude: 91.7 }).success).toBe(false);
    expect(stopInputSchema.safeParse({ destination_id: uuid, planned_arrival_at: '2026-05-02T10:00:00Z', planned_departure_at: '2026-05-02T09:00:00Z' }).success).toBe(false);
  });
});

describe('posts, comments, reports', () => {
  it('needs a caption or media', () => {
    expect(postInputSchema.safeParse({}).success).toBe(false);
    expect(postInputSchema.safeParse({ caption: 'Sunrise' }).success).toBe(true);
    expect(postInputSchema.safeParse({ mediaCount: 2 }).success).toBe(true);
    expect(postInputSchema.safeParse({ caption: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('validates comments and reports', () => {
    expect(commentInputSchema.safeParse({ post_id: uuid, body: '   ' }).success).toBe(false);
    expect(commentInputSchema.safeParse({ post_id: uuid, body: 'Great!' }).success).toBe(true);
    expect(reportInputSchema.safeParse({ target_type: 'post', target_id: uuid, reason: 'made_up' }).success).toBe(false);
    expect(reportInputSchema.safeParse({ target_type: 'post', target_id: uuid, reason: 'spam' }).success).toBe(true);
  });
});

describe('gps payloads', () => {
  const base = { seq: 0, t: '2026-01-01T00:00:00Z', lat: 23.8, lng: 90.4, acc: 10 };
  it('rejects malformed points', () => {
    expect(gpsPointSchema.safeParse(base).success).toBe(true);
    for (const bad of [{ lat: 91 }, { lng: -200 }, { acc: -1 }, { t: 'yesterday' }, { seq: -1 }, { seq: 1.5 }]) {
      expect(gpsPointSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });
  it('limits batch size to 500', () => {
    expect(syncBatchSchema.safeParse(Array.from({ length: 500 }, (_, i) => ({ ...base, seq: i }))).success).toBe(true);
    expect(syncBatchSchema.safeParse(Array.from({ length: 501 }, (_, i) => ({ ...base, seq: i }))).success).toBe(false);
    expect(syncBatchSchema.safeParse([]).success).toBe(false);
  });
});

describe('uploads and search', () => {
  it('validates type, extension and size', () => {
    expect(validateUpload({ name: 'a.JPG', type: 'image/jpeg', size: 1000 }, 'post-image')).toEqual({ ok: true, ext: 'jpg' });
    expect(validateUpload({ name: 'a.exe', type: 'image/jpeg', size: 1000 }, 'post-image').ok).toBe(false);
    expect(validateUpload({ name: 'a.jpg', type: 'application/pdf', size: 1000 }, 'post-image').ok).toBe(false);
    expect(validateUpload({ name: 'a.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 }, 'post-image').ok).toBe(false);
    expect(validateUpload({ name: 'a.jpg', type: 'image/jpeg', size: 0 }, 'avatar').ok).toBe(false);
    expect(validateUpload({ name: 'trip.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 }, 'post-video').ok).toBe(true);
    expect(validateUpload({ name: 'trip.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 }, 'post-image').ok).toBe(false);
  });
  it('generates storage paths without using the user filename', () => {
    expect(buildStoragePath(uuid, 'png', () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(`${uuid}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png`);
    expect(() => buildStoragePath('../etc', 'png')).toThrow();
    expect(() => buildStoragePath(uuid, 'exe')).toThrow();
  });
  it('sanitises search queries', () => {
    const r = searchQuerySchema.safeParse('  sajek\u0000 valley  ');
    expect(r.success && r.data).toBe('sajek  valley');
    expect(searchQuerySchema.safeParse('a').success).toBe(false);
    const long = searchQuerySchema.safeParse('x'.repeat(500));
    expect(long.success && long.data.length).toBe(100);
  });
});
