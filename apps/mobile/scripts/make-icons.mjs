// Renders the SoloTrav app icons from SVG using the Chrome installed on the machine (no extra dependencies).
// Run from the repo root:  node apps/mobile/scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');
mkdirSync(out, { recursive: true });

const BLUE = '#1769FF';
const CORAL = '#FF7657';
const route = (stroke, startFill, endFill) => `
  <path d="M290 660 C 380 380, 560 720, 750 350" fill="none" stroke="${stroke}" stroke-width="78" stroke-linecap="round"/>
  <circle cx="290" cy="660" r="46" fill="${startFill}"/>
  <circle cx="750" cy="350" r="70" fill="${endFill}"/>`;
const svg = (body, bg = 'none') => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${bg}"/>${body}</svg>`;

const files = {
  'icon.png': { svg: svg(route('#fff', '#fff', CORAL), BLUE), size: 1024 },
  'android-icon-background.png': { svg: svg('', BLUE), size: 1024 },
  'android-icon-foreground.png': { svg: svg(route('#fff', '#fff', CORAL)), size: 1024, transparent: true },
  'android-icon-monochrome.png': { svg: svg(route('#fff', '#fff', '#fff')), size: 1024, transparent: true },
  'splash-icon.png': { svg: svg(route('#fff', '#fff', CORAL)), size: 1024, transparent: true },
  'favicon.png': { svg: svg(route('#fff', '#fff', CORAL), BLUE), size: 48 },
};

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, f] of Object.entries(files)) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${f.svg}</body></html>`);
  if (f.size !== 1024) await page.setViewportSize({ width: f.size, height: f.size });
  if (f.size !== 1024) await page.evaluate((s) => { const e = document.querySelector('svg'); e.setAttribute('width', s); e.setAttribute('height', s); }, f.size);
  await page.screenshot({ path: resolve(out, name), omitBackground: Boolean(f.transparent) });
  await page.close();
  console.warn('wrote', name);
}
await browser.close();
