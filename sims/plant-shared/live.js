// Plantline LIVE: the toy car plant as an ordinary always-running simulator. No film, no loop:
// the runtime clock is effectively unbounded (24 h), bodies spawn on a 12.5 s takt and each one
// walks the hero's 50 s stage timeline at its own offset, so the line holds several cars at
// once. The camera gently follows the most-advanced car (the leader) with smooth blends when
// the lead passes to the next car — no jump cuts, no return to a start frame. The UI counters
// (bodies started / cars shipped / on line now) only ever grow. Same models, colours, product
// UI and toy scale as plant-film; the film entry is untouched.
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

// the film's camera keys, read at the LEADER car's local time (0..45) — the wide home keys at
// 46+ are never reached, so the live camera stays on the line and never jumps home.
const AZ = 38;
const EL = 36;
const KEYS = [
  {t: 0, x: -57, z: 1, d: 66},
  {t: 5.8, x: -56, z: 1, d: 62},
  {t: 12.6, x: -16, z: 0, d: 66},
  {t: 19.0, x: -16, z: 0, d: 62},
  {t: 20.8, x: -16, z: 0, d: 62},
  {t: 23.2, x: 24, z: -6, d: 78},
  {t: 28.8, x: 24, z: -6, d: 74},
  {t: 30.6, x: 36, z: -2, d: 64},
  {t: 32.8, x: 36, z: -2, d: 62},
  {t: 35.4, x: 70, z: 0, d: 70},
  {t: 41.0, x: 72, z: 0, d: 66},
  {t: 45.0, x: 104, z: 2, d: 84},
  {t: 46.2, x: 104, z: 2, d: 84},
];

const SITES = {
  BS: ['C4', 'Body shop · Cell C4', '4 robots · welding'],
  PT: ['P2', 'Paint · Booth 2', 'Ocean Blue · 3-coat'],
  AS: ['A2', 'Assembly · Station A2', 'Wheels · seats · glass'],
  QA: ['Q1', 'QA · Rolling road', '1 car · testing'],
  YD: ['Y', 'Yard · Carrier 24', 'loading · live'],
  PL: ['P1', 'Northbay Plant · Line 1', '4 zones · live'],
};
const DROP = [['C4', 'Body shop · Cell C4', '4 robots · welding', 92], ['P2', 'Paint · Booth 2', '1 body in booth', 70], ['A2', 'Assembly · Station A2', 'wheels · trim', 64], ['Q1', 'QA · Rolling road', '1 car testing', 40], ['Y', 'Yard · Carrier 24', 'loading', 83]];

export function runToyPlantLive() {
  return runSim({duration: 86400, fps: 60, theme: 'light', hud: {enabled: false, title: 'plantline live', subtitle: ''}, director: {enabled: false}, watermark: ''}, async ({canvas, capture}) => {
    const app = document.getElementById('app');
    const st = createToyStage(canvas, {fov: 28});
    const W = buildLiveWorld();
    st.scene.add(W.root);
    const ui = createToyUI(app, UI_WORDS_LIVE, {});
    const sel = createSelection(st.scene, st);
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

    // ---------------------------------------------------------- the camera: follow the leader, blended
    const P = (o) => o.getWorldPosition(new THREE.Vector3());
    const keyCam = (t) => {
      let i = 0;
      while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
      const a = KEYS[i];
      const b = KEYS[i + 1];
      const k = ss(a.t, b.t, t);
      const far = Math.hypot(b.x - a.x, b.z - a.z);
      const arc = far > 40 ? 0.3 * Math.sin(Math.PI * k) : 0;
      return {x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), d: lerp(a.d, b.d, k) * (1 + arc)};
    };
    const camDesired = (lt, leader) => {
      const c = keyCam(Math.min(lt, 45));
      const w1 = ss(5.8, 7.2, lt) * (1 - ss(11.6, 12.8, lt));
      const w2 = ss(41.0, 42.2, lt) * (1 - ss(44.6, 45.6, lt));
      const w = Math.max(w1, w2);
      if (w > 0 && leader) {
        const p = P(leader.group);
        c.x = lerp(c.x, p.x + 2, w);
        c.z = lerp(c.z, p.z + 2, w);
        c.d = lerp(c.d, w2 > w1 ? 80 : 70, w);
      }
      return c;
    };
    let cam = null;
    let lastT = null;

    // ---------------------------------------------------------- what the page shows (per leader local time)
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

    window.TOYPLANTLIVE = {st, W};
    return {
      resize,
      render(t) {
        W.pose(t);
        const L = W.live.leaderAt(t);
        const lt = L ? L.lt : 0;
        const vin = L ? L.vin : '—';
        sel.box(L ? L.group : null, 1);
        sel.route(L ? W.routes.car(t) : null, 1, 1);
        sel.update();
        // smooth-follow camera: exponential blend toward the leader's desired frame;
        // a big time step (seek/capture) snaps instead of gliding.
        const desired = camDesired(lt, L);
        if (!cam || lastT === null || t < lastT || t - lastT > 1.5) cam = desired;
        else {
          const k = 1 - Math.exp(-(t - lastT) / 1.1);
          cam = {x: lerp(cam.x, desired.x, k), z: lerp(cam.z, desired.z, k), d: lerp(cam.d, desired.d, k)};
        }
        lastT = t;
        st.frame({tx: cam.x, ty: 1.5, tz: cam.z, az: AZ * D2R, el: EL * D2R, d: cam.d, fov: 28, sx: -110, sy: 26});
        const tags = [];
        if (L) {
          const a = st.project(W.anchors.car());
          const [txt] = stageOf(lt);
          if (a && !underUI(a)) tags.push({kind: 'sel', x: a[0], y: a[1], text: vin, sub: txt, a: 1});
        }
        const started = W.live.startedCount(t);
        const shipped = W.live.shippedCount(t);
        const onLine = W.live.onLineCount(t);
        ui.update({
          clock: fmtClock(t),
          site: SITES[siteAt(lt)],
          kpi: {
            a: [fmt(started), 'takt 12.5 s', 'bodies started · line 1'],
            b: [fmt(shipped), 'carrier 24', 'cars shipped · line 1'],
            c: [fmt(onLine), 'live', 'cars on line · now'],
          },
          card: carCard(lt, vin),
          track: trackFor(lt, vin),
          table: tableFor(siteAt(lt), lt),
          drop: {open: 0, sites: DROP, on: 1},
          tool: -1,
          tags,
          cursor: [-100, -100],
          hand: false,
          click: 0,
        });
        window.__LIVE_STATE = {t, started, shipped, onLine, pool: W.live.poolSize(), visibleCars: W.live.visibleCars(), leaderLt: lt, leaderVin: vin};
        return {};
      },
    };
  });
}
