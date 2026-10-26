import { useId } from 'react';

const SCENES: Record<string, { top: string; bottom: string; art: string }> = {
  beaches: { top: '#8EDCEB', bottom: '#CDEFF0', art: '<circle cx="300" cy="50" r="20" fill="#FFF4D6"/><path d="M0 110C60 95 110 125 170 112S280 100 400 116V200H0z" fill="#4FB7CC" fill-opacity=".55"/><path d="M0 140C80 125 140 150 200 140S330 130 400 144V200H0z" fill="#F2DFAF"/>' },
  mountains: { top: '#A9C9E8', bottom: '#D6E7E0', art: '<path d="M0 130L80 60 150 120 230 40 400 140V200H0z" fill="#6E9C86" fill-opacity=".85"/><path d="M0 160L120 105 220 155 320 100 400 150V200H0z" fill="#3F7A5F"/>' },
  cities: { top: '#F5C9A8', bottom: '#FBE8D5', art: '<g fill="#8A6A58" fill-opacity=".8"><rect x="30" y="100" width="40" height="100"/><rect x="80" y="70" width="34" height="130"/><rect x="125" y="110" width="48" height="90"/><rect x="185" y="60" width="38" height="140"/><rect x="235" y="95" width="44" height="105"/><rect x="290" y="75" width="36" height="125"/><rect x="335" y="115" width="50" height="85"/></g>' },
  hills: { top: '#BFE0D2', bottom: '#E6F2D9', art: '<path d="M0 120C70 80 130 130 200 100S330 80 400 120V200H0z" fill="#79B08A"/><path d="M0 150C90 120 160 165 240 140S350 130 400 150V200H0z" fill="#3F7A5F"/><circle cx="90" cy="45" r="16" fill="#FFF4D6"/>' },
  nature: { top: '#B9D8EE', bottom: '#E4F1E6', art: '<path d="M0 150C80 120 120 170 200 140S320 100 400 130V200H0z" fill="#79B08A"/><path d="M120 200C150 150 230 150 260 95S330 60 360 40" stroke="#4FB7CC" stroke-width="14" fill="none" stroke-linecap="round"/>' },
  historical: { top: '#EBD3A8', bottom: '#F8EBD0', art: '<path d="M60 170V110l60-30 60 30v60zM200 170v-70l70-40 70 40v70z" fill="#B27A4F" fill-opacity=".8"/><path d="M0 170H400V200H0z" fill="#8A6A58"/>' },
};
const ALIAS: Record<string, string> = { adventure: 'hills', 'hidden-gems': 'hills', weekend: 'nature', restaurants: 'cities' };

/** Placeholder scenery, always labelled as demo imagery. Real photography replaces it via image_path. */
export function Scene({ category, className = '', label = true }: { category?: string | null; className?: string; label?: boolean }) {
  const key = category ? (SCENES[category] ? category : (ALIAS[category] ?? 'hills')) : 'hills';
  const s = SCENES[key] as (typeof SCENES)[string];
  const id = useId().replace(/:/g, '');
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.top} />
            <stop offset=".65" stopColor={s.bottom} />
          </linearGradient>
        </defs>
        <rect width="400" height="200" fill={`url(#${id})`} />
        <g dangerouslySetInnerHTML={{ __html: s.art }} />
      </svg>
      {label && <span className="absolute bottom-1.5 left-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold text-[#102A43]">Demo image</span>}
    </div>
  );
}
