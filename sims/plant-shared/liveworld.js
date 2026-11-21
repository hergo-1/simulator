// The LIVE toy car plant world: the same Northbay plant as plant-film (same builders, same hero
// timeline T), but the line never stops. Bodies spawn on a fixed takt and each one follows the
// hero's 50 s stage timeline offset by its spawn time, so at steady state several cars are in
// different stages at once: one welding in C4 while another is painted, fitted, tested and loaded.
// Spawns are a pure function of the clock (spawn n at n*TAKT, pre-seeded from n = FIRST_N so the
// line starts full), and a fixed pool of 6 bodies + skids is recycled — instance counts stay
// bounded forever. A car despawns the moment it is aboard the carrier (counted as shipped).
// Toy metres, y up, the hall centred on the origin, x along the line, the camera's side +z.
import * as THREE from 'three';
import {TOY, toyMat, rbox, mesh} from '../airport-shared/style.js';
import {buildToyCityBlock, buildToyFence, buildToyTrees} from '../airport-shared/airside.js';
import {buildToyBoxTruck, buildToyForklift} from '../airport-shared/gse.js';
import {buildToyCarBody, buildToyDyno, buildToyPaintBooth, buildToyPress, buildToyRobot, buildToyRollerConveyor, buildToySkid} from './line.js';
import {buildToyAGV, buildToyCarCarrier, buildToyCellFence, buildToyHall, buildToyPallet, buildToyPartsRack, buildToySign, buildToyTireStack} from './plant.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x) => {
  const u = clamp(x);
  return u * u * (3 - 2 * u);
};
const ss = (a, b, t) => sm((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const yawOf = (t) => Math.atan2(-t.z, t.x);

// the film clock (s) — one car's journey, unchanged from plant-film
export const T = {
  weld: [0.4, 5.6],
  trim: [6.2, 7.4],
  toPaint: [6.4, 12.6],
  boothIn: [11.6, 12.4],
  boothShut: [12.8, 13.4],
  spray: [13.2, 17.2],
  paint: [13.4, 17.0],
  boothOut: [17.6, 18.2],
  toWheels: [18.4, 23.0],
  agv: [23.4, 26.6],
  fitFL: 25.8, fitFR: 26.4, fitRL: 27.6, fitRR: 28.2,
  toTrim: [29.0, 30.6],
  interior: [30.9, 32.0],
  glass: [31.4, 32.4],
  toEnd: [32.6, 34.8],
  lift: [34.8, 35.6],
  toDyno: [35.6, 37.2],
  test: [37.4, 41.0],
  out: [41.2, 45.0],
  rampUp: [45.4, 46.8],
};
export const DUR = 50;
// LIVE: a new body enters welding every TAKT seconds. The journey is 45 s, so a 50 s spawn
// cycle would leave exactly one car on the line; TAKT = DUR/4 keeps ~4 cars in flight and
// every station single-occupancy (the widest station window, wheels at 12.2 s, stays < TAKT).
export const TAKT = 12.5;
const FIRST_N = -3; // pre-seeded spawns (negative n) so the pipeline starts full
const POOL = 6; // pooled bodies/skids, recycled by spawn index — bounded forever
const DESPAWN = 48; // local time a finished car leaves the world (aboard the carrier)
const LINE_Z = 0;
const CELL_X = -58;
const BOOTH_X = -16;
const WHEEL_X = 20;
const TRIM_X = 36;
const END_X = 60;
const DYNO_X = 74;
const DOOR_X = 90;
const CAR_Y = 0.95;
const HUB_Y = 0.5;

function makePath(pts) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
  const L = c.getLength();
  const at = (s) => {
    if (s <= 0) return {p: c.getPointAt(0).addScaledVector(c.getTangentAt(0), s), t: c.getTangentAt(0)};
    if (s >= L) return {p: c.getPointAt(1).addScaledVector(c.getTangentAt(1), s - L), t: c.getTangentAt(1)};
    return {p: c.getPointAt(s / L), t: c.getTangentAt(s / L)};
  };
  return {L, at, points: (s0, s1, n = 48) => Array.from({length: n + 1}, (_, i) => at(lerp(s0, s1, i / n)).p)};
}

export function buildLiveWorld() {
  const root = new THREE.Group();
  const add = (o, x = 0, z = 0, ry = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    root.add(o);
    return o;
  };
  const flat = (w, d, color, x, z, y = 0.01) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), toyMat(color, {rough: 0.95}));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // ---------------------------------------------------------------- the lot, the yard, the road, the city
  flat(3200, 3200, TOY.ground, 0, 0, 0);
  flat(90, 70, TOY.road, 128, 0, 0.012);
  flat(60, 26, TOY.road, -54, 52, 0.012);
  flat(1400, 14, '#ccd6f4', 0, 92, 0.02);
  for (let x = -690; x < 700; x += 9) flat(4, 0.5, TOY.lane, x, 92, 0.03);
  for (let i = 0; i < 6; i++) flat(0.35, 14, TOY.bay, 110 + 4.2 * i, -22, 0.03);
  for (let x = -460; x < 460; x += 30) add(buildToyFence({length: 30}), x + 15, 82);
  const trees = [];
  for (let x = -450; x < 450; x += 16) trees.push({x: x + 3 * Math.sin(x), z: 78, size: 0.9 + 0.15 * Math.sin(x * 0.7)});
  for (const [x, z] of [[-112, -20], [-118, 6], [-110, 30], [170, -30], [176, 10], [168, 34], [100, -46], [-60, -52], [10, -50]]) trees.push({x, z, size: 1.2});
  add(buildToyTrees(trees));
  let seed = 5;
  for (let x = -440; x < 450; x += 38) {
    add(buildToyCityBlock({w: 26, d: 20, floors: 4 + (seed % 4), seed}), x, 118);
    seed += 7;
  }

  // ---------------------------------------------------------------- the hall
  const hall = buildToyHall({length: 180, width: 72});
  add(hall.group);
  for (let i = 0; i < hall.doors.length; i++) hall.setDoor(i, 1);
  add(buildToySign({text: 'CELL C4', sub: 'Body framing', kind: 'stand'}), CELL_X - 6, -8);
  add(buildToySign({text: 'BOOTH 2', sub: 'Ocean Blue', kind: 'stand'}), BOOTH_X - 6, -8.5);
  add(buildToySign({text: 'STATION A2', sub: 'Wheels · trim', kind: 'stand'}), WHEEL_X + 8, -9.5);

  // ---------------------------------------------------------------- line 1 (z = 0)
  const conv1 = buildToyRollerConveyor({length: 48});
  add(conv1.group, -49, LINE_Z);
  const conv2 = buildToyRollerConveyor({length: 64});
  add(conv2.group, 24, LINE_Z);
  const press = buildToyPress({number: '01'});
  add(press.group, -80, LINE_Z);
  const booth = buildToyPaintBooth({number: '02'});
  add(booth.group, BOOTH_X, LINE_Z);
  const lift = new THREE.Group();
  const liftTable = mesh(rbox(7.2, 0.3, 3.0, 0.08), toyMat(TOY.blue, {paint: true}), 0, -0.15, 0);
  lift.add(liftTable);
  for (const [dx, dz] of [[-3.3, -1.75], [3.3, -1.75], [-3.3, 1.75], [3.3, 1.75]]) lift.add(mesh(rbox(0.32, 1.2, 0.32, 0.06), toyMat(TOY.white), dx, 0.6, dz));
  add(lift, END_X, LINE_Z);
  const dyno = buildToyDyno();
  add(dyno.group, DYNO_X, LINE_Z);
  add(buildToyCellFence({w: 15, d: 12, open: ['-x', '+x']}), CELL_X, LINE_Z);

  // the pooled bodies on their skids — spawn n uses pool slot n mod POOL
  const carColors = [TOY.blue, TOY.white, '#9aa4b8', TOY.blue, TOY.white, '#9aa4b8'];
  const cars = [];
  for (let s = 0; s < POOL; s++) {
    const body = buildToyCarBody({color: carColors[s], number: `NB7E 00${4812 + s}`});
    const skid = buildToySkid();
    root.add(skid.group, body.group);
    body.setPaint(0);
    body.setGlass(0);
    body.setWheels(0);
    body.setInterior(0);
    body.group.visible = false;
    skid.group.visible = false;
    cars.push({body, skid, vin: `NB7E 00${4812 + s}`});
  }

  // C4: 4 weld robots facing the body
  const welders = [
    [-1.7, -3.6], [1.7, -3.6], [-1.7, 3.6], [1.7, 3.6],
  ].map(([dx, dz], i) => {
    const r = buildToyRobot({tool: 'weld', number: String(i + 1).padStart(2, '0')});
    add(r.group, CELL_X + dx, LINE_Z + dz, dz < 0 ? -Math.PI / 2 : Math.PI / 2);
    return {r, dx, side: Math.sign(dz)};
  });
  // booth 2: 2 paint robots on the booth's mounts
  booth.group.updateMatrixWorld(true);
  const painters = booth.slots.map((s, i) => {
    const r = buildToyRobot({tool: 'paint', number: String(7 + i).padStart(2, '0')});
    const p = s.getWorldPosition(V());
    const q = s.getWorldQuaternion(new THREE.Quaternion());
    r.group.position.copy(p);
    r.group.quaternion.copy(q);
    root.add(r.group);
    return {r, dx: p.x - BOOTH_X, side: Math.sign(p.z - LINE_Z)};
  });
  // station A2: a wheel robot each side, tyre stacks behind them; the trim gripper further on
  const wheelers = [-1, 1].map((side, i) => {
    const r = buildToyRobot({tool: 'wheel', number: String(5 + i).padStart(2, '0')});
    add(r.group, WHEEL_X, LINE_Z + side * 3.9, side < 0 ? -Math.PI / 2 : Math.PI / 2);
    add(buildToyTireStack({n: 4}), WHEEL_X, LINE_Z + side * 6.6);
    return {r, side};
  });
  const gripper = buildToyRobot({tool: 'grip', number: '09'});
  add(gripper.group, TRIM_X, LINE_Z - 3.9, -Math.PI / 2);

  // AGV-12 brings the seats from the racks by the -z wall to the trim station
  const agv = buildToyAGV({number: '12', rack: 'seats'});
  root.add(agv.group);
  const agvPath = makePath([[6, -27], [2, -24], [1, -17], [5, -13], [18, -12.8], [30, -13], [35, -12], [36, -9.4], [36, -7.4]]);
  for (let i = 0; i < 4; i++) add(buildToyPartsRack({kind: ['seats', 'doors', 'tyres', 'boxes'][i], seed: i + 2}), -2 + 6 * i, -31.5);
  const loop = makePath([[8, 17], [54, 17], [56, 23], [8, 23], [6, 17.5]]);
  const agvs = [buildToyAGV({number: '14', rack: 'boxes'}), buildToyAGV({number: '15', rack: 'tyres'})];
  agvs.forEach((a) => root.add(a.group));

  // ---------------------------------------------------------------- line 2 (z = -20): other bodies at their stations
  const LINE2 = -20;
  add(buildToyRollerConveyor({length: 44}).group, -52, LINE2);
  add(buildToyRollerConveyor({length: 48}).group, 30, LINE2);
  const line2 = [];
  for (const [x, k, p, w] of [[-70, 0.1, 0, 0], [-60, 0.4, 0, 0], [-46, 0.75, 0, 0], [16, 1, 1, 0], [30, 1, 1, 0.5], [44, 1, 1, 1]]) {
    const c = buildToyCarBody({color: [TOY.white, TOY.blue, '#9aa4b8'][line2.length % 3], number: `NB7E 00${4790 + line2.length}`});
    c.setBuild(k);
    c.setPaint(p);
    c.setWheels(w);
    c.setGlass(p);
    c.setInterior(p);
    const sk = buildToySkid();
    add(sk.group, x, LINE2, 0, 0.7);
    add(c.group, x, LINE2, 0, CAR_Y);
    line2.push(c);
  }
  const welders2 = [-1, 1].map((side, i) => {
    const r = buildToyRobot({tool: 'weld', number: String(21 + i)});
    add(r.group, -60, LINE2 + side * 3.6, side < 0 ? -Math.PI / 2 : Math.PI / 2);
    return {r, side};
  });
  add(buildToyCellFence({w: 12, d: 11, open: ['-x', '+x']}), -60, LINE2);
  const fitter2 = buildToyRobot({tool: 'wheel', number: '24'});
  add(fitter2.group, 30, LINE2 + 3.9, Math.PI / 2);

  // ---------------------------------------------------------------- G3: a supplier truck and a forklift
  const supplier = buildToyBoxTruck({livery: 'kestrel'});
  add(supplier.group, -54, 46.5, -Math.PI / 2);
  const fork = buildToyForklift();
  root.add(fork.group);
  const pal = buildToyPallet({load: 'boxes', seed: 3});
  root.add(pal);
  for (let i = 0; i < 3; i++) add(buildToyPallet({load: ['wrap', 'totes', 'boxes'][i], seed: i + 5}), -66 + 3 * i, 28);

  // ---------------------------------------------------------------- the yard: carrier 24, ramp down, 5 cars aboard
  const carrier = buildToyCarCarrier({livery: 'aurora', number: '24'});
  carrier.setRamp(1);
  carrier.setDeck(0);
  const footX = 98;
  add(carrier.group, footX - carrier.ramp.foot.x, LINE_Z);
  carrier.group.updateMatrixWorld(true);
  const loaded = [0, 1, 3, 4, 5].map((si, i) => {
    const c = buildToyCarBody({color: [TOY.white, TOY.blue, '#9aa4b8', TOY.blue, TOY.white][i], number: `NB7E 00${4800 + i}`});
    c.setBuild(1);
    c.setPaint(1);
    c.setGlass(1);
    c.setWheels(1);
    c.setInterior(1);
    carrier.slots[si].add(c.group);
    return c;
  });
  const rampTop = carrier.group.localToWorld(carrier.ramp.top.clone());
  const rampFoot = carrier.group.localToWorld(carrier.ramp.foot.clone());
  const slotW = carrier.slots[2].getWorldPosition(V());

  // ---------------------------------------------------------------- one car's way (the film hero path, per local time)
  const heroX = (t) => {
    if (t < T.toPaint[0]) return CELL_X;
    if (t < T.boothOut[1]) return lerp(CELL_X, BOOTH_X, ss(...T.toPaint, t));
    if (t < T.toTrim[0]) return lerp(BOOTH_X, WHEEL_X, ss(...T.toWheels, t));
    if (t < T.toEnd[0]) return lerp(WHEEL_X, TRIM_X, ss(...T.toTrim, t));
    return lerp(TRIM_X, END_X, ss(...T.toEnd, t));
  };
  const dynoY = (x) => {
    const d = Math.abs(x - DYNO_X);
    return d < 3.4 ? 0.26 : d < 5.0 ? 0.26 * (1 - (d - 3.4) / 1.6) : 0;
  };
  const outPts = [V(DYNO_X, 0, LINE_Z), V(DOOR_X, 0, LINE_Z), V(rampFoot.x, 0.04, LINE_Z), V(rampTop.x, rampTop.y, LINE_Z), V(slotW.x, slotW.y, LINE_Z)];
  const outL = [0];
  for (let i = 1; i < outPts.length; i++) outL.push(outL[i - 1] + outPts[i].distanceTo(outPts[i - 1]));
  const outAt = (s) => {
    s = clamp(s, 0, outL[outL.length - 1]);
    let i = 1;
    while (i < outL.length - 1 && outL[i] < s) i++;
    const k = (s - outL[i - 1]) / (outL[i] - outL[i - 1] || 1);
    return {p: outPts[i - 1].clone().lerp(outPts[i], k), seg: i};
  };
  const outLen = outL[outL.length - 1];
  const rampPitch = Math.atan2(rampTop.y - 0.04, rampTop.x - rampFoot.x);

  // ---------------------------------------------------------------- the live spawn math (pure in t)
  const slotOf = (n) => ((n % POOL) + POOL) % POOL;
  const activeNs = (t) => {
    const ns = [];
    for (let n = Math.max(FIRST_N, Math.ceil((t - DESPAWN) / TAKT)); n <= Math.floor(t / TAKT); n++) {
      const lt = t - n * TAKT;
      if (lt >= 0 && lt <= DESPAWN) ns.push(n);
    }
    return ns;
  };
  const stationCar = (t, a, b) => {
    for (const n of activeNs(t)) {
      const lt = t - n * TAKT;
      if (lt >= a && lt < b) return {n, lt};
    }
    return null;
  };
  const leaderAt = (t) => {
    let best = null;
    for (const n of activeNs(t)) {
      const lt = t - n * TAKT;
      if (lt < T.out[1] && (!best || lt > best.lt)) best = {n, lt, slot: slotOf(n), group: cars[slotOf(n)].body.group, vin: cars[slotOf(n)].vin};
    }
    return best;
  };
  // every car on the line right now, oldest first — the interactive view picks from these
  const activeCars = (t) =>
    activeNs(t).map((n) => {
      const slot = slotOf(n);
      return {n, lt: t - n * TAKT, slot, group: cars[slot].body.group, vin: cars[slot].vin};
    });
  const startedCount = (t) => Math.max(0, Math.floor(t / TAKT) - FIRST_N + 1);
  const shippedCount = (t) => Math.max(0, Math.floor((t - T.out[1]) / TAKT) - FIRST_N + 1);
  const onLineCount = (t) => activeNs(t).filter((n) => t - n * TAKT < T.out[1]).length;

  const tmp = V();
  let lastT = 0;
  const pose = (t) => {
    lastT = t;
    // ---- every active car follows the hero timeline at its own local time
    const used = new Set();
    for (const n of activeNs(t)) {
      const lt = t - n * TAKT;
      const slot = slotOf(n);
      used.add(slot);
      const {body, skid} = cars[slot];
      body.setBuild(lt < T.trim[0] ? lerp(0.25, 0.75, ss(...T.weld, lt)) : lerp(0.75, 1, ss(...T.trim, lt)));
      body.setPaint(ss(...T.paint, lt));
      const fitted = (lt >= T.fitFL) + (lt >= T.fitFR) + (lt >= T.fitRL) + (lt >= T.fitRR);
      body.setWheels(fitted / 4);
      body.setInterior(ss(...T.interior, lt));
      body.setGlass(ss(...T.glass, lt));
      let hx;
      let hy = CAR_Y;
      let pitch = 0;
      let rolled = 0;
      if (lt < T.lift[0]) {
        hx = heroX(lt);
      } else if (lt < T.toDyno[0]) {
        hx = END_X;
        hy = lerp(CAR_Y, 0, ss(...T.lift, lt));
      } else if (lt < T.out[0]) {
        hx = lerp(END_X, DYNO_X, ss(...T.toDyno, lt));
        hy = dynoY(hx);
        rolled = hx - END_X;
      } else {
        const s = outLen * ss(...T.out, lt);
        const o = outAt(s);
        hx = o.p.x;
        hy = o.seg <= 1 ? dynoY(hx) : o.p.y;
        pitch = o.seg === 3 ? rampPitch : 0;
        rolled = DYNO_X - END_X + s;
      }
      body.group.visible = lt < T.out[1]; // at out[1] it is aboard the carrier — despawn, counted shipped
      body.group.position.set(hx, hy, LINE_Z);
      body.group.rotation.set(0, 0, pitch);
      const spin = lt > T.test[0] && lt < T.test[1] ? 120 * Math.pow(clamp((lt - T.test[0]) / 1.5), 2) * Math.min(1, (T.test[1] - lt) / 0.8) : 0;
      body.roll(rolled + spin * (lt - T.test[0]) * 0.5);
      if (lt >= T.toDyno[0] && lt < T.test[1]) {
        dyno.setRollers((rolled + spin * (lt - T.test[0]) * 0.5) / 0.3);
      }
      const skidX = lt < T.lift[0] ? heroX(lt) : END_X;
      skid.group.visible = true;
      skid.group.position.set(skidX, lt < T.lift[0] ? 0.7 : lerp(0.7, 0, ss(...T.lift, lt)), LINE_Z);
    }
    for (let s = 0; s < POOL; s++) {
      if (!used.has(s)) {
        cars[s].body.group.visible = false;
        cars[s].skid.group.visible = false;
      }
    }
    // the lift follows the car on it, then rises again for the next one
    const liftCar = stationCar(t, T.toEnd[0], T.toDyno[0] + 2.5);
    if (!liftCar) lift.position.y = 0.7;
    else if (liftCar.lt < T.lift[0]) lift.position.y = 0.7;
    else if (liftCar.lt < T.lift[1]) lift.position.y = lerp(0.7, 0, ss(...T.lift, liftCar.lt));
    else lift.position.y = lerp(0, 0.7, ss(T.lift[1] + 0.4, T.lift[1] + 2.2, liftCar.lt));
    // conveyor offsets follow the car riding each belt; with none aboard, the belts idle-scroll
    const c1 = stationCar(t, 0, T.toPaint[1]);
    conv1.setOffset(c1 ? heroX(c1.lt) - CELL_X : (t * 2.4) % 48);
    const c2 = stationCar(t, T.toWheels[0], T.toEnd[1]);
    conv2.setOffset(c2 ? heroX(Math.max(c2.lt, T.toWheels[0])) - BOOTH_X : (t * 2.4) % 64);
    const boothCar = stationCar(t, T.boothIn[0] - 1, T.boothOut[1] + 1.4);
    booth.conveyor?.setOffset?.(boothCar ? heroX(boothCar.lt) - CELL_X : (t * 2.4) % 48);
    // ---- C4: the welders walk their seams while a body is in the cell
    const weldCar = stationCar(t, 0, T.weld[1] + 0.2);
    const welding = !!weldCar && weldCar.lt > T.weld[0] - 0.2 && weldCar.lt < T.weld[1];
    welders.forEach(({r, dx, side}, i) => {
      if (!welding) {
        r.reach(tmp.set(CELL_X + dx * 1.2, 3.4, LINE_Z + side * 2.2));
        r.setSpark(0, t);
        return;
      }
      const cyc = (t + i * 0.37) / 1.5;
      const k = Math.floor(cyc);
      const f = cyc - k;
      const pt = (n) => tmp.set(CELL_X + dx + [-0.7, 0.2, 0.9, -0.2][(n + i) % 4], CAR_Y + 1.1 + 0.35 * ((n + i) % 2), LINE_Z + side * 1.15);
      const a = pt(k).clone();
      const b = pt(k + 1).clone();
      const m = f < 0.33 ? sm(f / 0.33) : 1;
      r.reach(a.lerp(b, m));
      r.setSpark(f > 0.4 && f < 0.92 ? 1 : 0, t);
    });
    // ---- booth 2: the doors and the painters follow the body inside
    booth.setDoors(boothCar ? Math.max(ss(...T.boothIn, boothCar.lt) * (1 - ss(...T.boothShut, boothCar.lt)), ss(...T.boothOut, boothCar.lt) * (1 - ss(T.boothOut[1] + 0.8, T.boothOut[1] + 1.4, boothCar.lt))) : 0);
    const spraying = !!boothCar && boothCar.lt > T.spray[0] && boothCar.lt < T.spray[1];
    painters.forEach(({r, dx, side}, i) => {
      if (!spraying) {
        r.reach(tmp.set(BOOTH_X + dx * 0.7, 3.6, LINE_Z + side * 1.4));
        r.setSpray(0);
        return;
      }
      const lt = boothCar.lt;
      const u = (lt - T.spray[0]) * 0.9 + i * 0.5;
      const sx = BOOTH_X + Math.sign(dx) * (1.3 + 1.2 * Math.sin(u * 2.2));
      const sz = LINE_Z + side * (0.15 + 0.6 * (0.5 + 0.5 * Math.sin(u * 1.1)));
      r.reach(tmp.set(sx, CAR_Y + 1.55 + 0.6, sz));
      r.setSpray(ss(T.spray[0], T.spray[0] + 0.3, lt) * (1 - ss(T.spray[1] - 0.3, T.spray[1], lt)), TOY.blue);
    });
    // ---- A2: the wheel robots shuttle from their stacks to the hubs of the car in the station
    const wheelCar = stationCar(t, T.toWheels[1] - 0.5, T.toTrim[0]);
    wheelers.forEach(({r, side}) => {
      const fits = side < 0 ? [[T.fitFL, 2.05], [T.fitRL, -2.05]] : [[T.fitFR, 2.05], [T.fitRR, -2.05]];
      const stack = V(WHEEL_X, 1.6, LINE_Z + side * 6.2);
      let target = stack.clone().add(V(0, 1.2, 0));
      let hold = 1;
      if (wheelCar) {
        const lt = wheelCar.lt;
        for (const [tf, wx] of fits) {
          const hub = V(WHEEL_X + wx, CAR_Y + HUB_Y, LINE_Z + side * 1.55);
          if (lt > tf - 1.1 && lt < tf) target = target.lerp(hub, sm((lt - (tf - 1.1)) / 0.9));
          else if (lt >= tf && lt < tf + 0.9) {
            target = hub.clone().lerp(stack.clone().add(V(0, 1.2, 0)), sm((lt - tf) / 0.9));
            hold = 0;
          }
        }
      }
      if (!wheelCar) target = stack.clone().add(V(0, 1.6, -side * 0.8));
      r.reach(target, {down: false, dir: V(0, 0, -side)});
      r.setGrip(wheelCar ? hold : 1);
    });
    // ---- the trim gripper reaches from the AGV's rack into the car being trimmed
    {
      const trimCar = stationCar(t, T.interior[0] - 0.6, T.glass[1] + 0.6);
      const a = V(TRIM_X, 2.4, LINE_Z - 6.6);
      const b = V(TRIM_X + 0.4, CAR_Y + 1.4, LINE_Z - 0.4);
      let k = 0;
      if (trimCar) {
        const c = ((trimCar.lt - (T.interior[0] - 0.6)) / 1.1) % 2;
        k = c < 1 ? sm(c) : sm(2 - c);
      }
      gripper.reach(a.lerp(b, k));
      gripper.setGrip(k > 0.5 ? 1 : 0.2);
    }
    // ---- AGV-12 to the trim station, timed to the car it serves
    {
      const agvCar = stationCar(t, T.agv[0], T.agv[1] + 0.6);
      const s = agvCar ? agvPath.L * ss(...T.agv, agvCar.lt) : 0;
      const {p, t: tg} = agvPath.at(s);
      agv.group.position.set(p.x, 0, p.z);
      agv.group.rotation.y = yawOf(tg);
      agv.roll(s);
      agv.setLift(agvCar ? 0.2 * ss(T.agv[1], T.agv[1] + 0.6, agvCar.lt) : 0);
    }
    agvs.forEach((a, i) => {
      const s = (t * 4.2 + i * loop.L * 0.5) % loop.L;
      const {p, t: tg} = loop.at(s);
      a.group.position.set(p.x, 0, p.z);
      a.group.rotation.y = yawOf(tg);
      a.roll(t * 4.2);
    });
    // ---- the dyno's lights follow the car on the rolling road
    const dynoCar = stationCar(t, T.test[0] - 0.4, T.test[1] + 0.4);
    dyno.setLights(dynoCar ? ss(T.test[0] - 0.4, T.test[0], dynoCar.lt) * (1 - ss(T.test[1], T.test[1] + 0.4, dynoCar.lt)) : 0);
    // ---- line 2: two welders on a loop, a wheel robot working
    welders2.forEach(({r, side}, i) => {
      const f = ((t + i * 0.6) / 1.6) % 1;
      r.reach(V(-60 + [-1.0, 0.6, 1.4][Math.floor((t + i * 0.6) / 1.6) % 3], CAR_Y + 1.2, LINE2 + side * 1.15));
      r.setSpark(f > 0.35 && f < 0.9 ? 1 : 0, t);
    });
    {
      const f = (t % 4) / 4;
      const k = f < 0.5 ? sm(f * 2) : sm(2 - f * 2);
      fitter2.reach(V(30 - 2.05, CAR_Y + HUB_Y, LINE2 + 4.6).lerp(V(30 - 2.05, CAR_Y + HUB_Y, LINE2 + 1.6), k), {down: false, dir: V(0, 0, -1)});
      fitter2.setGrip(f < 0.5 ? 1 : 0);
    }
    // ---- the press strokes every 3 s
    press.setRam(sm(Math.min(1, Math.max(0, 1 - Math.abs(((t % 3) / 3) * 2 - 1) * 1.6))));
    // ---- G3: the forklift carries a pallet from the truck into the hall and back
    {
      const c = ((t + 2) % 10) / 10;
      const z = c < 0.5 ? lerp(37, 27, sm(c * 2)) : lerp(27, 37, sm((c - 0.5) * 2));
      fork.group.position.set(-54, 0, z);
      fork.group.rotation.y = Math.PI / 2;
      fork.roll(z);
      fork.setForks(c < 0.5 ? 0.6 : 0.15);
      pal.position.set(-54, c < 0.5 ? 0.62 : 0.17, z - 2.8);
      pal.visible = c < 0.5;
    }
    // ---- the carrier's ramp: down while a car climbs, folds between cars, back down for the next
    {
      const span = T.out[1] - T.out[0];
      const cyc = (((t - T.out[0]) % TAKT) + TAKT) % TAKT;
      let ramp = 0;
      if (cyc < span) ramp = 1;
      else if (cyc < span + 1.4) ramp = 1 - ss(span, span + 1.4, cyc);
      else if (cyc > TAKT - 1.2) ramp = ss(TAKT - 1.2, TAKT, cyc);
      carrier.setRamp(ramp);
    }
  };
  pose(0);

  const at = (o, dy) => o.getWorldPosition(V()).add(V(0, dy, 0));
  const anchors = {
    car: () => {
      const L = leaderAt(lastT);
      return L ? at(L.group, 2.4) : V(CELL_X, 3, LINE_Z);
    },
    painter: () => at(painters[0].r.group, 4.6),
    wheeler: () => at(wheelers[0].r.group, 4.6),
    agv: () => at(agv.group, 3.0),
    dyno: () => V(DYNO_X, 4.4, LINE_Z),
    booth: () => V(BOOTH_X, 6.2, LINE_Z),
    carrier: () => at(carrier.group, 5.2),
    rack: () => V(4, 3.4, -31.5),
  };
  const carRouteFor = (lt) => {
    if (lt < 0) return null;
    if (lt < T.toPaint[1]) return [V(heroX(lt), 0.75, LINE_Z), V(BOOTH_X, 0.75, LINE_Z)];
    if (lt >= T.out[0] - 0.4 && lt < T.out[1]) {
      const s = outLen * ss(...T.out, lt);
      return [outAt(s).p, ...outPts.filter((_, i) => outL[i] > s)].map((p) => p.clone().setY(Math.max(0.06, p.y)));
    }
    return null;
  };
  const routes = {
    car: (t) => {
      const L = leaderAt(t);
      return L ? carRouteFor(L.lt) : null;
    },
    // the same ground route for ANY spawned car (the interactive live view follows tapped cars)
    carFor: (n, t) => carRouteFor(t - n * TAKT),
    agv: (t) => {
      const agvCar = stationCar(t, T.agv[0], T.agv[1] + 0.6);
      return agvCar ? agvPath.points(agvPath.L * ss(...T.agv, agvCar.lt), agvPath.L) : null;
    },
  };
  const bodies = [
    ...cars.map((c, i) => ({name: `car${i}`, g: c.body.group})),
    ...cars.map((c, i) => ({name: `skid${i}`, g: c.skid.group})),
    {name: 'agv', g: agv.group},
    ...agvs.map((a, i) => ({name: `agvLoop${i}`, g: a.group})),
    {name: 'fork', g: fork.group}, {name: 'pal', g: pal}, {name: 'supplier', g: supplier.group},
    {name: 'carrier', g: carrier.group, kind: 'big'}, {name: 'dyno', g: dyno.group, kind: 'big'},
    ...welders.map((w, i) => ({name: `weld${i}`, g: w.r.group})), ...painters.map((w, i) => ({name: `paint${i}`, g: w.r.group})),
    ...wheelers.map((w, i) => ({name: `wheel${i}`, g: w.r.group})), {name: 'grip', g: gripper.group},
    ...line2.map((c, i) => ({name: `line2car${i}`, g: c.group})), ...welders2.map((w, i) => ({name: `weld2_${i}`, g: w.r.group})), {name: 'fitter2', g: fitter2.group},
    {name: 'press', g: press.group, kind: 'big'}, {name: 'lift', g: lift},
  ];
  return {
    root, pose, anchors, routes, bodies,
    objects: {hero: cars[0].body, painter: painters[0].r, wheeler: wheelers[0].r, agv, dyno, carrier, booth},
    heroX,
    live: {TAKT, FIRST_N, POOL, activeNs, leaderAt, activeCars, stationCar, startedCount, shippedCount, onLineCount, poolSize: () => cars.length, visibleCars: () => cars.filter((c) => c.body.group.visible).length},
  };
}
