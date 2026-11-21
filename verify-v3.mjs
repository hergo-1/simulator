#!/usr/bin/env node
// plant-live v3 verification: free navigation (drag pan / wheel zoom / pinch zoom /
// double-tap home) + tap-to-follow, in capture mode with stepped SIM.render calls and
// synthetic PointerEvents dispatched on the canvas (the v2 verify pattern).
//   node verify-v3.mjs <html> <outdir> <prefix>
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, playwright} from './paths.mjs';

const [html, OUTD, PREFIX = 'v3'] = process.argv.slice(2);
fs.mkdirSync(OUTD, {recursive: true});
const {chromium} = playwright();
const errors = [];
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('console', (m) => m.type() === 'error' && errors.push('[console] ' + m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => { window.__CAPTURE = true; });
await page.goto(pathToFileURL(path.resolve(html)).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 90000});
await page.evaluate(() => document.fonts.ready);

let cur = 0;
const renderTo = async (t, step = 0.25) => { while (cur < t - 1e-9) { cur = Math.min(t, cur + step); await page.evaluate((x) => window.SIM.render(x), cur); } };
const state = () => page.evaluate(() => window.__LIVE_STATE);
const nav = () => page.evaluate(() => window.__LIVE_STATE.nav);
// stage coords (1600x900) -> client coords via canvas rect
const toClient = (x, y) => page.evaluate(([px, py]) => {
  const r = document.getElementById('gl').getBoundingClientRect();
  return [r.left + (px / 1600) * r.width, r.top + (py / 900) * r.height];
}, [x, y]);
const ptr = (type, x, y, id = 7) => page.evaluate(([ty, px, py, pid]) => {
  const cv = document.getElementById('gl');
  const r = cv.getBoundingClientRect();
  const cx = r.left + (px / 1600) * r.width, cy = r.top + (py / 900) * r.height;
  cv.dispatchEvent(new PointerEvent(ty, {clientX: cx, clientY: cy, bubbles: true, pointerId: pid, pointerType: 'touch', isPrimary: pid === 7, button: 0, buttons: ty === 'pointerup' || ty === 'pointercancel' ? 0 : 1}));
}, [type, x, y, id]);
const tapAt = async (x, y) => { await ptr('pointerdown', x, y); await ptr('pointerup', x, y); };
const wheelAt = (x, y, dy) => page.evaluate(([px, py, d]) => {
  const cv = document.getElementById('gl');
  const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new WheelEvent('wheel', {clientX: r.left + (px / 1600) * r.width, clientY: r.top + (py / 900) * r.height, deltaY: d, bubbles: true, cancelable: true}));
}, [x, y, dy]);
const projectPt = (wx, wy, wz) => page.evaluate(([x, y, z]) => window.TOYPLANTLIVE.st.project({x, y, z}), [wx, wy, wz]);
const pickIsNull = (x, y) => page.evaluate(([px, py]) => {
  const cv = document.getElementById('gl');
  const r = cv.getBoundingClientRect();
  return window.TOYPLANTLIVE.pickAt(r.left + (px / 1600) * r.width, r.top + (py / 900) * r.height) === null;
}, [x, y]);
const detInfo = () => page.evaluate(() => {
  const det = document.querySelector('.det');
  return {vis: det?.style.visibility ?? '', title: document.querySelector('[data-k="dTitle"]')?.textContent ?? ''};
});
const projectCar = (n) => page.evaluate((nn) => {
  const {st, W} = window.TOYPLANTLIVE;
  const c = W.live.activeCars(window.__LIVE_STATE.t).find((cc) => cc.n === nn);
  if (!c) return null;
  const p = c.group.position;
  return {xy: st.project({x: p.x, y: p.y + 1.1, z: p.z}), vin: c.vin, lt: c.lt};
}, n);
const pickCar = (lo, hi) => page.evaluate(([a, b]) => {
  const c = window.TOYPLANTLIVE.W.live.activeCars(window.__LIVE_STATE.t).find((cc) => cc.lt >= a && cc.lt <= b);
  return c ? c.n : null;
}, [lo, hi]);

const R = {asserts: {}, errors};
const assert = (k, ok, info) => { R.asserts[k] = {ok: !!ok, info}; log(ok ? 'PASS' : 'FAIL', k, JSON.stringify(info)); };

// ---------- A: wide home at t=20
await renderTo(20, 1.0);
{
  const s = await state();
  R.A = {t: s.t, started: s.started, shipped: s.shipped, onLine: s.onLine, camD: Math.round(s.cam.d), mode: s.nav.mode, det: await detInfo()};
  await page.screenshot({path: path.join(OUTD, `${PREFIX}-A-wide.png`)});
  log('A', JSON.stringify(R.A));
  assert('A_home_mode', s.nav.mode === 'home' && Math.abs(s.cam.d - 363) < 12, {mode: s.nav.mode, camD: s.cam.d});
  assert('A_counters_live', s.started >= 5 && s.onLine >= 3, {started: s.started, onLine: s.onLine});
  R.landmark0 = await projectPt(24, 0, 4);
}

// ---------- B: drag pan (grab-the-world) from (800,450) to (500,450)
{
  await ptr('pointerdown', 800, 450);
  for (const x of [725, 650, 575, 500]) { await ptr('pointermove', x, 450); await renderTo(cur + 0.1, 0.1); }
  await ptr('pointerup', 500, 450);
  await renderTo(cur + 2.5);
  const s = await state();
  const lm = await projectPt(24, 0, 4);
  R.B = {mode: s.nav.mode, fx: Math.round(s.nav.fx), fz: Math.round(s.nav.fz), landmarkDx: Math.round(lm[0] - R.landmark0[0])};
  await page.screenshot({path: path.join(OUTD, `${PREFIX}-B-dragpan.png`)});
  log('B', JSON.stringify(R.B), 'landmark', JSON.stringify(lm), 'was', JSON.stringify(R.landmark0));
  assert('B_free_mode', s.nav.mode === 'free', {mode: s.nav.mode});
  assert('B_world_followed_drag', R.B.landmarkDx < -150, {dx: R.B.landmarkDx}); // dragged left -> fixed world point moves left with the pointer
}

// ---------- C: wheel zoom in at centre
{
  const fd0 = (await nav()).fd;
  for (let i = 0; i < 3; i++) { await wheelAt(800, 450, -720); await renderTo(cur + 0.4, 0.2); }
  await renderTo(cur + 1.5);
  const s = await state();
  R.C = {fdBefore: Math.round(fd0), fdAfter: Math.round(s.nav.fd), camD: Math.round(s.cam.d), mode: s.nav.mode};
  await page.screenshot({path: path.join(OUTD, `${PREFIX}-C-zoom.png`)});
  log('C', JSON.stringify(R.C));
  assert('C_zoom_in', s.nav.fd < fd0 - 120 && s.cam.d < 240, R.C);
}

// ---------- double-tap empty ground -> home
{
  let spot = null;
  for (const cand of [[180, 560], [1450, 700], [150, 200], [1480, 180], [800, 830]]) {
    if (await pickIsNull(cand[0], cand[1])) { spot = cand; break; }
  }
  assert('empty_spot_found', !!spot, {spot});
  if (spot) {
    await tapAt(spot[0], spot[1]);
    await sleep(150);
    await tapAt(spot[0], spot[1]);
    await renderTo(cur + 3);
    const s = await state();
    R.DT = {mode: s.nav.mode, camD: Math.round(s.cam.d)};
    log('DT', JSON.stringify(R.DT));
    assert('DT_back_home', s.nav.mode === 'home' && Math.abs(s.cam.d - 363) < 15, R.DT);
  }
}

// ---------- pinch zoom (two pointers spreading)
{
  const fd0 = (await nav()).fd;
  await ptr('pointerdown', 700, 450, 11);
  await ptr('pointerdown', 900, 450, 12);
  for (const [a, b] of [[660, 940], [625, 975], [590, 1010]]) {
    await ptr('pointermove', a, 450, 11);
    await ptr('pointermove', b, 450, 12);
    await renderTo(cur + 0.1, 0.1);
  }
  await ptr('pointerup', 590, 450, 11);
  await ptr('pointerup', 1010, 450, 12);
  await renderTo(cur + 1.5);
  const s = await state();
  R.P = {fdBefore: Math.round(fd0), fdAfter: Math.round(s.nav.fd), mode: s.nav.mode};
  log('P', JSON.stringify(R.P));
  assert('P_pinch_zoom_in', s.nav.fd < fd0 - 50, R.P);
  // back home for the follow test
  const spot2 = [180, 560];
  if (await pickIsNull(spot2[0], spot2[1])) { await tapAt(spot2[0], spot2[1]); await sleep(150); await tapAt(spot2[0], spot2[1]); await renderTo(cur + 3); }
}

// ---------- D: tap-to-follow a moving car
{
  const n = await pickCar(18, 26);
  assert('car_found', n !== null, {n});
  if (n !== null) {
    const proj = await projectCar(n);
    log('tap car', n, JSON.stringify(proj));
    await tapAt(proj.xy[0], proj.xy[1]);
    await renderTo(cur + 4);
    const s1 = await state();
    const p1 = await projectCar(n);
    const det = await detInfo();
    R.D1 = {sel: s1.sel, selVin: s1.selVin, expectedVin: proj.vin, camD: Math.round(s1.cam.d), det, carXY: p1?.xy?.map(Math.round)};
    await page.screenshot({path: path.join(OUTD, `${PREFIX}-D-follow.png`)});
    log('D1', JSON.stringify(R.D1));
    assert('D_follow_selected', s1.selVin === proj.vin && det.vis === 'visible' && det.title === proj.vin, R.D1);
    assert('D_camera_closed_in', s1.cam.d < 80, {camD: s1.cam.d});
    await renderTo(cur + 6);
    const s2 = await state();
    const p2 = await projectCar(n);
    R.D2 = {t: s2.t, selVin: s2.selVin, carXY: p2?.xy?.map(Math.round), drift: p1 && p2 ? Math.round(Math.hypot(p2.xy[0] - p1.xy[0], p2.xy[1] - p1.xy[1])) : null, started: s2.started, shipped: s2.shipped};
    log('D2', JSON.stringify(R.D2));
    assert('D_follow_stable', R.D2.drift !== null && R.D2.drift < 260, R.D2);
    assert('counters_advanced', s2.started >= R.A.started && s2.shipped >= R.A.shipped && s2.t > R.A.t, {from: [R.A.started, R.A.shipped, R.A.t], to: [s2.started, s2.shipped, s2.t]});
  }
}

R.errors = errors;
assert('zero_js_errors', errors.length === 0, {errors: errors.slice(0, 5)});
fs.writeFileSync(path.join(OUTD, `${PREFIX}-results.json`), JSON.stringify(R, null, 2));
log('DONE', JSON.stringify(Object.fromEntries(Object.entries(R.asserts).map(([k, v]) => [k, v.ok]))));
await browser.close();
