#!/usr/bin/env node
// Verification for plant-live v2 (interactive): capture-mode session in headless Chromium.
//   A: t=20, no tap — the wide whole-plant home view, no selection, card hidden.
//   B: tap a moving car (real PointerEvent at its projected screen position) — after the
//      camera settles the car is framed closer, boxed, its detail card open with its VIN.
//   C: +10 s — the same car is still followed (its lt advanced, the camera moved with it).
//   D: tap empty floor — selection cleared, card hidden, camera back to the wide view.
//   E (assert only): tap a car again, then the tools column's home button — deselects.
// Zero page errors are required throughout; counters must keep advancing.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, DIST, FFMPEG, playwright} from './paths.mjs';

const {chromium} = playwright();
const html = path.join(DIST, 'plant-live.html');
const OUTD = '/data/home/plant-live-verify2';
fs.mkdirSync(OUTD, {recursive: true});
const errors = [];
const log = (...a) => console.log(...a);
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('console', (m) => m.type() === 'error' && errors.push('[console] ' + m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => {
  window.__CAPTURE = true;
});
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
await page.evaluate(() => document.fonts.ready);

let cur = 0;
const renderTo = async (t, step = 0.5) => {
  while (cur < t - 1e-9) {
    cur = Math.min(t, cur + step);
    await page.evaluate((x) => window.SIM.render(x), cur);
  }
};
const state = () => page.evaluate(() => window.__LIVE_STATE);
const tapAt = (px, py) =>
  page.evaluate(
    ([x, y]) => {
      const cv = document.getElementById('gl');
      const r = cv.getBoundingClientRect();
      const cx = r.left + (x / 1600) * r.width;
      const cy = r.top + (y / 900) * r.height;
      for (const type of ['pointerdown', 'pointerup']) cv.dispatchEvent(new PointerEvent(type, {clientX: cx, clientY: cy, bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true}));
    },
    [px, py],
  );
const projectCar = (n) =>
  page.evaluate((nn) => {
    const {st, W} = window.TOYPLANTLIVE;
    const c = W.live.activeCars(window.__LIVE_STATE.t).find((cc) => cc.n === nn);
    if (!c) return null;
    const p = c.group.position;
    return {xy: st.project({x: p.x, y: p.y + 1.1, z: p.z}), vin: c.vin, lt: c.lt};
  }, n);
const pickCar = (lo, hi) =>
  page.evaluate(
    ([a, b]) => {
      const {W} = window.TOYPLANTLIVE;
      const c = W.live.activeCars(window.__LIVE_STATE.t).find((cc) => cc.lt >= a && cc.lt <= b);
      return c ? c.n : null;
    },
    [lo, hi],
  );
const detInfo = () =>
  page.evaluate(() => {
    const det = document.querySelector('.det');
    return {vis: det?.style.visibility ?? '', title: document.querySelector('[data-k="dTitle"]')?.textContent ?? ''};
  });

const result = {shots: {}, errors};

// ---------- A: the wide home view at t=20
await renderTo(20, 1.0);
{
  const s = await state();
  const corners = await page.evaluate(() => {
    const {st} = window.TOYPLANTLIVE;
    const pts = [];
    for (const x of [-94, 142]) for (const z of [-40, 44]) for (const y of [0, 16]) pts.push(st.project({x, y, z}));
    return pts;
  });
  const xs = corners.map((p) => p?.[0]);
  const ys = corners.map((p) => p?.[1]);
  result.shots.A = {t: s.t, sel: s.sel, started: s.started, shipped: s.shipped, onLine: s.onLine, camD: Math.round(s.cam.d), cornerX: [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))], cornerY: [Math.round(Math.min(...ys)), Math.round(Math.max(...ys))], det: await detInfo()};
  await page.screenshot({path: path.join(OUTD, 'shotA-wide-home.png')});
  log('A', JSON.stringify(result.shots.A));
}

// ---------- B: tap the car leaving the booth (lt 18..22 — it still has ~25 s on the line,
// so it stays followable across the whole B→C window) and let the camera settle 4 s
const nB = await pickCar(18, 22);
if (nB === null) throw new Error('no car in lt 18..22 at t=20');
const projB = await projectCar(nB);
log('tap car n=', nB, JSON.stringify(projB));
await tapAt(projB.xy[0], projB.xy[1]);
await renderTo(24, 0.25);
{
  const s = await state();
  result.shots.B = {t: s.t, sel: s.sel, selVin: s.selVin, selLt: s.selLt, cam: {x: Math.round(s.cam.x), d: Math.round(s.cam.d)}, det: await detInfo(), expectedVin: projB.vin};
  await page.screenshot({path: path.join(OUTD, 'shotB-follow-car.png')});
  log('B', JSON.stringify(result.shots.B));
}

// ---------- C: 10 s later, same car still followed
await renderTo(34, 0.5);
{
  const s = await state();
  result.shots.C = {t: s.t, sel: s.sel, selVin: s.selVin, selLt: s.selLt, cam: {x: Math.round(s.cam.x), d: Math.round(s.cam.d)}, started: s.started, shipped: s.shipped};
  await page.screenshot({path: path.join(OUTD, 'shotC-follow-later.png')});
  log('C', JSON.stringify(result.shots.C));
}

// ---------- D: tap empty floor — find a bare-floor pixel first by scanning the page's own
// picker over the lower half of the frame (floor/conveyor are not pick roots → null), then
// dispatch the real tap there.
{
  const floorPx = await page.evaluate(() => {
    const cv = document.getElementById('gl');
    const r = cv.getBoundingClientRect();
    for (let y = 560; y <= 720; y += 32) {
      for (let x = 180; x <= 1420; x += 32) {
        const cx = r.left + (x / 1600) * r.width;
        const cy = r.top + (y / 900) * r.height;
        if (window.TOYPLANTLIVE.pickAt(cx, cy) === null) return [x, y];
      }
    }
    return null;
  });
  if (!floorPx) throw new Error('no bare-floor pixel found in scan');
  await tapAt(floorPx[0], floorPx[1]);
  await renderTo(cur + 0.5, 0.25);
  const s0 = await state();
  if (s0.sel) throw new Error(`floor tap at ${floorPx} did not deselect (sel=${JSON.stringify(s0.sel)})`);
  result.shots.D = {floorPx};
  await renderTo(cur + 2.5, 0.25);
  const s = await state();
  Object.assign(result.shots.D, {t: s.t, sel: s.sel, camD: Math.round(s.cam.d), det: await detInfo(), shipped: s.shipped});
  await page.screenshot({path: path.join(OUTD, 'shotD-back-home.png')});
  log('D', JSON.stringify(result.shots.D));
}

// ---------- E (assert only): select again, then the home button deselects
{
  const nE = await pickCar(20, 32);
  const projE = await projectCar(nE);
  await tapAt(projE.xy[0], projE.xy[1]);
  await renderTo(cur + 1, 0.25);
  const s1 = await state();
  await page.evaluate(() => {
    const b = document.querySelector('[data-k="tool6"]');
    b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true}));
  });
  await renderTo(cur + 0.5, 0.25);
  const s2 = await state();
  result.homeButton = {selectedVin: s1.selVin, afterHomeSel: s2.sel};
  log('E', JSON.stringify(result.homeButton));
}

await browser.close();
result.errors = errors;
log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) log(e);
fs.writeFileSync(path.join(OUTD, 'verify2.json'), JSON.stringify(result, null, 2));

const sheet = path.join(OUTD, 'plant-live-v2-stills.png');
await new Promise((r) =>
  spawn(FFMPEG, ['-loglevel', 'error', '-y', '-i', path.join(OUTD, 'shotA-wide-home.png'), '-i', path.join(OUTD, 'shotB-follow-car.png'), '-i', path.join(OUTD, 'shotC-follow-later.png'), '-i', path.join(OUTD, 'shotD-back-home.png'),
    '-filter_complex', '[0:v]scale=512:288[a];[1:v]scale=512:288[b];[2:v]scale=512:288[c];[3:v]scale=512:288[d];[a][b][c][d]hstack=inputs=4', '-frames:v', '1', sheet], {stdio: 'inherit'}).on('close', r),
);
log(`sheet: ${sheet}`);
