// Paths and browser flags for the kit. Everything resolves from this folder, so the skill runs wherever it is installed.
// HARDENED (see SECURITY.md): no path or binary is taken from the environment. Binary names and locations are
// fixed below, dependencies always resolve to this folder's own node_modules, and output always lands in
// ./simulator-out of the folder you run from. Nothing here can be redirected by a stray environment variable.

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const FFMPEG = 'ffmpeg';
export const FFPROBE = 'ffprobe';
export const PYTHON = 'python3';

// three, esbuild, fonts and playwright: `npm ci --ignore-scripts` in this folder puts them here.
export const DEPS = path.join(ROOT, 'node_modules');
// The system Chromium only. A bundled browser is never downloaded in this hardened copy
// (`npm ci --ignore-scripts` and nothing else). If no system Chromium exists, CHROMIUM is
// undefined and capture fails with Playwright's own error instead of downloading anything.
const SYSTEM_CHROMIUM_CANDIDATES = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
export const CHROMIUM = SYSTEM_CHROMIUM_CANDIDATES.find((p) => fs.existsSync(p));
// Real GPU WebGL instead of a software rasteriser. On Windows d3d11 plus --force_high_performance_gpu keeps ANGLE off
// an integrated GPU when a discrete one exists. capture.mjs prints the GPU it got on every run.
export const CHROMIUM_ARGS = [
  ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
  '--force_high_performance_gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars',
];

// Builds and renders land in ./simulator-out of the folder you run from.
export const OUT = path.resolve('simulator-out');
export const DIST = path.join(OUT, 'dist');

export const fromDeps = (id) => createRequire(path.join(DEPS, 'x.js'))(id);
export const playwright = () => fromDeps('playwright');
