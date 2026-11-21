// Plantline LIVE: the toy car plant as an ordinary always-running simulator. No film, no loop:
// the runtime clock is effectively unbounded (24 h), bodies spawn on a 12.5 s takt and each one
// walks the hero's 50 s stage timeline at its own offset, so the line holds several cars at
// once. The UI counters (bodies started / cars shipped / on line now) only ever grow. Same
// models, colours, product UI and toy scale as plant-film; the film entry is untouched.
//
// INTERACTIVE (v2): the default camera is a wide establishing shot of the WHOLE plant — weld
// cell C4 at one end, the carrier yard at the other — and it stays there while nothing is
// selected. Tapping (pointerdown, touch included) raycasts the scene: tap a car and the kit's
// selection box, ground route and detail card follow THAT car with its live VIN/stage data;
// tap a station (weld cell, paint booth, assembly, QA dyno, carrier) and its own live card
// opens while the camera frames the station. Tap empty ground — or the tools column's home
// button, or the card's close button — and the view glides back to the whole plant. No
// director, no fake cursor: the selection is the visitor's, not the film's.
//
// FREE NAVIGATION (v3): the camera is the visitor's to move, not just to aim. Dragging
// pans across the plant (grab-the-world), a two-finger pinch or the mouse wheel dollies
// in and out around the ground point under the gesture, and either one lets go of a
// follow and lands in FREE framing; a double-tap on empty ground glides back HOME. The
// follow camera itself was reworked after it read as jerky on a real phone: it now aims
// at the car's velocity-led position instead of chasing its raw position, damps its
// height on a slower constant than its ground track, and never teleports after a long
// frame. The HUD text path is throttled too — full card/KPI/table writes happen on a
// 200 ms cadence or on a structural change, never per frame; only the selection pill's
// position and the detail bar's width still ride at frame rate (style writes, no text).
import * as THREE from 'three';
import {runSim} from '../kit/runtime.js';
import {TOY, createToyStage} from '../airport-shared/style.js';
import {createToyUI} from '../airport-shared/ui.js';
import {createSelection} from '../airport-shared/select.js';
import {thumb} from '../airport-shared/thumbs.js';
import {OPERATOR_AVATAR} from '../airport-shared/avatar.js';
import {T, buildLiveWorld} from './liveworld.js';
import {buildToyAGV, buildToyCarCarrier} from './plant.js';
import {buildToyCarBody, buildToyDyno, buildToyRobot} from './line.js';

const D2R = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => {
  const u = clamp(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => sm((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const fmtClock = (t) => {
  const s = Math.floor(t);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${sec}`;
};

export const UI_WORDS_LIVE = {
  brand: 'Plantline',
  search: 'Search VINs, robots, stations, AGVs...',
  user: ['Mila Novak', 'Plant Manager'],
  avatar: OPERATOR_AVATAR,
  kpis: [
    {ic: 'cube', k: 'Bodies started', key: 'a', v: '4', d: 'takt 12.5 s', s: 'line 1 · Northbay'},
    {ic: 'truck', k: 'Cars shipped', key: 'b', v: '0', d: 'carrier 24', s: 'loaded · yard'},
    {ic: 'clock', k: 'On line now', key: 'c', v: '4', d: 'live', s: 'weld → ship · line 1'},
  ],
};

const AZ = 38;
const EL = 36;

const SITES = {
  BS: ['C4', 'Body shop · Cell C4', '4 robots · welding'],
  PT: ['P2', 'Paint · Booth 2', 'Ocean Blue · 3-coat'],
  AS: ['A2', 'Assembly · Station A2', 'Wheels · seats · glass'],
  QA: ['Q1', 'QA · Rolling road', '1 car · testing'],
  YD: ['Y', 'Yard · Carrier 24', 'loading · live'],
  PL: ['P1', 'Northbay Plant · Line 1', '4 zones · live'],
};
const DROP = [['C4', 'Body shop · Cell C4', '4 robots · welding', 92], ['P2', 'Paint · Booth 2', '1 body in booth', 70], ['A2', 'Assembly · Station A2', 'wheels · trim', 64], ['Q1', 'QA · Rolling road', '1 car testing', 40], ['Y', 'Yard · Carrier 24', 'loading', 83]];

// the five tappable stations: the local-time window a car spends in each, the camera frame
// that holds the station, and the tag the selection pill shows over it.
const ST_WIN = {BS: [0, 12.6], PT: [12.6, 20.8], AS: [20.8, 35.4], QA: [35.4, 43.6], YD: [T.out[0], 48]};
const ST_CAM = {
  BS: {x: -58, z: 0, ty: 1.5, d: 56},
  PT: {x: -16, z: 0, ty: 1.5, d: 48},
  AS: {x: 27, z: 0, ty: 1.5, d: 60},
  QA: {x: 68, z: 0, ty: 1.5, d: 54},
  YD: {x: 110, z: 0, ty: 2, d: 80},
};
const ST_TAG = {BS: 'Cell C4', PT: 'Booth 2', AS: 'Station A2', QA: 'QA 01', YD: 'Carrier 24'};

export function runToyPlantLive() {
  return runSim({duration: 86400, fps: 60, theme: 'light', hud: {enabled: false, title: 'plantline live', subtitle: ''}, director: {enabled: false}, watermark: ''}, async ({canvas, capture}) => {
    const app = document.getElementById('app');
    const st = createToyStage(canvas, {fov: 28});
    const W = buildLiveWorld();
    st.scene.add(W.root);
    const ui = createToyUI(app, UI_WORDS_LIVE, {});
    const marks = createSelection(st.scene, st);
    const detEl = ui.el.querySelector('.det');
    const fit = () => (app.style.transform = `scale(${Math.min(innerWidth / 1600, innerHeight / 900)})`);
    const resize = () => {
      fit();
      st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    };
    resize();

    const car = (() => {
      const c = buildToyCarBody({color: TOY.blue, number: 'NB7E 004812'});
      c.setBuild(1);
      c.setPaint(1);
      c.setGlass(1);
      c.setWheels(1);
      c.setInterior(1);
      return c.group;
    })();
    const TH = {
      car: thumb(car),
      paint: thumb(buildToyRobot({tool: 'paint', number: '07'}).group),
      wheel: thumb(buildToyRobot({tool: 'wheel', number: '05'}).group),
      agv: thumb(buildToyAGV({number: '12', rack: 'seats'}).group),
      dyno: thumb(buildToyDyno().group, {pad: 0.95}),
      carrier: thumb(buildToyCarCarrier({livery: 'aurora', number: '24'}).group, {pad: 0.9}),
      weld: thumb(buildToyRobot({tool: 'weld', number: '01'}).group),
    };

    // ---------------------------------------------------------- the wide home camera, fitted to the plant
    // The whole line in one frame: press/C4 (x -94) to the end of the carrier yard (x 142),
    // the hall and yard strip in z, the hall roof in y. The distance is solved once, on paper
    // (a scratch perspective camera, no renders), so every corner of that box lands inside
    // the 1600x900 frame with a margin under the top bar.
    const fitCam = new THREE.PerspectiveCamera(28, 1600 / 900, 5, 2000);
    const projWith = (c, x, y, z) => {
      const el = EL * D2R;
      fitCam.position.set(c.x + c.d * Math.cos(el) * Math.sin(c.az), c.ty + c.d * Math.sin(el), c.z + c.d * Math.cos(el) * Math.cos(c.az));
      fitCam.lookAt(c.x, c.ty, c.z);
      fitCam.setViewOffset(1600, 900, -(c.sx || 0), -(c.sy || 0), 1600, 900);
      fitCam.updateMatrixWorld();
      const v = new THREE.Vector3(x, y, z).project(fitCam);
      return [(v.x * 0.5 + 0.5) * 1600, (-v.y * 0.5 + 0.5) * 900, v.z];
    };
    const HOME_BASE = {x: 23, z: 2, ty: 0.8, az: AZ * D2R, sx: 0, sy: 0};
    const PLANT_CORNERS = [];
    for (const x of [-94, 142]) for (const z of [-40, 44]) for (const y of [0, 16]) PLANT_CORNERS.push([x, y, z]);
    const fitsAt = (d) =>
      PLANT_CORNERS.every(([x, y, z]) => {
        const [px, py, pz] = projWith({...HOME_BASE, d}, x, y, z);
        return pz < 1 && px > 24 && px < 1576 && py > 82 && py < 884;
      });
    let homeD = 120;
    while (homeD < 640 && !fitsAt(homeD)) homeD *= 1.06;
    const HOME = {...HOME_BASE, d: homeD};

    // ---------------------------------------------------------- tap-to-follow picking
    // Every tappable thing registers its root group; a pointerdown raycasts those roots and
    // the first visible hit wins. Cars register by pool slot (the spawn using the slot is
    // resolved at tap time); station equipment registers by station id.
    const bodyByName = Object.fromEntries(W.bodies.map((b) => [b.name, b.g]));
    const pickRoots = [];
    const regPick = (obj, ent) => {
      if (!obj) return;
      obj.userData.__pick = ent;
      pickRoots.push(obj);
    };
    for (let i = 0; i < W.live.poolSize(); i++) {
      regPick(bodyByName[`car${i}`], {kind: 'car', slot: i});
      regPick(bodyByName[`skid${i}`], {kind: 'car', slot: i});
    }
    for (const [name, id] of [
      ['weld0', 'BS'], ['weld1', 'BS'], ['weld2', 'BS'], ['weld3', 'BS'], ['press', 'BS'],
      ['paint0', 'PT'], ['paint1', 'PT'],
      ['wheel0', 'AS'], ['wheel1', 'AS'], ['grip', 'AS'], ['agv', 'AS'], ['agvLoop0', 'AS'], ['agvLoop1', 'AS'],
      ['dyno', 'QA'], ['lift', 'QA'],
      ['carrier', 'YD'],
    ]) regPick(bodyByName[name], {kind: 'station', id});
    regPick(W.objects.booth.group, {kind: 'station', id: 'PT'});

    let sel = null; // {kind:'car', n} | {kind:'station', id} | null (null = the whole plant)
    let curT = 0;
    const ray = new THREE.Raycaster();
    const pickAt = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const px = ((clientX - rect.left) / rect.width) * 1600;
      const py = ((clientY - rect.top) / rect.height) * 900;
      ray.setFromCamera(new THREE.Vector2((px / 1600) * 2 - 1, -(py / 900) * 2 + 1), st.camera);
      for (const h of ray.intersectObjects(pickRoots, true)) {
        let o = h.object;
        let rootO = null;
        let hidden = false;
        while (o) {
          if (o.visible === false) {
            hidden = true;
            break;
          }
          if (o.userData.__pick) {
            rootO = o;
            break;
          }
          o = o.parent;
        }
        if (hidden || !rootO) continue;
        const ent = rootO.userData.__pick;
        if (ent.kind === 'car') {
          const c = W.live.activeCars(curT).find((cc) => cc.slot === ent.slot);
          if (c && c.lt < T.out[1]) return {kind: 'car', n: c.n};
          continue; // a pooled body that is not on the line right now — look further down the hits
        }
        return {kind: 'station', id: ent.id};
      }
      return null;
    };
    canvas.style.touchAction = 'none';

    // ---------------------------------------------------------- free navigation (v3)
    // FREE framing state: the visitor's own target + distance, used whenever nothing is
    // selected and the home view has been left. Gestures write these; render() damps the
    // camera onto them. Entering FREE (drag / pinch / wheel) releases any follow, and
    // the state is seeded from the camera's current pose so nothing jumps.
    const D_MIN = 22;
    const PAN_BOX = {x0: -130, x1: 178, z0: -72, z1: 80}; // plant box (-94..142, -40..44) + margin
    let freeMode = false;
    const freeTarget = {x: HOME.x, z: HOME.z};
    let freeD = HOME.d;
    const goHome = () => {
      sel = null;
      freeMode = false;
    };
    const enterFree = () => {
      if (freeMode) return;
      freeMode = true;
      sel = null;
      if (cam) {
        freeTarget.x = cam.x;
        freeTarget.z = cam.z;
        freeD = cam.d;
      } else {
        freeTarget.x = HOME.x;
        freeTarget.z = HOME.z;
        freeD = HOME.d;
      }
    };
    const clampFree = () => {
      freeTarget.x = Math.min(PAN_BOX.x1, Math.max(PAN_BOX.x0, freeTarget.x));
      freeTarget.z = Math.min(PAN_BOX.z1, Math.max(PAN_BOX.z0, freeTarget.z));
    };
    // The ground point under a client position for an arbitrary camera state, via a
    // scratch camera built exactly like the stage's frame(). The offset of that point
    // from the state's target does not depend on the target — the fact the grab-pan and
    // zoom-centre maths below are built on.
    const scratchCam = new THREE.PerspectiveCamera(28, 1600 / 900, 5, 2000);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundAt = (clientX, clientY, s) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const px = ((clientX - rect.left) / rect.width) * 1600;
      const py = ((clientY - rect.top) / rect.height) * 900;
      const el = EL * D2R;
      const az = AZ * D2R;
      scratchCam.position.set(s.x + s.d * Math.cos(el) * Math.sin(az), s.ty + s.d * Math.sin(el), s.z + s.d * Math.cos(el) * Math.cos(az));
      scratchCam.lookAt(s.x, s.ty, s.z);
      scratchCam.setViewOffset(1600, 900, -(s.sx || 0), -(s.sy || 0), 1600, 900);
      scratchCam.updateMatrixWorld();
      ray.setFromCamera(new THREE.Vector2((px / 1600) * 2 - 1, -(py / 900) * 2 + 1), scratchCam);
      const out = new THREE.Vector3();
      return ray.ray.intersectPlane(groundPlane, out) ? out : null;
    };
    const freeState = () => ({x: freeTarget.x, ty: 1, z: freeTarget.z, d: freeD, sx: 0, sy: 0});
    const gOf = (cx, cy) => groundAt(cx, cy, {...freeState(), x: 0, z: 0});
    // change the free distance while the ground point under (cx, cy) stays put
    const zoomAround = (cx, cy, nd) => {
      const before = groundAt(cx, cy, freeState());
      freeD = clamp(nd, D_MIN, HOME.d);
      if (before) {
        const after = groundAt(cx, cy, freeState());
        if (after) {
          freeTarget.x += before.x - after.x;
          freeTarget.z += before.z - after.z;
          clampFree();
        }
      }
    };

    // A short tap selects/deselects, exactly the v2 semantics; in FREE (a state v2 did
    // not have) a single empty tap is inert and a double-tap on empty ground goes HOME.
    let lastEmptyTap = -1e9;
    const handleTap = (cx, cy) => {
      const hit = pickAt(cx, cy);
      if (hit) {
        sel = hit;
        freeMode = false;
        lastEmptyTap = -1e9;
        return;
      }
      if (sel) {
        goHome();
        lastEmptyTap = -1e9;
        return;
      }
      if (freeMode) {
        const now = performance.now();
        if (now - lastEmptyTap < 350) {
          goHome();
          lastEmptyTap = -1e9;
        } else lastEmptyTap = now;
      }
    };

    const pointers = new Map(); // pointerId -> {x, y}
    let gesture = null;
    canvas.addEventListener('pointerdown', (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        enterFree();
        gesture = {pinching: true, moved: true, pinchD0: freeD, pinchDist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), lastMx: (a.x + b.x) / 2, lastMy: (a.y + b.y) / 2};
      } else if (pointers.size === 1) {
        gesture = {pinching: false, moved: false, reGrab: false, panW: null, downX: e.clientX, downY: e.clientY, downT: performance.now()};
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || !gesture) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (gesture.pinching) {
        if (pointers.size !== 2) return;
        const [a, b] = [...pointers.values()];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const gPrev = gOf(gesture.lastMx, gesture.lastMy);
        const gNow = gOf(mx, my);
        if (gPrev && gNow) {
          freeTarget.x += gPrev.x - gNow.x;
          freeTarget.z += gPrev.z - gNow.z;
          clampFree();
        }
        gesture.lastMx = mx;
        gesture.lastMy = my;
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        zoomAround(mx, my, gesture.pinchD0 * (gesture.pinchDist0 / dist));
        return;
      }
      // one pointer: a drag starts past a 6 px threshold (or at once for the finger
      // left behind by a pinch, whose anchor was reset when the other finger lifted)
      if (!gesture.panW && (gesture.reGrab || Math.hypot(e.clientX - gesture.downX, e.clientY - gesture.downY) > 6)) {
        enterFree();
        const g0 = gOf(gesture.downX, gesture.downY);
        gesture.panW = g0 ? {x: freeTarget.x + g0.x, z: freeTarget.z + g0.z} : {x: freeTarget.x, z: freeTarget.z};
        gesture.moved = true;
      }
      if (gesture.panW) {
        const g = gOf(e.clientX, e.clientY);
        if (g) {
          freeTarget.x = gesture.panW.x - g.x;
          freeTarget.z = gesture.panW.z - g.z;
          clampFree();
        }
      }
    });
    const endPointer = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!gesture) return;
      if (gesture.pinching) {
        if (pointers.size === 1) {
          const [r] = [...pointers.values()];
          gesture = {pinching: false, moved: true, reGrab: true, panW: null, downX: r.x, downY: r.y, downT: performance.now()};
        } else if (pointers.size === 0) gesture = null;
        return;
      }
      const g = gesture;
      if (pointers.size === 0) gesture = null;
      if (!g.moved && performance.now() - g.downT < 600) handleTap(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        enterFree();
        zoomAround(e.clientX, e.clientY, freeD * Math.exp(e.deltaY * 0.0011));
      },
      {passive: false},
    );
    // the kit's own home glyph (tools column) and the detail card's close button become real:
    // the overlay is pointer-events:none, so just these two controls opt back in.
    const wireDeselect = (el2, label) => {
      if (!el2) return;
      el2.style.pointerEvents = 'auto';
      el2.style.cursor = 'pointer';
      el2.title = label;
      el2.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        goHome();
      });
    };
    wireDeselect(ui.el.querySelector('[data-k="tool6"]'), 'Whole plant');
    wireDeselect(ui.el.querySelectorAll('.det .btns b')[2], 'Close');
    if (detEl) detEl.style.visibility = 'hidden';

    // ---------------------------------------------------------- camera state
    let cam = null;
    let lastT = null;
    // the followed car's low-passed velocity (for the look-ahead in render)
    const fol = {n: null, x: 0, z: 0, vx: 0, vz: 0};
    // HUD write throttle: full ui.update on structural change or a 200 ms cadence
    let hudSig = null;
    let hudLast = -Infinity;
    const barEl = ui.el.querySelector('[data-k="dBar"]');

    // ---------------------------------------------------------- what the page shows (per car local time)
    const siteAt = (t) => (t < 12.6 ? 'BS' : t < 20.8 ? 'PT' : t < 35.4 ? 'AS' : t < 43.6 ? 'QA' : 'YD');
    const wheelsOn = (t) => (t >= T.fitFL) + (t >= T.fitFR) + (t >= T.fitRL) + (t >= T.fitRR);
    const stageOf = (t) =>
      t < T.toPaint[0] ? ['Welding', 'Cell C4 · 4 robots', 'in'] :
      t < T.spray[0] ? ['To paint', 'Line 1 · to booth 2', 'in'] :
      t < T.boothOut[1] ? ['Painting', 'Booth 2 · Ocean Blue', 'in'] :
      t < T.toWheels[1] ? ['To assembly', 'Line 1 · to station A2', 'in'] :
      t < T.toTrim[0] ? ['Wheels', `Station A2 · ${wheelsOn(t)}/4 on`, 'in'] :
      t < T.toEnd[0] ? ['Trim', 'Station A2 · seats, glass', 'in'] :
      t < T.test[0] ? ['To QA', 'Lift · rolling road', 'in'] :
      t < T.test[1] ? ['Testing', 'QA 01 · rolling road', 'in'] :
      t < T.out[1] ? ['Shipping', 'To carrier 24 · slot 3', 'go'] : ['Loaded', 'Carrier 24 · slot 3', 'go'];
    const progress = (t) => clamp(t / T.out[1]);
    const carCard = (lt, vin) => {
      const pc = (a, b) => clamp((lt - a) / (b - a));
      const [s, txt, cls] = stageOf(lt);
      return {pop: 1, thumb: TH.car, org: 'LINE 1 · NORTHBAY', title: vin, sub: 'Model E · Ocean Blue', stat: s, statCls: cls, statText: txt, prog: progress(lt), progText: `${Math.round(100 * progress(lt))}%`, rows: [['Welds', `${fmt(4312 * pc(...T.weld))} / 4,312`], ['Paint', lt < T.paint[0] ? 'E-coat' : lt < T.paint[1] ? `${Math.round(100 * pc(...T.paint))}%` : 'Ocean Blue'], ['Wheels', `${wheelsOn(lt)} / 4`], ['Battery', '62%'], ['Order', 'Dealer · Oslo', 1], ['Ship', lt < T.out[1] ? 'Carrier 24 · next slot' : 'Aboard · shipped']]};
    };
    // a station's own card, all of it read from the live world at time t: the car in the
    // station right now, what the equipment is doing to it, and the plant's running counts.
    const stationCard = (id, t) => {
      const sc = W.live.stationCar(t, ...ST_WIN[id]);
      const lt = sc ? sc.lt : 0;
      const vin = sc ? (W.live.activeCars(t).find((c) => c.n === sc.n)?.vin ?? '—') : '—';
      const pc = (a, b) => clamp((lt - a) / (b - a));
      if (id === 'BS') {
        const welding = !!sc && lt > T.weld[0] && lt < T.weld[1];
        return {pop: 1, thumb: TH.weld, org: 'BODY SHOP · LINE 1', title: 'Cell C4', sub: 'Body framing · 4 robots', stat: welding ? 'Welding' : sc ? 'In cell' : 'Idle', statCls: welding ? 'go' : sc ? 'in' : 'wait', statText: sc ? `${vin} · body in cell` : 'waiting for the next body', prog: sc ? clamp(lt / ST_WIN.BS[1]) : 0, progText: sc ? `${Math.round(100 * clamp(lt / ST_WIN.BS[1]))}%` : '0%', rows: [['Body', vin], ['Welds', sc ? `${fmt(4312 * pc(...T.weld))} / 4,312` : '—'], ['Robots', 'R-01 – R-04 · welding'], ['Next body', `${(W.live.TAKT - (t % W.live.TAKT)).toFixed(1)} s`]]};
      }
      if (id === 'PT') {
        const spraying = !!sc && lt > T.spray[0] && lt < T.spray[1];
        return {pop: 1, thumb: TH.paint, org: 'PAINT · LINE 1', title: 'Booth 2', sub: 'Ocean Blue · 3-coat', stat: spraying ? 'Spraying' : sc ? 'In booth' : 'Standby', statCls: spraying ? 'go' : sc ? 'in' : 'wait', statText: sc ? `${vin} · in booth 2` : 'no body in the booth', prog: sc ? clamp((lt - ST_WIN.PT[0]) / (ST_WIN.PT[1] - ST_WIN.PT[0])) : 0, progText: sc ? `${Math.round(100 * clamp((lt - ST_WIN.PT[0]) / (ST_WIN.PT[1] - ST_WIN.PT[0])))}%` : '0%', rows: [['Body', vin], ['Paint', sc ? `${Math.round(100 * pc(...T.paint))}% · Ocean Blue` : '—'], ['Doors', sc ? (lt < T.boothShut[1] || lt > T.boothOut[0] ? 'Open' : 'Closed') : 'Closed'], ['Robots', 'R-07 · R-08 · spray']]};
      }
      if (id === 'AS') {
        return {pop: 1, thumb: TH.wheel, org: 'ASSEMBLY · LINE 1', title: 'Station A2', sub: 'Wheels · seats · glass', stat: sc ? (lt < T.toTrim[0] ? 'Fitting wheels' : 'Trim') : 'Idle', statCls: sc ? 'go' : 'wait', statText: sc ? `${vin} · at station A2` : 'no car at the station', prog: sc ? clamp((lt - ST_WIN.AS[0]) / (ST_WIN.AS[1] - ST_WIN.AS[0])) : 0, progText: sc ? `${Math.round(100 * clamp((lt - ST_WIN.AS[0]) / (ST_WIN.AS[1] - ST_WIN.AS[0])))}%` : '0%', rows: [['Car', vin], ['Wheels', sc ? `${wheelsOn(lt)} / 4` : '—'], ['AGV-12', sc && lt > T.agv[0] ? (lt < T.agv[1] ? 'Delivering seats' : 'Docked at A2') : 'Standing by'], ['Trim', sc && lt > T.toTrim[0] ? 'Seats · glass' : '—']]};
      }
      if (id === 'QA') {
        const testing = !!sc && lt > T.test[0] && lt < T.test[1];
        return {pop: 1, thumb: TH.dyno, org: 'QA · LINE 1', title: 'Rolling road', sub: 'QA 01 · dyno test', stat: testing ? 'Testing' : sc && lt >= T.test[1] ? 'Passed' : sc ? 'To QA' : 'Idle', statCls: testing ? 'in' : sc && lt >= T.test[1] ? 'go' : sc ? 'in' : 'wait', statText: sc ? `${vin} · on the rolling road` : 'no car on the dyno', prog: sc ? clamp((lt - ST_WIN.QA[0]) / (ST_WIN.QA[1] - ST_WIN.QA[0])) : 0, progText: sc ? `${Math.round(100 * clamp((lt - ST_WIN.QA[0]) / (ST_WIN.QA[1] - ST_WIN.QA[0])))}%` : '0%', rows: [['Car', vin], ['Rolling road', sc ? `${Math.round(100 * pc(...T.test))}%` : '—'], ['Result', sc ? (lt >= T.test[1] ? 'Passed' : 'Running') : '—'], ['Dyno', 'QA 01']]};
      }
      return {pop: 1, thumb: TH.carrier, org: 'YARD · LINE 1', title: 'Carrier 24', sub: 'Car carrier · loading', stat: sc ? 'Loading' : 'Waiting', statCls: sc ? 'in' : 'wait', statText: sc ? `${vin} · driving aboard` : 'waiting for the next car', prog: sc ? clamp((lt - ST_WIN.YD[0]) / (ST_WIN.YD[1] - ST_WIN.YD[0])) : 0, progText: sc ? `${Math.round(100 * clamp((lt - ST_WIN.YD[0]) / (ST_WIN.YD[1] - ST_WIN.YD[0])))}%` : '0%', rows: [['Loading', vin], ['Cars shipped', fmt(W.live.shippedCount(t))], ['Carrier', '24 · Aurora'], ['Ramp', sc ? 'Down · loading' : 'Folded']]};
    };
    const trackFor = (lt, vin) => {
      const st2 = (a, b) => (lt < a ? '' : lt < b ? 'on' : 'done');
      const steps = [['Body', 'Cell C4', 'box', st2(0, T.toPaint[0])], ['Paint', 'Booth 2', 'load', st2(T.toPaint[0], T.boothOut[1])], ['Assembly', 'Station A2', 'doc', st2(T.boothOut[1], T.toEnd[0])], ['Quality', 'QA 01', 'check', st2(T.toEnd[0], T.test[1])], ['Shipped', 'Carrier 24', 'truck', lt < T.test[1] ? '' : 'on']];
      const fill = lt < T.toPaint[0] ? 0.04 : lt < T.boothOut[1] ? 0.25 : lt < T.toEnd[0] ? 0.5 : lt < T.test[1] ? 0.75 : 1;
      const [s, txt, cls] = stageOf(lt);
      return {title: 'Build Tracking', meta: `VIN ${vin} · Model E`, fill, steps, ship: {thumb: TH.car, id: vin, to: 'To: Dealer Oslo · Carrier 24', stat: s, statCls: cls, meta: txt}};
    };
    const tableFor = (site, lt) => {
      if (site === 'BS')
        return {tabs: [['Cells', '6/6'], ['Robots', '24'], ['AGVs', '18']], active: 1, site: 'Body shop', rows: [
          {id: 'R-01', org: 'Cell C4', dot: TOY.blue, where: 'Side frame L', stat: lt < T.weld[1] ? 'Welding' : 'Idle', cls: lt < T.weld[1] ? 'go' : 'wait', p: 100 * clamp(lt / T.weld[1]), pt: `${Math.round(100 * clamp(lt / T.weld[1]))}%`},
          {id: 'R-02', org: 'Cell C4', dot: TOY.blue, where: 'Side frame R', stat: lt < T.weld[1] ? 'Welding' : 'Idle', cls: lt < T.weld[1] ? 'go' : 'wait', p: 100 * clamp(lt / T.weld[1]), pt: `${Math.round(100 * clamp(lt / T.weld[1]))}%`},
          {id: 'R-21', org: 'Cell C5', dot: TOY.teal, where: 'Line 2 · roof', stat: 'Welding', cls: 'go', p: 40, pt: '40%'},
          {id: 'P-01', org: 'Press line', dot: TOY.orange, where: 'Door outer RH', stat: 'Stamping', cls: 'in', p: null, pt: '18/min'},
        ]};
      if (site === 'PT')
        return {tabs: [['Booths', '2/2'], ['Robots', '4'], ['Ovens', '1']], active: 1, site: 'Paint', rows: [
          {id: 'R-07', org: 'Booth 2', dot: TOY.blue, where: 'Roof · bonnet', stat: lt < T.spray[1] ? 'Spraying' : 'Done', cls: 'go', p: 100 * clamp((lt - T.paint[0]) / 3.6), pt: `${Math.round(118 * clamp((lt - T.paint[0]) / 3.6))} µm`},
          {id: 'R-08', org: 'Booth 2', dot: TOY.blue, where: 'Sides · boot', stat: lt < T.spray[1] ? 'Spraying' : 'Done', cls: 'go', p: 100 * clamp((lt - T.paint[0]) / 3.6), pt: `${Math.round(118 * clamp((lt - T.paint[0]) / 3.6))} µm`},
          {id: 'OV-1', org: 'Cure oven', dot: TOY.orange, where: '140 °C', stat: 'Ready', cls: 'wait', p: null, pt: '20 min'},
          {id: 'B-1', org: 'Booth 1', dot: TOY.teal, where: 'Arctic White', stat: 'Cleaning', cls: 'in', p: null, pt: '4 min'},
        ]};
      if (site === 'AS')
        return {tabs: [['Stations', '8/8'], ['Robots', '12'], ['AGVs', '3']], active: 2, site: 'Assembly', rows: [
          {id: 'AGV-12', org: 'Seats', dot: TOY.blue, where: lt < T.agv[1] ? 'To A2' : 'At A2', stat: lt < T.agv[1] ? 'Delivering' : 'Docked', cls: lt < T.agv[1] ? 'in' : 'go', p: null, pt: lt < T.agv[1] ? `${Math.max(1, Math.round(T.agv[1] - lt))} s` : 'docked'},
          {id: 'AGV-14', org: 'Boxes', dot: TOY.teal, where: 'Aisle 3', stat: 'En route', cls: 'in', p: null, pt: 'loop'},
          {id: 'R-05', org: 'Station A2', dot: TOY.blue, where: 'Wheels', stat: wheelsOn(lt) < 4 ? 'Fitting' : 'Done', cls: 'go', p: 25 * wheelsOn(lt), pt: `${wheelsOn(lt)}/4`},
          {id: 'R-09', org: 'Station A2', dot: TOY.blue, where: 'Seats · glass', stat: lt < T.glass[1] ? 'Waiting' : 'Done', cls: lt < T.glass[1] ? 'wait' : 'go', p: null, pt: lt < T.glass[1] ? 'next' : 'done'},
        ]};
      return {tabs: [['Tests', '3/3'], ['Carriers', '2'], ['Yard', '48']], active: 0, site: site === 'YD' ? 'Yard' : 'QA', rows: [
        {id: 'QA 01', org: 'Rolling road', dot: TOY.blue, where: 'Leader car', stat: lt < T.test[1] ? 'Testing' : 'Passed', cls: lt < T.test[1] ? 'in' : 'go', p: 100 * clamp((lt - T.test[0]) / (T.test[1] - T.test[0])), pt: lt < T.test[1] ? 'run' : 'pass'},
        {id: 'QA 02', org: 'Water test', dot: TOY.teal, where: 'Line 1', stat: 'Passed', cls: 'go', p: 100, pt: 'pass'},
        {id: 'CR-24', org: 'Carrier 24', dot: TOY.blue, where: 'Yard · ramp', stat: 'Loading', cls: 'in', p: null, pt: 'live'},
        {id: 'CR-31', org: 'Carrier 31', dot: TOY.orange, where: 'To plant', stat: 'At gate', cls: 'wait', p: null, pt: '6 min'},
      ]};
    };
    const underUI = ([x, y]) => (x > 1130 && y < 450) || (x > 1080 && y > 620) || (x < 1000 && y > 720) || (x < 780 && y < 185);
    const P = (o) => o.getWorldPosition(new THREE.Vector3());
    const ST_BOX = {BS: bodyByName.weld0, PT: W.objects.booth.group, AS: bodyByName.wheel0, QA: W.objects.dyno.group, YD: W.objects.carrier.group};
    const stationAnchor = (id) => {
      if (id === 'PT') return W.anchors.booth();
      if (id === 'QA') return W.anchors.dyno();
      if (id === 'YD') return W.anchors.carrier();
      if (id === 'AS') return W.anchors.wheeler();
      return P(bodyByName.weld0).add(new THREE.Vector3(0, 5, 0));
    };

    window.TOYPLANTLIVE = {st, W, home: HOME, sel: () => sel, pickAt, nav: () => ({freeMode, fx: freeTarget.x, fz: freeTarget.z, fd: freeD})};
    return {
      resize,
      render(t) {
        curT = t;
        W.pose(t);
        const L = W.live.leaderAt(t);
        const lt = L ? L.lt : 0;
        const vin = L ? L.vin : '—';
        // resolve the tap selection against the live line: a followed car is released
        // the moment it is aboard the carrier (counted shipped), back to the whole plant.
        let selCar = null;
        if (sel && sel.kind === 'car') {
          selCar = W.live.activeCars(t).find((c) => c.n === sel.n) ?? null;
          if (!selCar || selCar.lt >= T.out[1]) {
            sel = null;
            selCar = null;
          }
        }
        const selStation = sel && sel.kind === 'station' ? sel.id : null;
        marks.box(selCar ? selCar.group : selStation ? ST_BOX[selStation] : null, 1);
        marks.route(selCar ? W.routes.carFor(selCar.n, t) : null, 1, 1);
        marks.update();
        // the camera: wide on the whole plant by default (a breath of drift, nothing more);
        // on a selection it glides to the car and tracks it, or frames the station; in
        // FREE it rides the visitor's own target + distance.
        const dt = lastT === null ? 0 : t - lastT;
        let desired;
        let mode;
        if (selCar) {
          mode = 'follow';
          const p = selCar.group.position;
          // aim where the car is heading, not where it is: the low-passed velocity leads
          // the target by roughly the ground-track time constant, which cancels the
          // chase lag at line speed — and as the car slows into a station the lead
          // decays with the velocity, so the camera settles onto the car instead of
          // gliding past it and coming back.
          if (fol.n === selCar.n && dt > 0.001 && dt < 1) {
            const kv = 1 - Math.exp(-dt / 0.35);
            fol.vx += ((p.x - fol.x) / dt - fol.vx) * kv;
            fol.vz += ((p.z - fol.z) / dt - fol.vz) * kv;
          } else if (fol.n !== selCar.n) {
            fol.vx = 0;
            fol.vz = 0;
          }
          fol.n = selCar.n;
          fol.x = p.x;
          fol.z = p.z;
          let lx = fol.vx * 0.55;
          let lz = fol.vz * 0.55;
          const ll = Math.hypot(lx, lz);
          if (ll > 6) {
            lx *= 6 / ll;
            lz *= 6 / ll;
          }
          desired = {x: p.x + lx, z: p.z + lz, ty: p.y + 0.9, d: 34, az: AZ * D2R, sx: -110, sy: 26};
        } else if (selStation) {
          mode = 'station';
          desired = {...ST_CAM[selStation], az: AZ * D2R, sx: -110, sy: 26};
        } else if (freeMode) {
          mode = 'free';
          desired = {x: freeTarget.x, z: freeTarget.z, ty: 1, d: freeD, az: AZ * D2R, sx: 0, sy: 0};
        } else {
          mode = 'home';
          desired = {x: HOME.x, z: HOME.z, ty: HOME.ty, d: HOME.d, az: AZ * D2R + Math.sin(t * 0.025) * 0.02, sx: 0, sy: 0};
        }
        if (!selCar) fol.n = null;
        if (!cam || lastT === null || t < lastT) cam = desired;
        else {
          // per-field time constants, and the damping step is clamped: a long frame (a
          // hitch, a backgrounded tab) must never teleport the camera — v2 snapped
          // cam = desired whenever dt > 1.5 s, which on a struggling renderer is
          // exactly when the follow jumped. The height damps slowest of all: the car's
          // y is piecewise (lift, dyno, ramp), and feeding it straight into lookAt
          // stepped the aim vertically.
          const dd = Math.min(Math.max(dt, 0), 0.25);
          const TAU =
            mode === 'free'
              ? {x: 0.12, z: 0.12, ty: 0.12, d: 0.15, az: 0.15, sx: 0.15, sy: 0.15}
              : mode === 'follow'
                ? {x: 0.6, z: 0.6, ty: 0.9, d: 0.8, az: 0.6, sx: 0.6, sy: 0.6}
                : {x: 1.1, z: 1.1, ty: 1.1, d: 1.1, az: 1.1, sx: 1.1, sy: 1.1};
          for (const f of ['x', 'z', 'ty', 'd', 'az', 'sx', 'sy']) cam[f] = lerp(cam[f], desired[f], 1 - Math.exp(-dd / TAU[f]));
        }
        lastT = t;
        st.frame({tx: cam.x, ty: cam.ty, tz: cam.z, az: cam.az, el: EL * D2R, d: cam.d, fov: 28, sx: cam.sx, sy: cam.sy});
        const tags = [];
        if (selCar) {
          const a = st.project(selCar.group.position.clone().add(new THREE.Vector3(0, 2.4, 0)));
          const [txt] = stageOf(selCar.lt);
          if (a && !underUI(a)) tags.push({kind: 'sel', x: a[0], y: a[1], text: selCar.vin, sub: txt, a: 1});
        } else if (selStation) {
          const a = st.project(stationAnchor(selStation));
          if (a && !underUI(a)) tags.push({kind: 'sel', x: a[0], y: a[1], text: ST_TAG[selStation], sub: stationCard(selStation, t).stat, a: 1});
        }
        const started = W.live.startedCount(t);
        const shipped = W.live.shippedCount(t);
        const onLine = W.live.onLineCount(t);
        let card;
        let track;
        let table;
        let site;
        if (selCar) {
          card = carCard(selCar.lt, selCar.vin);
          track = trackFor(selCar.lt, selCar.vin);
          table = tableFor(siteAt(selCar.lt), selCar.lt);
          site = SITES[siteAt(selCar.lt)];
        } else if (selStation) {
          card = stationCard(selStation, t);
          const sc = W.live.stationCar(t, ...ST_WIN[selStation]);
          const scCar = sc ? W.live.activeCars(t).find((c) => c.n === sc.n) : null;
          track = scCar ? trackFor(scCar.lt, scCar.vin) : trackFor(lt, vin);
          table = tableFor(selStation, sc ? sc.lt : lt);
          site = SITES[selStation];
        } else {
          card = {...carCard(lt, vin), pop: 0};
          track = trackFor(lt, vin);
          table = tableFor(siteAt(lt), lt);
          site = SITES.PL;
        }
        if (detEl) {
          const vis = sel ? 'visible' : 'hidden';
          if (detEl.style.visibility !== vis) detEl.style.visibility = vis;
        }
        // Full HUD writes are the expensive part of a frame (the kit rebuilds the
        // tracker steps, the detail rows and the fleet table as innerHTML whenever a
        // displayed number moves). They now happen on a structural change — selection,
        // card subject or state, site, counts — or on a 200 ms cadence for the
        // fast-moving fields, and the first frame always sends, so the KPIs and the
        // clock are populated from the first second. Between sends, only two style
        // writes ride at frame rate: the selection pill's position and the detail
        // card's progress-bar width. The counts themselves are computed from t at
        // send time, so they stay exact.
        const sig = [selCar ? `c${selCar.n}` : (selStation ?? '-'), card.title, card.stat, site[0], started, shipped, onLine, track.steps.map((s2) => s2[3]).join(''), table.site].join('|');
        if (sig !== hudSig || t - hudLast >= 0.2) {
          hudSig = sig;
          hudLast = t;
          ui.update({
            clock: fmtClock(t),
            site,
            kpi: {
              a: [fmt(started), 'takt 12.5 s', 'bodies started · line 1'],
              b: [fmt(shipped), 'carrier 24', 'cars shipped · line 1'],
              c: [fmt(onLine), 'live', 'cars on line · now'],
            },
            card,
            track,
            table,
            drop: {open: 0, sites: DROP, on: 1},
            tool: sel ? -1 : 6,
            tags,
            cursor: [-100, -100],
            hand: false,
            click: 0,
          });
        }
        if (tags.length) {
          const node = ui.el.querySelector('.tags')?.children[0];
          if (node && node.style.display !== 'none') {
            node.style.left = `${tags[0].x.toFixed(1)}px`;
            node.style.top = `${tags[0].y.toFixed(1)}px`;
          }
        }
        if (sel && barEl) barEl.style.width = `${(100 * card.prog).toFixed(1)}%`;
        window.__LIVE_STATE = {t, started, shipped, onLine, pool: W.live.poolSize(), visibleCars: W.live.visibleCars(), leaderLt: lt, leaderVin: vin, sel: sel ? {...sel} : null, selVin: selCar ? selCar.vin : null, selLt: selCar ? selCar.lt : null, cam: {x: cam.x, z: cam.z, d: cam.d}, nav: {mode, freeMode, fd: freeD, fx: freeTarget.x, fz: freeTarget.z}};
        return {};
      },
    };
  });
}
