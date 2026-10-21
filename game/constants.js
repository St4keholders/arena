// Datos generales y constantes de ARENA (Tower Defense 3D P2P)

export const GAME_NAME = 'ARENA';
// SHA-256 precalculado de la contraseña 'juan2026*'
export const PASSWORD_HASH = 'b84278f09dc30d6b6710c7628dbe93a440013d3dd152c147c19fe00ba4fecf4f';
export const PEER_PREFIX = 'ARNA';

export const MAX_PLAYERS = 4;
export const SLOT_COLORS = ['#00f5ff', '#ff007f', '#39ff14', '#ffb800'];
export const SLOT_NAMES = ['J1', 'J2', 'J3', 'J4'];

export const MAP_RADIUS = 38;
export const CRYSTAL_MAX_HP = 1500;
export const CRYSTAL_RADIUS = 3.2;
export const FORGE_DURATION = 35; // segundos de fase de forja

export const PORTALS = [
  { id: 0, x: 0, z: -33, rotY: 0, color: '#ff007f', name: 'Portal Norte' },
  { id: 1, x: 33, z: 0, rotY: -Math.PI / 2, color: '#b400ff', name: 'Portal Este' },
  { id: 2, x: 0, z: 33, rotY: Math.PI, color: '#ff007f', name: 'Portal Sur' },
  { id: 3, x: -33, z: 0, rotY: Math.PI / 2, color: '#b400ff', name: 'Portal Oeste' },
];

export const CHARACTERS = [
  {
    id: 'tecnomago',
    name: 'Tecnomago',
    full: 'Tecnomago de Éter',
    role: 'Artillería Arcana y Control',
    color: '#00f5ff',
    trim: '#7df9ff',
    accent: '#b400ff',
    aesthetic: 'Túnica flotante con cables luminosos, levita en vez de caminar.',
    stats: { hp: 240, maxMana: 120, speed: 8.5, attack: 4, defense: 2, magic: 5 },
    basicAttack: {
      name: 'Plasma Teledirigido',
      desc: 'Proyectiles de plasma teledirigidos',
      range: 15,
      dmg: 28,
      cooldown: 0.42,
      speed: 22,
      homing: true,
    },
    power: 'singularity',
    powerName: 'Singularidad Criogénica',
    powerDesc: 'Desata un pulso de plasma y frío absoluto que daña y congela a los enemigos cercanos.',
    defenses: [
      {
        id: 'prisma',
        name: 'Torreta Prisma',
        short: 'Prisma',
        cost: 40,
        hp: 220,
        range: 12.5,
        dmg: 38,
        rate: 0.25,
        radius: 1.3,
        type: 'beam',
        color: '#00f5ff',
        desc: 'Rayos continuos de alta energía hacia el objetivo.',
      },
      {
        id: 'crio',
        name: 'Torreta Criogénica',
        short: 'Criogénica',
        cost: 50,
        hp: 200,
        range: 10,
        dmg: 14,
        rate: 0.75,
        radius: 1.3,
        type: 'cryo',
        slow: 0.45,
        color: '#7df9ff',
        desc: 'Ralentiza y congela a las hordas en su radio.',
      },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladín de Ónice',
    full: 'Paladín de Ónice',
    role: 'Coloso Melee y Fortificación',
    color: '#ff6a00',
    trim: '#231f2e',
    accent: '#ffb800',
    aesthetic: 'Armadura masiva oscura con grietas de luz naranja, animaciones lentas pero contundentes.',
    stats: { hp: 420, maxMana: 90, speed: 6.8, attack: 5, defense: 5, magic: 2 },
    basicAttack: {
      name: 'Martillo de Energía',
      desc: 'Golpes pesados de área (Melee) con un martillo de energía',
      range: 4.8,
      aoe: 4.2,
      dmg: 58,
      cooldown: 0.65,
      melee: true,
    },
    power: 'obsidian_judgment',
    powerName: 'Juicio de Obsidiana',
    powerDesc: 'Impacto sísmico que aturde a la horda, quema el suelo y repara barreras cercanas.',
    defenses: [
      {
        id: 'barricada',
        name: 'Barricada de Escudos',
        short: 'Barricada',
        cost: 35,
        hp: 680,
        range: 3.0,
        dmg: 20,
        rate: 0.6,
        radius: 2.1,
        type: 'wall',
        thorns: 0.45,
        blocksPath: true,
        color: '#ff6a00',
        desc: 'Bloquea el paso de los enemigos y devuelve daño al contacto.',
      },
      {
        id: 'balista',
        name: 'Balista Perforante',
        short: 'Balista',
        cost: 55,
        hp: 260,
        range: 16.5,
        dmg: 78,
        rate: 1.25,
        radius: 1.4,
        type: 'pierce',
        color: '#ffb800',
        desc: 'Dispara lanzas de energía que atraviesan enemigos.',
      },
    ],
  },
  {
    id: 'cazadora',
    name: 'Cazadora de Neón',
    full: 'Cazadora de Neón',
    role: 'Velocidad Láser y Trampas',
    color: '#ff007f',
    trim: '#00f5ff',
    accent: '#ff4da6',
    aesthetic: 'Ágil, visor cibernético, deja una estela de luz al esquivar.',
    stats: { hp: 250, maxMana: 100, speed: 10.4, attack: 5, defense: 2, magic: 3 },
    basicAttack: {
      name: 'Flechas Láser',
      desc: 'Ráfagas rápidas de flechas láser',
      range: 16.5,
      dmg: 22,
      cooldown: 0.24,
      speed: 30,
    },
    power: 'neon_barrage',
    powerName: 'Bombardeo Orbital Neón',
    powerDesc: 'Lluvia de flechas láser explosivas y sobrecarga de velocidad de movimiento.',
    defenses: [
      {
        id: 'explosiva',
        name: 'Trampa Explosiva',
        short: 'Explosiva',
        cost: 30,
        hp: 160,
        range: 3.6,
        aoe: 5.5,
        dmg: 95,
        rate: 2.0,
        radius: 1.1,
        type: 'trap_boom',
        isTrap: true,
        color: '#ff007f',
        desc: 'Trampa de piso que detona e incendia a los enemigos.',
      },
      {
        id: 'gravedad',
        name: 'Trampa de Gravedad',
        short: 'Gravedad',
        cost: 45,
        hp: 180,
        range: 4.5,
        dmg: 22,
        rate: 2.6,
        radius: 1.2,
        type: 'trap_grav',
        isTrap: true,
        stun: 1.8,
        color: '#d900ff',
        desc: 'Levanta a los enemigos en el aire y los inmoviliza.',
      },
    ],
  },
  {
    id: 'chaman',
    name: 'Chamán de Éter',
    full: 'Chamán de Éter',
    role: 'Relámpagos en Cadena y Auras',
    color: '#39ff14',
    trim: '#00f5ff',
    accent: '#aaff00',
    aesthetic: 'Cyborg tribal, tótems flotantes a su alrededor.',
    stats: { hp: 290, maxMana: 130, speed: 8.2, attack: 3, defense: 3, magic: 5 },
    basicAttack: {
      name: 'Cadena de Relámpagos',
      desc: 'Ráfagas de cadena de relámpagos (rebota entre enemigos)',
      range: 13.5,
      dmg: 32,
      cooldown: 0.52,
      chain: 3,
      chainRange: 6.5,
    },
    power: 'ancestral_pulse',
    powerName: 'Tormenta de Tótems',
    powerDesc: 'Electrocuta en cadena a toda la horda y restaura energía al Cristal de Éter.',
    defenses: [
      {
        id: 'aura_elec',
        name: 'Aura Eléctrica',
        short: 'Aura Eléctrica',
        cost: 45,
        hp: 200,
        range: 6.5,
        dmg: 24,
        rate: 0.4,
        radius: 1.2,
        type: 'aura_dmg',
        isAura: true,
        color: '#39ff14',
        desc: 'Campo magnético que inflige daño eléctrico constante en área.',
      },
      {
        id: 'aura_pot',
        name: 'Aura Potenciadora',
        short: 'Aura Potenciadora',
        cost: 50,
        hp: 220,
        range: 7.5,
        dmg: 0,
        rate: 1.0,
        radius: 1.2,
        buff: 1.45,
        type: 'aura_buff',
        isAura: true,
        color: '#aaff00',
        desc: 'Mejora el daño y la cadencia de torretas aliadas cercanas.',
      },
    ],
  },
];

export const ALL_DEFENSES = CHARACTERS.flatMap((c) =>
  c.defenses.map((d) => ({ ...d, classId: c.id, className: c.name }))
);

export const ENEMY_TYPES = {
  swarm: {
    id: 'swarm',
    name: 'Enjambre Mecánico',
    hp: 65,
    speed: 5.8,
    dmg: 10,
    radius: 0.75,
    reward: 8,
    color: '#39ff14',
  },
  golem: {
    id: 'golem',
    name: 'Gólem Corrupto',
    hp: 210,
    speed: 3.1,
    dmg: 26,
    radius: 1.35,
    reward: 18,
    color: '#ff007f',
  },
  colossus: {
    id: 'colossus',
    name: 'Coloso de Obsidiana',
    hp: 620,
    speed: 2.1,
    dmg: 55,
    radius: 2.0,
    reward: 45,
    color: '#b400ff',
  },
};

export const DIFFICULTIES = [
  { id: 0, name: 'Iniciado', hpMult: 0.8, spdMult: 0.9, startMana: 150 },
  { id: 1, name: 'Arcano', hpMult: 1.0, spdMult: 1.0, startMana: 120 },
  { id: 2, name: 'Pesadilla', hpMult: 1.35, spdMult: 1.12, startMana: 100 },
];

export const MODES = [
  { id: 'campana', name: 'Defensa del Éter (5 Oleadas)', waves: 5, desc: 'Sobrevive a 5 oleadas crecientes y derrota al Coloso Corrupto' },
  { id: 'infinito', name: 'Asedio Infinito', waves: 99, desc: 'Hordas sin fin con dificultad escalable en cada ronda' },
];

export function charById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

export function defenseById(id) {
  return ALL_DEFENSES.find((d) => d.id === id) || ALL_DEFENSES[0];
}
