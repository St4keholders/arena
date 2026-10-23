// Espejo de estado 3D P2P (Fase 2):
// Empaqueta e interpola posiciones 3D (x, y, z), rotaciones cuaterniónicas de cámara [qx, qy, qz, qw] (SLERP),
// vectores de velocidad [vx, vy, vz] para RigidBodies en Rapier y estados de animación ('idle', 'run', 'attack')
// manteniendo máscaras de bits elementales.
import { charById, defenseById, ENEMY_TYPES, CRYSTAL_MAX_HP } from './constants.js';

// Máscaras de bits para estados elementales y de animación
export const F = {
  MOVING: 1,
  ATTACKING: 2,
  CASTING: 4,
  BUILDING: 8,
  HURT: 16,
  DEAD: 32,
  FROZEN: 64,
  BURNING: 128,
  STUNNED: 256,
  BUFFED: 512,
  SHIELDED: 1024,
  LIFTED: 2048,
  AIRBORNE: 4096,
};

const INTERP_DELAY = 0.075;

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Convierte ángulos Euler de cámara (pitch X, yaw Y, roll Z) en un cuaternión normalizado [qx, qy, qz, qw]
 */
export function eulerToQuat(pitch = 0, yaw = 0, roll = 0) {
  const c1 = Math.cos(pitch * 0.5);
  const s1 = Math.sin(pitch * 0.5);
  const c2 = Math.cos(yaw * 0.5);
  const s2 = Math.sin(yaw * 0.5);
  const c3 = Math.cos(roll * 0.5);
  const s3 = Math.sin(roll * 0.5);

  // Orden YXZ (estándar para cámaras en 3ra persona: yaw -> pitch -> roll)
  const qx = c2 * s1 * c3 + s2 * c1 * s3;
  const qy = s2 * c1 * c3 - c2 * s1 * s3;
  const qz = c2 * c1 * s3 - s2 * s1 * c3;
  const qw = c2 * c1 * c3 + s2 * s1 * s3;
  return [ r3(qx), r3(qy), r3(qz), r3(qw) ];
}

/**
 * Interpolación esférica lineal (SLERP) entre dos cuaterniones [x, y, z, w]
 */
export function slerpQuat(qa, qb, t) {
  const a = Array.isArray(qa) && qa.length === 4 ? qa : [0, 0, 0, 1];
  const b = Array.isArray(qb) && qb.length === 4 ? qb : [0, 0, 0, 1];

  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;

  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;
  if (cosHalfTheta < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta >= 0.9995) {
    const rx = ax + t * (bx - ax);
    const ry = ay + t * (by - ay);
    const rz = az + t * (bz - az);
    const rw = aw + t * (bw - aw);
    const len = Math.hypot(rx, ry, rz, rw) || 1;
    return [rx / len, ry / len, rz / len, rw / len];
  }

  const halfTheta = Math.acos(Math.min(1, Math.max(-1, cosHalfTheta)));
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
  if (Math.abs(sinHalfTheta) < 0.001) {
    return [
      ax * 0.5 + bx * 0.5,
      ay * 0.5 + by * 0.5,
      az * 0.5 + bz * 0.5,
      aw * 0.5 + bw * 0.5,
    ];
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
  return [
    ax * ratioA + bx * ratioB,
    ay * ratioA + by * ratioB,
    az * ratioA + bz * ratioB,
    aw * ratioA + bw * ratioB,
  ];
}

/**
 * Resuelve el estado nominal de animación ('idle' | 'run' | 'attack') para sincronización P2P
 */
export function resolveAnimState(ent) {
  if (ent.attackT > 0 || ent.castT > 0) return 'attack';
  if (ent.moving || Math.hypot(ent.vx || 0, ent.vz || 0) > 0.35) return 'run';
  return 'idle';
}

export function encodeEntityFlags(ent) {
  let f = 0;
  if (ent.moving) f |= F.MOVING;
  if (ent.attackT > 0) f |= F.ATTACKING;
  if (ent.castT > 0) f |= F.CASTING;
  if (ent.buildMode) f |= F.BUILDING;
  if (ent.hurtT > 0) f |= F.HURT;
  if (ent.dead || ent.hp <= 0) f |= F.DEAD;
  if (ent.frozenT > 0) f |= F.FROZEN;
  if (ent.burningT > 0) f |= F.BURNING;
  if (ent.stunnedT > 0) f |= F.STUNNED;
  if (ent.buffedT > 0) f |= F.BUFFED;
  if (ent.shieldT > 0) f |= F.SHIELDED;
  if (ent.liftedT > 0) f |= F.LIFTED;
  if ((ent.y || 0) > 0.15) f |= F.AIRBORNE;
  return f;
}

export function decodeEntityFlags(target, f, explicitAnim = null) {
  target.estadoAnimacion = f;
  target.moving = !!(f & F.MOVING) || explicitAnim === 'run';
  target.attackT = (f & F.ATTACKING) || explicitAnim === 'attack' ? 0.25 : 0;
  target.castT = f & F.CASTING ? 0.4 : 0;
  target.buildMode = !!(f & F.BUILDING);
  target.hurtT = f & F.HURT ? 0.2 : 0;
  target.dead = !!(f & F.DEAD);
  target.frozenT = f & F.FROZEN ? 1 : 0;
  target.burningT = f & F.BURNING ? 1 : 0;
  target.stunnedT = f & F.STUNNED ? 1 : 0;
  target.buffedT = f & F.BUFFED ? 1 : 0;
  target.shieldT = f & F.SHIELDED ? 1 : 0;
  target.liftedT = f & F.LIFTED ? 1 : 0;
  target.airborne = !!(f & F.AIRBORNE);
  target.animState = explicitAnim || (target.attackT > 0 ? 'attack' : target.moving ? 'run' : 'idle');
}

export class MirrorSim {
  constructor(init = {}) {
    this.mode = init.mode || 'campana';
    this.maxWaves = init.maxWaves || 5;
    this.wave = 1;
    this.subPhase = 'forge'; // 'forge' | 'horde'
    this.forgeTimer = 30;
    this.time = 0;
    this.crystal = { hp: CRYSTAL_MAX_HP, maxHp: CRYSTAL_MAX_HP, pulse: 0 };
    this.heroes = [];
    this.turrets = [];
    this.enemies = [];
    this.projs = [];
    this.effects = [];
    this.snaps = [];
    this.offset = null;
  }

  push(s) {
    if (!s) return;
    const now = performance.now() / 1000;
    const off = s.ts - now;
    if (this.offset === null || off > this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.05;

    this.snaps.push(s);
    if (this.snaps.length > 14) this.snaps.shift();

    this.wave = s.w || 1;
    this.maxWaves = s.mw || this.maxWaves;
    this.subPhase = s.sp || 'forge';
    this.forgeTimer = s.ft ?? 0;
    if (s.cr) {
      this.crystal.hp = s.cr[0];
      this.crystal.maxHp = s.cr[1] || CRYSTAL_MAX_HP;
    }
    this.projs = (s.p || []).map(([id, type, x, y, z, tx, tz, col]) => ({
      id,
      type,
      x,
      y,
      z,
      tx,
      tz,
      color: col,
    }));
    this.effects = (s.fx || []).map(([id, type, x, z, r, t, max, col]) => ({
      id,
      type,
      x,
      z,
      r,
      t,
      max,
      color: col,
    }));
  }

  advance(dt) {
    if (!this.snaps.length) return;
    const now = performance.now() / 1000;
    const rt = now + (this.offset || 0) - INTERP_DELAY;
    let s0 = this.snaps[0];
    let s1 = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].ts <= rt && this.snaps[i + 1].ts >= rt) {
        s0 = this.snaps[i];
        s1 = this.snaps[i + 1];
        break;
      }
    }
    if (rt >= s1.ts) s0 = s1;
    const span = s1.ts - s0.ts;
    const t = span > 0 ? Math.max(0, Math.min(1, (rt - s0.ts) / span)) : 1;
    this.time = Math.max(this.time, rt);

    // Interpolar Héroes:
    // [0:id, 1:char, 2:x, 3:z, 4:rotY, 5:hp, 6:flags, 7:maxHp, 8:slot, 9:buildType,
    //  10:holoX, 11:holoZ, 12:holoValid, 13:camQuat, 14:animState, 15:y, 16:vx, 17:vz]
    const hMap0 = new Map((s0.h || []).map((arr) => [arr[0], arr]));
    this.heroes = (s1.h || []).map((b) => {
      const a = hMap0.get(b[0]) || b;
      const ch = charById(b[1]);
      const q0 = a[13] || [0, 0, 0, 1];
      const q1 = b[13] || [0, 0, 0, 1];
      const ent = {
        id: b[0],
        tipo: b[1],
        char: b[1],
        ch,
        x: a[2] + (b[2] - a[2]) * t,
        y: (a[15] || 0) + ((b[15] || 0) - (a[15] || 0)) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || ch.stats.hp,
        slot: b[8] ?? 0,
        buildType: b[9] || null,
        holoX: b[10] || 0,
        holoZ: b[11] || 0,
        holoValid: !!b[12],
        camQuat: slerpQuat(q0, q1, t),
        vx: (a[16] || 0) + ((b[16] || 0) - (a[16] || 0)) * t,
        vz: (a[17] || 0) + ((b[17] || 0) - (a[17] || 0)) * t,
      };
      decodeEntityFlags(ent, b[6], b[14]);
      return ent;
    });

    // Interpolar Torretas: [id, tipo, x, z, rotY, hp, estadoAnimacion, maxHp, ownerSlot, animState]
    const tMap0 = new Map((s0.tu || []).map((arr) => [arr[0], arr]));
    this.turrets = (s1.tu || []).map((b) => {
      const a = tMap0.get(b[0]) || b;
      const def = defenseById(b[1]);
      const ent = {
        id: b[0],
        tipo: b[1],
        type: b[1],
        def,
        x: a[2] + (b[2] - a[2]) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || def.hp,
        ownerSlot: b[8] ?? 0,
      };
      decodeEntityFlags(ent, b[6], b[9]);
      return ent;
    });

    // Interpolar Hordas: [id, tipo, x, z, rotY, hp, estadoAnimacion, maxHp, y, animState]
    const eMap0 = new Map((s0.e || []).map((arr) => [arr[0], arr]));
    this.enemies = (s1.e || []).map((b) => {
      const a = eMap0.get(b[0]) || b;
      const spec = ENEMY_TYPES[b[1]] || ENEMY_TYPES.swarm;
      const ent = {
        id: b[0],
        tipo: b[1],
        type: b[1],
        spec,
        x: a[2] + (b[2] - a[2]) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || spec.hp,
        y: (a[8] || 0) + ((b[8] || 0) - (a[8] || 0)) * t,
      };
      decodeEntityFlags(ent, b[6], b[9]);
      return ent;
    });
  }
}

const r1 = (v) => Math.round((v || 0) * 10) / 10;
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r3 = (v) => Math.round((v || 0) * 1000) / 1000;

export function arenaInitMsg(sim) {
  return {
    t: 'arenainit',
    mode: sim.mode,
    maxWaves: sim.maxWaves,
    heroes: sim.heroes.map((h) => [h.id, h.char, h.slot]),
  };
}

export function snapshotMsg(sim, sfx = []) {
  return {
    t: 'snap',
    ts: r3(sim.time),
    w: sim.wave,
    mw: sim.maxWaves,
    sp: sim.subPhase,
    ft: r1(sim.forgeTimer),
    cr: [Math.round(sim.crystal.hp), Math.round(sim.crystal.maxHp)],
    // Formato empaquetado de Héroes con rotaciones cuaterniónicas de cámara y estado de animación ('idle', 'run', 'attack')
    h: sim.heroes.map((h) => {
      const quat =
        Array.isArray(h.camQuat) && h.camQuat.length === 4
          ? h.camQuat.map(r3)
          : eulerToQuat(h.camPitch || -0.25, h.camYaw ?? h.rotY ?? 0, 0);
      const animState = h.animState || resolveAnimState(h);
      return [
        h.id,
        h.char,
        r1(h.x),
        r1(h.z),
        r2(h.rotY),
        Math.round(h.hp),
        encodeEntityFlags(h),
        Math.round(h.maxHp),
        h.slot,
        h.buildType || '',
        r1(h.holoX),
        r1(h.holoZ),
        h.holoValid ? 1 : 0,
        quat,
        animState,
        r2(h.y || 0),
        r1(h.vx || 0),
        r1(h.vz || 0),
      ];
    }),
    tu: sim.turrets.map((tu) => [
      tu.id,
      tu.type,
      r1(tu.x),
      r1(tu.z),
      r2(tu.rotY),
      Math.round(tu.hp),
      encodeEntityFlags(tu),
      Math.round(tu.maxHp),
      tu.ownerSlot,
      resolveAnimState(tu),
    ]),
    e: sim.enemies.map((e) => [
      e.id,
      e.type,
      r1(e.x),
      r1(e.z),
      r2(e.rotY),
      Math.round(e.hp),
      encodeEntityFlags(e),
      Math.round(e.maxHp),
      r1(e.y || 0),
      resolveAnimState(e),
    ]),
    p: sim.projs.slice(0, 40).map((p) => [
      p.id,
      p.type,
      r1(p.x),
      r1(p.y || 1.2),
      r1(p.z),
      r1(p.tx || 0),
      r1(p.tz || 0),
      p.color || '#00f5ff',
    ]),
    fx: sim.effects.slice(0, 25).map((ef) => [
      ef.id,
      ef.type,
      r1(ef.x),
      r1(ef.z),
      r1(ef.r || 2),
      r2(ef.t),
      r2(ef.max),
      ef.color || '#00f5ff',
    ]),
    s: sfx,
  };
}
