-- Demonstration destinations (curated). Safe to run on a fresh database; skip in production.
-- No fake users, posts or trips are seeded: demo accounts must be created through Supabase Auth so passwords are real.
insert into public.destinations (source, slug, name, region, country, category, description, latitude, longitude, is_featured) values
  ('curated', 'coxs-bazar', 'Cox''s Bazar', 'Chattogram', 'Bangladesh', 'beaches', 'One of the world''s longest natural sea beaches. (Demo description)', 21.4272, 92.0058, true),
  ('curated', 'sajek-valley', 'Sajek Valley', 'Rangamati', 'Bangladesh', 'mountains', 'Cloud-level hill valley with sunrise views. (Demo description)', 23.3800, 92.2930, true),
  ('curated', 'sylhet-ratargul', 'Ratargul Swamp Forest', 'Sylhet', 'Bangladesh', 'nature', 'Freshwater swamp forest explored by small boat. (Demo description)', 25.0100, 91.9380, true),
  ('curated', 'old-dhaka', 'Old Dhaka', 'Dhaka', 'Bangladesh', 'cities', 'Historic quarter of narrow lanes and street food. (Demo description)', 23.7104, 90.4074, false),
  ('curated', 'bandarban-nilgiri', 'Nilgiri, Bandarban', 'Bandarban', 'Bangladesh', 'mountains', 'High-altitude viewpoint above the clouds. (Demo description)', 21.8660, 92.3750, true)
on conflict do nothing;
