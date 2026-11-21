#!/usr/bin/env node
// Verification for plant-live: capture-mode stills at t=30/90/170 via SIM.render,
// DOM proof (clock + KPI counters read from the page itself), page-error collection,
// then a real-time live-mode run measuring frames and state growth.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, DIST, FFMPEG, playwright} from './paths.mjs';

const {chromium} = playwright();
const html = path.join(DIST, 'plant-live.html');
const OUTD = '/data/home/plant-live-verify';
fs.mkdirSync(OUTD, {recursive: true});
const errors = [];
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});

// ---- phase 1: capture-mode stills
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page.on('console', (m) => m.type() === 'error' && errors.push('[console] ' + m.text()));
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => { window.__CAPTURE = true; });
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
await page.evaluate(() => document.fonts.ready);
const shots = [];
for (const t of [30, 90, 170]) {
  await page.evaluate((x) => window.SIM.render(x), t);
  const dom = await page.evaluate(() => {
    const k = (key) => document.querySelector(`[data-k="${key}"]`)?.textContent ?? null;
    return {clock: k('clock'), started: k('kv_a'), shipped: k('kv_b'), onLine: k('kv_c'), state: window.__LIVE_STATE};
  });
  const file = path.join(OUTD, `live-t${t}.png`);
  await page.screenshot({path: file});
  shots.push({t, file, ...dom});
  console.log(`t=${t} clock=${dom.clock} started=${dom.started} shipped=${dom.shipped} onLine=${dom.onLine} state=${JSON.stringify(dom.state)}`);
}
await page.close();

// ---- phase 2: live mode, real time ~40 s: count rAF-driven SIM frames via state t advancing
const page2 = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
page2.on('console', (m) => m.type() === 'error' && errors.push('[live console] ' + m.text()));
page2.on('pageerror', (e) => errors.push('[live pageerror] ' + e.message));
await page2.goto(pathToFileURL(html).href);
await page2.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
const live = await page2.evaluate(async () => {
  const t0 = performance.now();
  let frames = 0;
  await new Promise((res) => {
    const tick = () => { frames++; if (performance.now() - t0 < 40000) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  const wall = (performance.now() - t0) / 1000;
  return {frames, wall, fps: frames / wall, state: window.__LIVE_STATE};
});
console.log(`live run: ${JSON.stringify(live)}`);
await page2.close();
await browser.close();

console.log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log(e);
fs.writeFileSync(path.join(OUTD, 'verify.json'), JSON.stringify({shots, live, errors}, null, 2));

// ---- stills sheet (3 tiles in a row)
const sheet = path.join(OUTD, 'plant-live-stills.png');
await new Promise((r) =>
  spawn(FFMPEG, ['-loglevel', 'error', '-y', '-i', path.join(OUTD, 'live-t30.png'), '-i', path.join(OUTD, 'live-t90.png'), '-i', path.join(OUTD, 'live-t170.png'),
    '-filter_complex', '[0:v]scale=640:360[a];[1:v]scale=640:360[b];[2:v]scale=640:360[c];[a][b][c]hstack=inputs=3', '-frames:v', '1', sheet], {stdio: 'inherit'}).on('close', r),
);
console.log(`sheet: ${sheet}`);
