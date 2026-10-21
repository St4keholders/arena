// Inteligencia artificial, pathfinding de hordas y generador de oleadas para ARENA
import { PORTALS, ENEMY_TYPES, DIFFICULTIES, CRYSTAL_RADIUS } from './constants.js';

/**
 * Genera la cola de enemigos para la ronda (wave) actual.
 * Aumenta la cantidad, variedad y vida de los enemigos en cada oleada.
 */
export function buildWaveQueue(wave, playerCount = 1, diffId = 1) {
  const diff = DIFFICULTIES.find((d) => d.id === diffId) || DIFFICULTIES[1];
  const pScale = 1 + Math.max(0, playerCount - 1) * 0.38;
  const waveHpScale = (1 + (wave - 1) * 0.28) * diff.hpMult * pScale;
  const waveSpdScale = (1 + Math.min(0.45, (wave - 1) * 0.04)) * diff.spdMult;

  const totalCount = Math.round((8 + wave * 5) * (1 + (playerCount - 1) * 0.3));
  const queue = [];

  for (let i = 0; i < totalCount; i++) {
    let type = 'swarm';
    // Introducir Golems corruptos desde la oleada 1 (al final) y más frecuentes después
    if (wave >= 1 && i % 4 === 3) type = 'golem';
    if (wave >= 2 && i % 3 === 2) type = 'golem';
    // Introducir Colosos de Obsidiana desde la oleada 3 o al final de oleadas avanzadas
    if (wave >= 3 && (i === totalCount - 1 || (wave >= 4 && i % 9 === 8))) {
      type = 'colossus';
    }

    const base = ENEMY_TYPES[type];
    const portalIndex = (i + wave) % PORTALS.length;
    const portal = PORTALS[portalIndex];
    const jitterAngle = (Math.random() - 0.5) * 0.6;
    const spawnDist = 1.8;

    queue.push({
      type,
      portalId: portal.id,
      x: portal.x + Math.cos(portal.rotY + jitterAngle) * spawnDist,
      z: portal.z + Math.sin(portal.rotY + jitterAngle) * spawnDist,
      hp: Math.round(base.hp * waveHpScale),
      maxHp: Math.round(base.hp * waveHpScale),
      speed: base.speed * waveSpdScale,
      dmg: Math.round(base.dmg * (1 + (wave - 1) * 0.15) * diff.hpMult),
      radius: base.radius,
      reward: base.reward,
      delay: i * Math.max(0.38, 1.35 - wave * 0.08),
    });
  }

  return queue;
}

/**
 * Pathfinding básico hacia el Cristal de Éter (0,0,0):
 * - Avanza en línea recta hacia (0,0,0)
 * - Rodea obstáculos/torretas no bloqueantes mediante vectores tangenciales
 * - Si choca con una Barricada de Escudos o un Héroe cercano, la ataca o la rodea
 * - Aplica fuerza de separación entre enemigos para evitar solapamiento
 */
export function stepEnemyAI(enemy, sim, dt) {
  if (enemy.dead || enemy.hp <= 0) return;

  // Estados alterados
  if (enemy.stunnedT > 0 || enemy.liftedT > 0) {
    enemy.moving = false;
    return;
  }

  const slowMult = enemy.frozenT > 0 ? 0.45 : 1.0;
  const moveSpeed = enemy.speed * slowMult;

  // 1. Verificar si hay una Barricada de Escudos bloqueando el paso o provocando aggro
  let blockingTurret = null;
  let minTurretDist = Infinity;
  for (const tu of sim.turrets) {
    if (tu.dead || tu.hp <= 0) continue;
    const dx = tu.x - enemy.x;
    const dz = tu.z - enemy.z;
    const d = Math.hypot(dx, dz);
    const aggroRange = tu.def.blocksPath ? 4.8 : 2.2;
    if (d < aggroRange && d < minTurretDist) {
      minTurretDist = d;
      blockingTurret = tu;
    }
  }

  // 2. Si está en rango de ataque de una torreta bloqueante, atacarla
  if (blockingTurret) {
    const stopDist = (blockingTurret.def.radius || 1.5) + enemy.radius + 0.35;
    if (minTurretDist <= stopDist) {
      enemy.moving = false;
      enemy.rotY = Math.atan2(blockingTurret.x - enemy.x, blockingTurret.z - enemy.z);
      enemy.atkCd = (enemy.atkCd || 0) - dt * slowMult;
      if (enemy.atkCd <= 0) {
        enemy.atkCd = 1.1;
        enemy.attackT = 0.3;
        sim.damageTurret(blockingTurret, enemy.dmg, enemy);
      }
      return;
    }
  }

  // 3. Verificar distancia al Cristal de Éter (0, 0, 0)
  const distToCrystal = Math.hypot(enemy.x, enemy.z);
  const crystalStopDist = CRYSTAL_RADIUS + enemy.radius + 0.4;
  if (distToCrystal <= crystalStopDist) {
    enemy.moving = false;
    enemy.rotY = Math.atan2(-enemy.x, -enemy.z);
    enemy.atkCd = (enemy.atkCd || 0) - dt * slowMult;
    if (enemy.atkCd <= 0) {
      enemy.atkCd = 1.2;
      enemy.attackT = 0.35;
      sim.damageCrystal(enemy.dmg, enemy);
    }
    return;
  }

  // 4. Calcular dirección hacia el objetivo (Barricada cercana o Cristal en 0,0,0)
  const targetX = blockingTurret ? blockingTurret.x : 0;
  const targetZ = blockingTurret ? blockingTurret.z : 0;
  let dirX = targetX - enemy.x;
  let dirZ = targetZ - enemy.z;
  const len = Math.hypot(dirX, dirZ) || 1;
  dirX /= len;
  dirZ /= len;

  // 5. Rodear obstáculos (otras torretas y pilares de ruinas)
  for (const obs of sim.obstacles) {
    const ox = obs.x - enemy.x;
    const oz = obs.z - enemy.z;
    const od = Math.hypot(ox, oz);
    const avoidR = (obs.r || 1.8) + enemy.radius + 1.1;
    if (od < avoidR && od > 0.01) {
      const dot = (ox / od) * dirX + (oz / od) * dirZ;
      if (dot > 0.1) {
        // Empujar tangencialmente para rodear el obstáculo
        const side = (ox * dirZ - oz * dirX) >= 0 ? 1 : -1;
        const tangentX = -dirZ * side;
        const tangentZ = dirX * side;
        const strength = ((avoidR - od) / avoidR) * 1.6;
        dirX += tangentX * strength;
        dirZ += tangentZ * strength;
      }
    }
  }

  // 6. Separación entre enemigos cercanos
  for (const other of sim.enemies) {
    if (other === enemy || other.dead) continue;
    const sx = enemy.x - other.x;
    const sz = enemy.z - other.z;
    const sd = Math.hypot(sx, sz);
    const minSep = enemy.radius + other.radius + 0.25;
    if (sd < minSep && sd > 0.001) {
      const push = ((minSep - sd) / minSep) * 1.1;
      dirX += (sx / sd) * push;
      dirZ += (sz / sd) * push;
    }
  }

  const finalLen = Math.hypot(dirX, dirZ) || 1;
  dirX /= finalLen;
  dirZ /= finalLen;

  enemy.x += dirX * moveSpeed * dt;
  enemy.z += dirZ * moveSpeed * dt;
  enemy.rotY = Math.atan2(dirX, dirZ);
  enemy.moving = true;
}

/**
 * IA de respaldo para héroes en modo demo o desconexión temporal
 */
export function computeAutopilotInput(hero, sim) {
  const inp = { moveX: 0, moveZ: 0, attack: false, power: false, place: false, selectDef: null };

  if (sim.subPhase === 'forge') {
    const def = hero.ch.defenses[0];
    if (def && hero.mana >= def.cost && sim.turrets.filter((t) => t.ownerSlot === hero.slot).length < 3) {
      const angle = (hero.slot * Math.PI) / 2 + sim.turrets.length * 0.65;
      const goalX = Math.cos(angle) * 11;
      const goalZ = Math.sin(angle) * 11;
      const dx = goalX - hero.x;
      const dz = goalZ - hero.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.0) {
        inp.moveX = dx / d;
        inp.moveZ = dz / d;
      } else {
        inp.selectDef = def.id;
        inp.place = true;
      }
      return inp;
    }
    // Patrullar alrededor del Cristal
    const patrolAngle = sim.time * 0.6 + hero.slot * 1.57;
    const px = Math.cos(patrolAngle) * 8;
    const pz = Math.sin(patrolAngle) * 8;
    const dx = px - hero.x;
    const dz = pz - hero.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.2) {
      inp.moveX = dx / d;
      inp.moveZ = dz / d;
    }
    return inp;
  }

  // Fase de Horda: buscar enemigo más cercano al Cristal
  let target = null;
  let bestScore = Infinity;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const dCrystal = Math.hypot(e.x, e.z);
    if (dCrystal < bestScore) {
      bestScore = dCrystal;
      target = e;
    }
  }

  if (target) {
    const dx = target.x - hero.x;
    const dz = target.z - hero.z;
    const d = Math.hypot(dx, dz) || 1;
    const desiredDist = hero.ch.basicAttack.melee ? 2.8 : hero.ch.basicAttack.range * 0.7;
    if (d > desiredDist) {
      inp.moveX = dx / d;
      inp.moveZ = dz / d;
    } else if (!hero.ch.basicAttack.melee && d < 4.0) {
      inp.moveX = -dx / d;
      inp.moveZ = -dz / d;
    }
    if (d <= hero.ch.basicAttack.range) {
      inp.attack = true;
    }
    if (hero.powerCharge >= 100 && d <= 12) {
      inp.power = true;
    }
  }

  return inp;
}
