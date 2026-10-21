// Simulación autoritativa del Host: fases de Forja y Horda, héroes, defensas, proyectiles y colisiones
import {
  CHARACTERS,
  CRYSTAL_MAX_HP,
  CRYSTAL_RADIUS,
  FORGE_DURATION,
  MAP_RADIUS,
  PORTALS,
  DIFFICULTIES,
  charById,
  defenseById,
  ENEMY_TYPES,
} from './constants.js';
import { buildWaveQueue, stepEnemyAI, computeAutopilotInput } from './ai.js';

// Obstáculos estáticos del mapa (pilares de obsidiana en las ruinas)
export const STATIC_OBSTACLES = [
  { id: 'pil_nw', x: -13, z: -13, r: 2.0 },
  { id: 'pil_ne', x: 13, z: -13, r: 2.0 },
  { id: 'pil_sw', x: -13, z: 13, r: 2.0 },
  { id: 'pil_se', x: 13, z: 13, r: 2.0 },
];

export class Sim {
  constructor(opts = {}) {
    this.mode = opts.mode || 'campana';
    this.diffId = opts.difficulty ?? 1;
    this.diff = DIFFICULTIES.find((d) => d.id === this.diffId) || DIFFICULTIES[1];
    this.maxWaves = opts.maxWaves || (this.mode === 'infinito' ? 99 : 5);
    this.demo = !!opts.demo;

    this.time = 0;
    this.wave = 1;
    this.subPhase = this.demo ? 'horde' : 'forge'; // 'forge' | 'horde'
    this.forgeTimer = FORGE_DURATION;
    this.waveBannerT = 3.0;
    this.nextId = 1;

    this.crystal = {
      hp: CRYSTAL_MAX_HP,
      maxHp: CRYSTAL_MAX_HP,
      hurtT: 0,
    };

    this.obstacles = [...STATIC_OBSTACLES];
    this.turrets = [];
    this.enemies = [];
    this.projs = [];
    this.effects = [];
    this.events = [];
    this.spawnQueue = [];
    this.waveTime = 0;
    this.finished = false;
    this.victory = false;

    const humans = opts.humans && opts.humans.length
      ? opts.humans
      : CHARACTERS.map((c, idx) => ({ slot: idx, char: c.id, autopilot: true }));

    this.heroes = humans.map((h, i) => {
      const ch = charById(h.char);
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const dist = 7.5;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const def0 = ch.defenses[0] ? ch.defenses[0].id : null;
      return {
        id: `h_${h.slot}`,
        slot: h.slot,
        char: ch.id,
        ch,
        human: !h.autopilot,
        autopilot: !!h.autopilot,
        x,
        z,
        rotY: angle + Math.PI,
        hp: ch.stats.hp,
        maxHp: ch.stats.hp,
        mana: this.diff.startMana,
        maxMana: ch.stats.maxMana + 60,
        powerCharge: this.demo ? 80 : 35,
        atkCd: 0,
        attackT: 0,
        castT: 0,
        hurtT: 0,
        frozenT: 0,
        burningT: 0,
        stunnedT: 0,
        buffedT: 0,
        shieldT: 0,
        dead: false,
        respawnT: 0,
        moving: false,
        buildMode: !this.demo,
        buildType: def0,
        holoX: x,
        holoZ: z,
        holoValid: true,
        kills: 0,
        built: 0,
        dmgDealt: 0,
        message: '',
        messageT: 0,
        input: { moveX: 0, moveZ: 0, attack: false, power: false, place: false, selectDef: null },
      };
    });

    if (this.demo) {
      // En modo demo del lobby colocamos algunas defensas iniciales e iniciamos la horda
      this.seedDemoDefenses();
      this.startHordePhase();
    } else {
      this.updateAllHolograms();
    }
  }

  seedDemoDefenses() {
    const spots = [
      { type: 'prisma', x: 0, z: -10, slot: 0 },
      { type: 'barricada', x: 0, z: -15, slot: 1 },
      { type: 'explosiva', x: 14, z: 0, slot: 2 },
      { type: 'aura_elec', x: -11, z: 0, slot: 3 },
      { type: 'balista', x: 0, z: 10, slot: 1 },
    ];
    for (const s of spots) {
      const def = defenseById(s.type);
      this.turrets.push({
        id: `tu_${this.nextId++}`,
        type: def.id,
        def,
        ownerSlot: s.slot,
        x: s.x,
        z: s.z,
        rotY: Math.atan2(s.x, s.z),
        hp: def.hp,
        maxHp: def.hp,
        cd: 0,
        attackT: 0,
        hurtT: 0,
        buffedT: 0,
        dead: false,
      });
    }
  }

  enemiesRemaining() {
    return this.enemies.length + this.spawnQueue.length;
  }

  startHordePhase() {
    if (this.subPhase === 'horde' && this.spawnQueue.length > 0) return;
    this.subPhase = 'horde';
    this.waveTime = 0;
    this.waveBannerT = 3.0;
    const activeCount = Math.max(1, this.heroes.length);
    this.spawnQueue = buildWaveQueue(this.wave, activeCount, this.diffId);
    for (const h of this.heroes) {
      h.buildMode = false;
      this.notifyHero(h, `¡OLEADA ${this.wave} EN MARCHA!`);
    }
    this.events.push({ type: 'sfx', name: 'horn' });
  }

  startForgePhase() {
    this.subPhase = 'forge';
    this.forgeTimer = FORGE_DURATION;
    this.waveBannerT = 3.0;
    this.projs = [];
    // Recompensa de fin de oleada
    this.crystal.hp = Math.min(this.crystal.maxHp, this.crystal.hp + 140);
    for (const h of this.heroes) {
      h.dead = false;
      h.hp = h.maxHp;
      h.mana = Math.min(h.maxMana, h.mana + 65 + this.wave * 10);
      h.buildMode = true;
      if (!h.buildType) h.buildType = h.ch.defenses[0].id;
      this.notifyHero(h, `Fase de Forja · Ronda ${this.wave}`);
    }
    this.updateAllHolograms();
    this.events.push({ type: 'sfx', name: 'forge' });
  }

  notifyHero(hero, text) {
    hero.message = text;
    hero.messageT = 2.6;
  }

  canPlaceDefense(hero, def, x, z) {
    if (!def) return false;
    if (hero.mana < def.cost) return false;
    const dCrystal = Math.hypot(x, z);
    if (dCrystal < CRYSTAL_RADIUS + (def.radius || 1.3) + 1.2) return false;
    if (dCrystal > MAP_RADIUS - 3.2) return false;

    // Verificar portales
    for (const p of PORTALS) {
      if (Math.hypot(x - p.x, z - p.z) < 4.5) return false;
    }
    // Verificar pilares estáticos
    for (const obs of STATIC_OBSTACLES) {
      if (Math.hypot(x - obs.x, z - obs.z) < obs.r + (def.radius || 1.3) + 0.5) return false;
    }
    // Verificar otras torretas
    for (const tu of this.turrets) {
      if (tu.dead) continue;
      const minDist = (tu.def.radius || 1.3) + (def.radius || 1.3) + 0.6;
      if (Math.hypot(x - tu.x, z - tu.z) < minDist) return false;
    }
    return true;
  }

  updateHeroHologram(hero) {
    const def = defenseById(hero.buildType || hero.ch.defenses[0].id);
    const lookDist = 3.6;
    const hx = hero.x + Math.sin(hero.rotY) * lookDist;
    const hz = hero.z + Math.cos(hero.rotY) * lookDist;
    hero.holoX = hx;
    hero.holoZ = hz;
    hero.holoValid = this.canPlaceDefense(hero, def, hx, hz);
  }

  updateAllHolograms() {
    for (const h of this.heroes) this.updateHeroHologram(h);
  }

  tryPlaceDefense(hero) {
    const defId = hero.buildType || hero.ch.defenses[0].id;
    const def = defenseById(defId);
    this.updateHeroHologram(hero);
    if (!this.canPlaceDefense(hero, def, hero.holoX, hero.holoZ)) {
      if (hero.mana < def.cost) this.notifyHero(hero, 'Maná insuficiente');
      else this.notifyHero(hero, 'Espacio bloqueado');
      return false;
    }
    hero.mana -= def.cost;
    hero.built++;
    hero.castT = 0.35;
    const turret = {
      id: `tu_${this.nextId++}`,
      type: def.id,
      def,
      ownerSlot: hero.slot,
      x: hero.holoX,
      z: hero.holoZ,
      rotY: hero.rotY,
      hp: def.hp,
      maxHp: def.hp,
      cd: 0.2,
      attackT: 0,
      hurtT: 0,
      buffedT: 0,
      dead: false,
    };
    this.turrets.push(turret);
    this.spawnEffect('build', turret.x, turret.z, 2.5, 0.45, def.color);
    this.events.push({ type: 'sfx', name: 'build' });
    this.events.push({ type: 'buzz', slot: hero.slot, ms: 25 });
    this.updateHeroHologram(hero);
    return true;
  }

  step(dt) {
    if (this.finished) return;
    this.time += dt;
    if (this.waveBannerT > 0) this.waveBannerT = Math.max(0, this.waveBannerT - dt);
    if (this.crystal.hurtT > 0) this.crystal.hurtT = Math.max(0, this.crystal.hurtT - dt);

    // Regeneración pasiva de maná
    for (const h of this.heroes) {
      if (!h.dead) {
        const regen = this.subPhase === 'forge' ? 6.0 : 3.2;
        h.mana = Math.min(h.maxMana, h.mana + regen * dt);
      }
    }

    // Ciclo de fases
    if (this.subPhase === 'forge') {
      this.forgeTimer -= dt;
      if (this.forgeTimer <= 0) {
        this.startHordePhase();
      }
    } else if (this.subPhase === 'horde') {
      this.waveTime += dt;
      // Spawnear enemigos pendientes cuyo delay se haya cumplido
      while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.waveTime) {
        const spec = this.spawnQueue.shift();
        this.enemies.push({
          id: `e_${this.nextId++}`,
          type: spec.type,
          spec: ENEMY_TYPES[spec.type],
          x: spec.x,
          y: 0,
          z: spec.z,
          rotY: Math.atan2(-spec.x, -spec.z),
          hp: spec.hp,
          maxHp: spec.maxHp,
          speed: spec.speed,
          dmg: spec.dmg,
          radius: spec.radius,
          reward: spec.reward,
          atkCd: 0.5,
          attackT: 0,
          hurtT: 0,
          frozenT: 0,
          burningT: 0,
          stunnedT: 0,
          liftedT: 0,
          burnTick: 0,
          moving: true,
          dead: false,
        });
        this.spawnEffect('portal', spec.x, spec.z, 2.2, 0.4, '#ff007f');
      }
    }

    // Actualizar Héroes
    for (const h of this.heroes) {
      this.stepHero(h, dt);
    }

    // Actualizar Torretas y Defensas
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const tu = this.turrets[i];
      if (tu.dead || tu.hp <= 0) {
        this.spawnEffect('boom', tu.x, tu.z, 2.8, 0.45, '#ff4d5e');
        this.turrets.splice(i, 1);
        continue;
      }
      this.stepTurret(tu, dt);
    }

    // Actualizar Proyectiles
    this.stepProjectiles(dt);

    // Actualizar Enemigos (Horda)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead || e.hp <= 0) {
        this.onEnemyKilled(e);
        this.enemies.splice(i, 1);
        continue;
      }
      this.stepEnemyStatus(e, dt);
      stepEnemyAI(e, this, dt);
    }

    // Actualizar Efectos Visuales
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i];
      ef.t += dt;
      if (ef.t >= ef.max) this.effects.splice(i, 1);
    }

    // Comprobar fin de oleada en Fase de Horda
    if (this.subPhase === 'horde' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this.demo) {
        this.wave = (this.wave % 5) + 1;
        this.startHordePhase();
      } else if (this.wave >= this.maxWaves) {
        this.finished = true;
        this.victory = true;
        this.events.push({ type: 'sfx', name: 'victory' });
        this.events.push({ type: 'done', victory: true });
      } else {
        this.wave++;
        this.startForgePhase();
      }
    }
  }

  stepHero(h, dt) {
    if (h.messageT > 0) h.messageT = Math.max(0, h.messageT - dt);
    if (h.attackT > 0) h.attackT = Math.max(0, h.attackT - dt);
    if (h.castT > 0) h.castT = Math.max(0, h.castT - dt);
    if (h.hurtT > 0) h.hurtT = Math.max(0, h.hurtT - dt);
    if (h.buffedT > 0) h.buffedT = Math.max(0, h.buffedT - dt);
    if (h.shieldT > 0) h.shieldT = Math.max(0, h.shieldT - dt);
    if (h.atkCd > 0) h.atkCd = Math.max(0, h.atkCd - dt);

    if (h.dead) {
      h.respawnT -= dt;
      if (h.respawnT <= 0) {
        h.dead = false;
        h.hp = h.maxHp;
        const ang = (h.slot * Math.PI) / 2;
        h.x = Math.cos(ang) * 7;
        h.z = Math.sin(ang) * 7;
        this.spawnEffect('heal', h.x, h.z, 3.0, 0.5, h.ch.color);
      }
      return;
    }

    const inp = h.autopilot || this.demo ? computeAutopilotInput(h, this) : h.input;

    // Selección de defensa
    if (inp.selectDef) {
      const validDef = h.ch.defenses.find((d) => d.id === inp.selectDef);
      if (validDef) h.buildType = validDef.id;
    }

    // Movimiento
    const mx = Number(inp.moveX) || 0;
    const mz = Number(inp.moveZ) || 0;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 0.08) {
      const nx = mx / Math.max(1, mLen);
      const nz = mz / Math.max(1, mLen);
      const spdBoost = h.buffedT > 0 ? 1.35 : 1.0;
      const spd = h.ch.stats.speed * spdBoost;
      let nextX = h.x + nx * spd * dt;
      let nextZ = h.z + nz * spd * dt;

      // Colisión con el Cristal de Éter y borde del mapa
      const distC = Math.hypot(nextX, nextZ);
      if (distC < CRYSTAL_RADIUS + 1.1) {
        const push = (CRYSTAL_RADIUS + 1.1) / (distC || 1);
        nextX *= push;
        nextZ *= push;
      } else if (distC > MAP_RADIUS - 1.5) {
        const pull = (MAP_RADIUS - 1.5) / distC;
        nextX *= pull;
        nextZ *= pull;
      }

      h.x = nextX;
      h.z = nextZ;
      h.rotY = Math.atan2(nx, nz);
      h.moving = true;
    } else {
      h.moving = false;
    }

    this.updateHeroHologram(h);

    // Colocar defensa (permitido en Fase de Forja, o si el jugador pulsa construir con maná suficiente)
    if (inp.place) {
      this.tryPlaceDefense(h);
    }

    // Ataque Básico
    if (inp.attack && h.atkCd <= 0) {
      this.performBasicAttack(h);
    }

    // Habilidad Definitiva (Power)
    if (inp.power && h.powerCharge >= 100) {
      this.performUltimatePower(h);
    }
  }

  performBasicAttack(h) {
    const basic = h.ch.basicAttack;
    h.atkCd = basic.cooldown * (h.buffedT > 0 ? 0.75 : 1.0);
    h.attackT = 0.28;

    // Buscar enemigo más cercano dentro de rango para auto-apuntado suave
    let target = null;
    let bestD = basic.range + 2;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d < bestD) {
        bestD = d;
        target = e;
      }
    }
    if (target) {
      h.rotY = Math.atan2(target.x - h.x, target.z - h.z);
    }

    const dirX = Math.sin(h.rotY);
    const dirZ = Math.cos(h.rotY);

    if (h.char === 'tecnomago') {
      // Proyectiles de plasma teledirigidos
      this.projs.push({
        id: `p_${this.nextId++}`,
        type: 'plasma',
        ownerSlot: h.slot,
        x: h.x + dirX * 1.2,
        y: 1.6,
        z: h.z + dirZ * 1.2,
        vx: dirX * basic.speed,
        vz: dirZ * basic.speed,
        speed: basic.speed,
        dmg: basic.dmg,
        homing: true,
        targetId: target ? target.id : null,
        life: 1.4,
        color: '#00f5ff',
      });
    } else if (h.char === 'paladin') {
      // Golpe pesado de área (Melee) con martillo de energía
      const hitX = h.x + dirX * 2.2;
      const hitZ = h.z + dirZ * 2.2;
      this.spawnEffect('slam', hitX, hitZ, basic.aoe, 0.35, '#ff6a00');
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - hitX, e.z - hitZ);
        if (d <= basic.aoe) {
          this.damageEnemy(e, basic.dmg, h);
          // Empuje contundente
          const kd = Math.hypot(e.x - h.x, e.z - h.z) || 1;
          e.x += ((e.x - h.x) / kd) * 1.4;
          e.z += ((e.z - h.z) / kd) * 1.4;
        }
      }
    } else if (h.char === 'cazadora') {
      // Ráfaga rápida de flechas láser
      for (const spread of [-0.09, 0.09]) {
        const ang = h.rotY + spread;
        this.projs.push({
          id: `p_${this.nextId++}`,
          type: 'laser_arrow',
          ownerSlot: h.slot,
          x: h.x + Math.sin(ang) * 1.1,
          y: 1.4,
          z: h.z + Math.cos(ang) * 1.1,
          vx: Math.sin(ang) * basic.speed,
          vz: Math.cos(ang) * basic.speed,
          speed: basic.speed,
          dmg: basic.dmg,
          homing: false,
          life: 0.9,
          color: '#ff007f',
        });
      }
    } else if (h.char === 'chaman') {
      // Cadena de relámpagos que rebota entre enemigos
      if (target) {
        const hitSet = new Set();
        let curr = target;
        let prevX = h.x;
        let prevZ = h.z;
        let dmg = basic.dmg;
        for (let b = 0; b < basic.chain && curr; b++) {
          hitSet.add(curr.id);
          this.damageEnemy(curr, dmg, h);
          this.projs.push({
            id: `p_${this.nextId++}`,
            type: 'chain_bolt',
            x: prevX,
            y: 1.5,
            z: prevZ,
            tx: curr.x,
            tz: curr.z,
            life: 0.18,
            color: '#39ff14',
          });
          prevX = curr.x;
          prevZ = curr.z;
          dmg = Math.round(dmg * 0.8);
          // Buscar siguiente enemigo para rebotar
          let nextE = null;
          let nextD = basic.chainRange;
          for (const cand of this.enemies) {
            if (cand.dead || hitSet.has(cand.id)) continue;
            const cd = Math.hypot(cand.x - prevX, cand.z - prevZ);
            if (cd < nextD) {
              nextD = cd;
              nextE = cand;
            }
          }
          curr = nextE;
        }
      } else {
        // Disparo de pulso si no hay objetivo directo
        this.projs.push({
          id: `p_${this.nextId++}`,
          type: 'plasma',
          ownerSlot: h.slot,
          x: h.x + dirX * 1.2,
          y: 1.5,
          z: h.z + dirZ * 1.2,
          vx: dirX * 20,
          vz: dirZ * 20,
          speed: 20,
          dmg: basic.dmg,
          life: 0.8,
          color: '#39ff14',
        });
      }
    }
    this.events.push({ type: 'sfx', name: 'attack' });
  }

  performUltimatePower(h) {
    h.powerCharge = 0;
    h.castT = 0.65;
    this.events.push({ type: 'sfx', name: 'power' });
    this.events.push({ type: 'buzz', slot: h.slot, ms: 65 });
    this.notifyHero(h, `¡${h.ch.powerName.toUpperCase()}!`);

    if (h.char === 'tecnomago') {
      // Singularidad Criogénica: congela y daña en gran radio
      this.spawnEffect('nova', h.x, h.z, 13, 0.85, '#00f5ff');
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - h.x, e.z - h.z) <= 13) {
          e.frozenT = 5.0;
          this.damageEnemy(e, 145, h);
        }
      }
    } else if (h.char === 'paladin') {
      // Juicio de Obsidiana: aturde, quema y repara defensas
      this.spawnEffect('nova', h.x, h.z, 11, 0.85, '#ff6a00');
      h.shieldT = 6.0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - h.x, e.z - h.z) <= 11) {
          e.stunnedT = 3.2;
          e.burningT = 4.5;
          this.damageEnemy(e, 160, h);
        }
      }
      for (const tu of this.turrets) {
        tu.hp = Math.min(tu.maxHp, tu.hp + 150);
      }
    } else if (h.char === 'cazadora') {
      // Bombardeo Orbital Neón: lluvia láser sobre enemigos cercanos
      h.buffedT = 6.5;
      this.spawnEffect('nova', h.x, h.z, 14, 0.75, '#ff007f');
      const targets = this.enemies.filter((e) => !e.dead).slice(0, 10);
      for (const e of targets) {
        this.spawnEffect('boom', e.x, e.z, 3.5, 0.45, '#ff007f');
        e.burningT = 3.5;
        this.damageEnemy(e, 135, h);
      }
    } else if (h.char === 'chaman') {
      // Tormenta de Tótems: electrocuta horda y cura al Cristal de Éter
      this.spawnEffect('nova', 0, 0, 12, 0.9, '#39ff14');
      this.crystal.hp = Math.min(this.crystal.maxHp, this.crystal.hp + 240);
      for (const ally of this.heroes) {
        if (!ally.dead) ally.hp = Math.min(ally.maxHp, ally.hp + 100);
      }
      for (const e of this.enemies.slice(0, 12)) {
        if (e.dead) continue;
        e.stunnedT = 2.0;
        this.damageEnemy(e, 120, h);
        this.projs.push({
          id: `p_${this.nextId++}`,
          type: 'chain_bolt',
          x: h.x,
          y: 2.2,
          z: h.z,
          tx: e.x,
          tz: e.z,
          life: 0.3,
          color: '#39ff14',
        });
      }
    }
  }

  stepTurret(tu, dt) {
    if (tu.attackT > 0) tu.attackT = Math.max(0, tu.attackT - dt);
    if (tu.hurtT > 0) tu.hurtT = Math.max(0, tu.hurtT - dt);
    if (tu.buffedT > 0) tu.buffedT = Math.max(0, tu.buffedT - dt);

    const def = tu.def;
    const rateMult = tu.buffedT > 0 ? 1.45 : 1.0;
    const dmgMult = tu.buffedT > 0 ? 1.45 : 1.0;
    tu.cd -= dt * rateMult;

    // Aura Potenciadora: aplica buff a torretas y héroes aliados en rango
    if (def.type === 'aura_pot') {
      if (tu.cd <= 0) {
        tu.cd = def.rate;
        for (const other of this.turrets) {
          if (other === tu || other.dead) continue;
          if (Math.hypot(other.x - tu.x, other.z - tu.z) <= def.range) {
            other.buffedT = 1.5;
          }
        }
        for (const h of this.heroes) {
          if (!h.dead && Math.hypot(h.x - tu.x, h.z - tu.z) <= def.range) {
            h.buffedT = 1.5;
          }
        }
      }
      return;
    }

    if (tu.cd > 0 || this.enemies.length === 0) return;

    // Aura Eléctrica: daño constante a todos los enemigos en su radio
    if (def.type === 'aura_dmg') {
      let hitAny = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - tu.x, e.z - tu.z) <= def.range) {
          this.damageEnemy(e, def.dmg * dmgMult, null, tu.ownerSlot);
          hitAny = true;
        }
      }
      if (hitAny) {
        tu.cd = def.rate;
        tu.attackT = 0.25;
      }
      return;
    }

    // Trampa Explosiva de Piso
    if (def.type === 'trap_boom') {
      const triggered = this.enemies.some(
        (e) => !e.dead && Math.hypot(e.x - tu.x, e.z - tu.z) <= def.range
      );
      if (triggered) {
        tu.cd = def.rate;
        tu.attackT = 0.4;
        this.spawnEffect('boom', tu.x, tu.z, def.aoe, 0.45, def.color);
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - tu.x, e.z - tu.z) <= def.aoe) {
            e.burningT = 3.5;
            this.damageEnemy(e, def.dmg * dmgMult, null, tu.ownerSlot);
          }
        }
        tu.hp -= 22; // desgaste por activación
      }
      return;
    }

    // Trampa de Gravedad (levanta enemigos en el aire)
    if (def.type === 'trap_grav') {
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - tu.x, e.z - tu.z) <= def.range) {
          e.liftedT = def.stun || 1.8;
          e.stunnedT = def.stun || 1.8;
          this.damageEnemy(e, def.dmg * dmgMult, null, tu.ownerSlot);
          hit = true;
        }
      }
      if (hit) {
        tu.cd = def.rate;
        tu.attackT = 0.5;
        this.spawnEffect('grav', tu.x, tu.z, def.range, 0.55, def.color);
        tu.hp -= 18;
      }
      return;
    }

    // Buscar enemigo más cercano dentro de rango para torretas direccionales
    let target = null;
    let bestDist = def.range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - tu.x, e.z - tu.z);
      if (d <= bestDist) {
        bestDist = d;
        target = e;
      }
    }

    if (!target) return;
    tu.rotY = Math.atan2(target.x - tu.x, target.z - tu.z);
    tu.cd = def.rate;
    tu.attackT = 0.25;

    if (def.type === 'beam') {
      // Torreta Prisma: rayo continuo instantáneo
      this.damageEnemy(target, def.dmg * dmgMult, null, tu.ownerSlot);
      this.projs.push({
        id: `p_${this.nextId++}`,
        type: 'beam',
        x: tu.x,
        y: 2.1,
        z: tu.z,
        tx: target.x,
        tz: target.z,
        life: 0.16,
        color: def.color,
      });
    } else if (def.type === 'cryo') {
      // Torreta Criogénica: ralentiza y congela en cono/radio
      this.spawnEffect('nova', tu.x, tu.z, def.range * 0.85, 0.35, def.color);
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - tu.x, e.z - tu.z) <= def.range) {
          e.frozenT = 2.8;
          this.damageEnemy(e, def.dmg * dmgMult, null, tu.ownerSlot);
        }
      }
    } else if (def.type === 'pierce') {
      // Balista Perforante: proyectil de alta velocidad que atraviesa
      const dx = Math.sin(tu.rotY);
      const dz = Math.cos(tu.rotY);
      this.projs.push({
        id: `p_${this.nextId++}`,
        type: 'pierce_bolt',
        ownerSlot: tu.ownerSlot,
        x: tu.x + dx * 1.2,
        y: 1.5,
        z: tu.z + dz * 1.2,
        vx: dx * 28,
        vz: dz * 28,
        dmg: def.dmg * dmgMult,
        pierce: 3,
        hitIds: new Set(),
        life: 0.8,
        color: def.color,
      });
    } else if (def.type === 'wall') {
      // Pulso defensivo corto de la Barricada de Escudos
      this.damageEnemy(target, def.dmg * dmgMult, null, tu.ownerSlot);
    }
  }

  stepProjectiles(dt) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.projs.splice(i, 1);
        continue;
      }
      // Rayos instantáneos (beam / chain_bolt) solo duran visualmente
      if (p.type === 'beam' || p.type === 'chain_bolt') continue;

      if (p.homing && p.targetId) {
        const tgt = this.enemies.find((e) => e.id === p.targetId && !e.dead);
        if (tgt) {
          const dx = tgt.x - p.x;
          const dz = tgt.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          p.vx = (dx / d) * p.speed;
          p.vz = (dz / d) * p.speed;
        }
      }

      p.x += (p.vx || 0) * dt;
      p.z += (p.vz || 0) * dt;

      // Colisión proyectil -> enemigo
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (p.hitIds && p.hitIds.has(e.id)) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d <= e.radius + 0.75) {
          this.damageEnemy(e, p.dmg, null, p.ownerSlot);
          if (p.pierce && p.pierce > 1) {
            p.pierce--;
            p.hitIds.add(e.id);
          } else {
            p.life = 0;
            break;
          }
        }
      }
    }
  }

  stepEnemyStatus(e, dt) {
    if (e.attackT > 0) e.attackT = Math.max(0, e.attackT - dt);
    if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - dt);
    if (e.frozenT > 0) e.frozenT = Math.max(0, e.frozenT - dt);
    if (e.stunnedT > 0) e.stunnedT = Math.max(0, e.stunnedT - dt);
    if (e.liftedT > 0) {
      e.liftedT = Math.max(0, e.liftedT - dt);
      e.y = e.liftedT > 0 ? 2.5 : 0;
    } else {
      e.y = 0;
    }
    if (e.burningT > 0) {
      e.burningT = Math.max(0, e.burningT - dt);
      e.burnTick = (e.burnTick || 0) + dt;
      if (e.burnTick >= 0.5) {
        e.burnTick = 0;
        this.damageEnemy(e, 12);
      }
    }
  }

  damageEnemy(e, amount, hero = null, ownerSlot = null) {
    if (e.dead) return;
    const dmg = Math.max(1, Math.round(amount));
    e.hp -= dmg;
    e.hurtT = 0.18;
    const h = hero || (ownerSlot !== null ? this.heroes.find((x) => x.slot === ownerSlot) : null);
    if (h) {
      h.dmgDealt += dmg;
      h.powerCharge = Math.min(100, h.powerCharge + dmg * 0.18);
    }
    if (e.hp <= 0) {
      e.dead = true;
      if (h) h.kills++;
    }
  }

  onEnemyKilled(e) {
    this.spawnEffect('boom', e.x, e.z, e.radius * 1.8, 0.35, e.spec ? e.spec.color : '#39ff14');
    // Otorgar maná y carga definitiva a los héroes
    const share = Math.max(4, Math.round((e.reward || 10) / Math.max(1, this.heroes.length)));
    for (const h of this.heroes) {
      h.mana = Math.min(h.maxMana, h.mana + share);
      h.powerCharge = Math.min(100, h.powerCharge + 4);
    }
  }

  damageTurret(tu, amount, attacker) {
    if (tu.dead) return;
    tu.hp -= amount;
    tu.hurtT = 0.25;
    // Si es la Barricada de Escudos, devuelve daño (thorns)
    if (tu.def.thorns && attacker && !attacker.dead) {
      this.damageEnemy(attacker, amount * tu.def.thorns, null, tu.ownerSlot);
    }
    if (tu.hp <= 0) {
      tu.dead = true;
    }
  }

  damageCrystal(amount) {
    if (this.finished) return;
    this.crystal.hp = Math.max(0, this.crystal.hp - amount);
    this.crystal.hurtT = 0.35;
    this.spawnEffect('crystal_hit', 0, 0, 4.2, 0.4, '#ff007f');
    this.events.push({ type: 'sfx', name: 'hit' });

    if (this.crystal.hp <= 0 && !this.demo) {
      this.finished = true;
      this.victory = false;
      this.events.push({ type: 'sfx', name: 'defeat' });
      this.events.push({ type: 'done', victory: false });
    } else if (this.crystal.hp <= 0 && this.demo) {
      this.crystal.hp = this.crystal.maxHp;
    }
  }

  spawnEffect(type, x, z, r = 2.5, max = 0.4, color = '#00f5ff') {
    this.effects.push({
      id: `fx_${this.nextId++}`,
      type,
      x,
      z,
      r,
      t: 0,
      max,
      color,
    });
  }

  results() {
    return this.heroes.map((h) => ({
      slot: h.slot,
      char: h.char,
      kills: h.kills,
      built: h.built,
      dmgDealt: Math.round(h.dmgDealt),
    }));
  }
}
