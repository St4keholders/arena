'use client';
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Cylinder, Edges } from '@react-three/drei';
import * as THREE from 'three';
import {
  PORTALS,
  SLOT_COLORS,
  SLOT_NAMES,
  CHARACTERS,
  charById,
  defenseById,
} from '../game/constants';
import { STATIC_OBSTACLES } from '../game/sim';

export default function GameCanvas3D({ host, simRef, isLobby = false, lobbyPlayers = [] }) {
  return (
    <div className="canvas3d-wrap">
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, 36, 36], fov: 42, near: 0.5, far: 180 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#05030a']} />
        <fog attach="fog" args={['#05030a', 52, 115]} />
        <ArenaScene host={host} simRef={simRef} isLobby={isLobby} lobbyPlayers={lobbyPlayers} />
      </Canvas>
    </div>
  );
}

function ArenaScene({ host, simRef, isLobby, lobbyPlayers }) {
  const crystalLightRef = useRef();
  const crystalMeshRef = useRef();
  const crystalRing1Ref = useRef();
  const crystalRing2Ref = useRef();
  const dynamicGroupRef = useRef();

  // Obtener simulación activa (Host o Espejo móvil)
  const getSim = () => {
    if (simRef && simRef.current) return simRef.current;
    if (host) return host.activeSim();
    return null;
  };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const sim = getSim();
    if (sim && typeof sim.advance === 'function') {
      sim.advance(dt);
    }

    // Pulso de luz azul/magenta en el Cristal de Éter
    if (crystalLightRef.current) {
      const mix = (Math.sin(t * 2.6) + 1) * 0.5;
      const c1 = new THREE.Color('#00f5ff');
      const c2 = new THREE.Color('#ff007f');
      crystalLightRef.current.color.lerpColors(c1, c2, mix);
      crystalLightRef.current.intensity = 4.2 + Math.sin(t * 4.5) * 1.3;
    }

    if (crystalMeshRef.current) {
      crystalMeshRef.current.rotation.y = t * 0.7;
      crystalMeshRef.current.position.y = 3.8 + Math.sin(t * 2.2) * 0.45;
    }
    if (crystalRing1Ref.current) {
      crystalRing1Ref.current.rotation.x = t * 0.9;
      crystalRing1Ref.current.rotation.y = t * 0.5;
    }
    if (crystalRing2Ref.current) {
      crystalRing2Ref.current.rotation.z = -t * 0.8;
      crystalRing2Ref.current.rotation.x = Math.PI / 3 + Math.sin(t) * 0.2;
    }

    // Cámara isométrica suave con ligero movimiento según intensidad de la horda
    const hordeCount = sim && sim.enemies ? sim.enemies.length : 0;
    const intensity = Math.min(1.5, hordeCount / 16);
    const hurtShake = sim && sim.crystal && sim.crystal.hurtT > 0 ? 0.55 : 0;
    const shake = intensity * 0.35 + hurtShake;

    const targetPos = isLobby
      ? new THREE.Vector3(Math.sin(t * 0.25) * 6, 25, 29 + Math.cos(t * 0.25) * 3)
      : new THREE.Vector3(
          Math.sin(t * 1.7) * (0.6 + shake) + Math.cos(t * 9.0) * hurtShake,
          38 - intensity * 1.5,
          38 + Math.cos(t * 1.3) * (0.6 + shake)
        );

    state.camera.position.lerp(targetPos, Math.min(1, dt * 3.5));
    state.camera.lookAt(0, isLobby ? 1.5 : 0, 0);
  });

  return (
    <group>
      {/* Iluminación Cyber-Arcana: HemisphereLight oscuro + PointLight pulsante central */}
      <hemisphereLight args={['#1c1136', '#040208', 0.9]} />
      <directionalLight position={[25, 42, 20]} intensity={1.15} color="#b8d8ff" />
      <pointLight
        ref={crystalLightRef}
        position={[0, 4.5, 0]}
        intensity={4.5}
        distance={38}
        decay={1.6}
        color="#00f5ff"
      />

      {/* Terreno: Ruinas de Obsidiana flotando en el vacío con circuitos mágicos */}
      <ObsidianRuinsMap />

      {/* Núcleo del Mapa: El Cristal de Éter */}
      <group position={[0, 0, 0]}>
        <Cylinder args={[2.6, 3.2, 0.7, 8]} position={[0, 0.35, 0]}>
          <meshToonMaterial color="#140d26" />
          <Edges color="#00f5ff" />
        </Cylinder>
        <mesh ref={crystalMeshRef} position={[0, 3.8, 0]}>
          <octahedronGeometry args={[2.1, 0]} />
          <meshToonMaterial color="#00f5ff" emissive="#00a2ff" emissiveIntensity={0.65} />
          <Edges color="#ffffff" />
        </mesh>
        <group position={[0, 3.8, 0]}>
          <mesh ref={crystalRing1Ref}>
            <torusGeometry args={[2.9, 0.07, 8, 24]} />
            <meshBasicMaterial color="#ff007f" />
          </mesh>
          <mesh ref={crystalRing2Ref}>
            <torusGeometry args={[3.4, 0.06, 8, 24]} />
            <meshBasicMaterial color="#00f5ff" />
          </mesh>
        </group>
      </group>

      {/* Pedestal de personajes seleccionados en el Lobby */}
      {isLobby && <LobbyShowcase lobbyPlayers={lobbyPlayers} />}

      {/* Entidades dinámicas de la partida (Héroes, Torretas, Hordas, Proyectiles y Efectos) */}
      <DynamicEntities getSim={getSim} isLobby={isLobby} ref={dynamicGroupRef} />
    </group>
  );
}

function ObsidianRuinsMap() {
  const circuitAngles = useMemo(() => [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], []);
  const diagAngles = useMemo(
    () => [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4],
    []
  );

  return (
    <group>
      {/* Plataforma principal de obsidiana */}
      <Cylinder args={[38, 35, 2.4, 16]} position={[0, -1.2, 0]}>
        <meshToonMaterial color="#0c0817" />
        <Edges color="#00f5ff" />
      </Cylinder>

      {/* Segundo anillo arcano interior */}
      <Cylinder args={[24, 24.5, 0.18, 16]} position={[0, 0.02, 0]}>
        <meshToonMaterial color="#130d24" />
        <Edges color="#ff007f" />
      </Cylinder>

      {/* Anillo de santuario central */}
      <Cylinder args={[9.5, 9.8, 0.22, 12]} position={[0, 0.06, 0]}>
        <meshToonMaterial color="#191130" />
        <Edges color="#39ff14" />
      </Cylinder>

      {/* Circuitos mágicos brillantes en el suelo hacia los 4 portales */}
      {circuitAngles.map((ang, idx) => (
        <group key={idx} rotation={[0, ang, 0]}>
          <Box args={[0.45, 0.08, 28]} position={[0, 0.1, -18]}>
            <meshBasicMaterial color={idx % 2 === 0 ? '#00f5ff' : '#ff007f'} />
          </Box>
          <Box args={[1.8, 0.06, 28]} position={[0, 0.05, -18]}>
            <meshToonMaterial color="#1a1230" />
            <Edges color={idx % 2 === 0 ? '#00f5ff' : '#ff007f'} />
          </Box>
        </group>
      ))}

      {/* Circuitos diagonales secundarios */}
      {diagAngles.map((ang, idx) => (
        <group key={idx} rotation={[0, ang, 0]}>
          <Box args={[0.25, 0.07, 22]} position={[0, 0.08, -15]}>
            <meshBasicMaterial color="#39ff14" />
          </Box>
        </group>
      ))}

      {/* Pilares de Obsidiana en las ruinas (Obstáculos estáticos) */}
      {STATIC_OBSTACLES.map((obs) => (
        <group key={obs.id} position={[obs.x, 0, obs.z]}>
          <Cylinder args={[obs.r, obs.r * 1.15, 0.8, 6]} position={[0, 0.4, 0]}>
            <meshToonMaterial color="#161029" />
            <Edges color="#00f5ff" />
          </Cylinder>
          <Box args={[obs.r * 1.1, 4.2, obs.r * 1.1]} position={[0, 2.5, 0]}>
            <meshToonMaterial color="#0e091c" />
            <Edges color="#ff007f" />
          </Box>
          <Box args={[obs.r * 0.5, 0.9, obs.r * 0.5]} position={[0, 5.1, 0]}>
            <meshBasicMaterial color="#00f5ff" />
          </Box>
        </group>
      ))}

      {/* Los 4 Portales de Horda en los extremos del mapa */}
      {PORTALS.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
          <Cylinder args={[2.8, 3.1, 0.5, 8]} position={[0, 0.25, 0]}>
            <meshToonMaterial color="#1c0d2b" />
            <Edges color={p.color} />
          </Cylinder>
          <Box args={[0.7, 4.8, 0.7]} position={[-2.2, 2.4, 0]}>
            <meshToonMaterial color="#120920" />
            <Edges color={p.color} />
          </Box>
          <Box args={[0.7, 4.8, 0.7]} position={[2.2, 2.4, 0]}>
            <meshToonMaterial color="#120920" />
            <Edges color={p.color} />
          </Box>
          <Box args={[5.2, 0.8, 0.8]} position={[0, 4.9, 0]}>
            <meshToonMaterial color="#120920" />
            <Edges color="#00f5ff" />
          </Box>
          <mesh position={[0, 2.5, 0]}>
            <torusGeometry args={[1.65, 0.12, 8, 20]} />
            <meshBasicMaterial color={p.color} />
          </mesh>
        </group>
      ))}

      {/* Fragmentos de ruinas flotando en el vacío exterior */}
      {[
        [-45, -3, -22],
        [46, -2, -18],
        [-42, -4, 25],
        [44, -2.5, 24],
        [0, -5, -48],
        [0, -4, 48],
      ].map(([fx, fy, fz], i) => (
        <Box key={i} args={[3.5, 1.4, 3.5]} position={[fx, fy, fz]} rotation={[0.2 * i, 0.5 * i, 0.1]}>
          <meshToonMaterial color="#110b22" />
          <Edges color={i % 2 === 0 ? '#00f5ff' : '#39ff14'} />
        </Box>
      ))}
    </group>
  );
}

function LobbyShowcase({ lobbyPlayers }) {
  // Muestra los 4 pedestales frente al Cristal de Éter con la visualización 3D de la clase elegida
  const spots = [
    [-6.5, 0, 8.5],
    [-2.2, 0, 10.2],
    [2.2, 0, 10.2],
    [6.5, 0, 8.5],
  ];
  return (
    <group>
      {spots.map((pos, slot) => {
        const p = lobbyPlayers && lobbyPlayers[slot];
        const charId = p ? p.char : CHARACTERS[slot % CHARACTERS.length].id;
        const active = !!p;
        return (
          <group key={slot} position={pos}>
            <Cylinder args={[1.55, 1.8, 0.45, 8]} position={[0, 0.22, 0]}>
              <meshToonMaterial color={active ? '#1d1436' : '#0d0918'} />
              <Edges color={active ? SLOT_COLORS[slot] : '#3a2e54'} />
            </Cylinder>
            {active && (
              <HeroMesh
                charId={charId}
                slot={slot}
                moving={false}
                attackT={0}
                castT={0.2}
                hp={100}
                maxHp={100}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function DynamicEntities({ getSim, isLobby }) {
  const tickRef = useRef(0);
  const stateRef = useRef({ heroes: [], turrets: [], enemies: [], projs: [], effects: [], subPhase: 'forge' });
  const containerRef = useRef();

  // Sincronizamos referencias cada frame sin re-montar el Canvas
  useFrame(() => {
    const sim = getSim();
    if (!sim) return;
    stateRef.current.heroes = sim.heroes || [];
    stateRef.current.turrets = sim.turrets || [];
    stateRef.current.enemies = sim.enemies || [];
    stateRef.current.projs = sim.projs || [];
    stateRef.current.effects = sim.effects || [];
    stateRef.current.subPhase = sim.subPhase || 'forge';
    tickRef.current++;
  });

  const sim = getSim();
  if (!sim) return null;

  return (
    <group ref={containerRef}>
      {/* Héroes y sus hologramas de construcción */}
      {!isLobby &&
        (sim.heroes || []).map((h) => (
          <HeroEntity key={h.id} hero={h} subPhase={sim.subPhase} />
        ))}

      {/* Defensas / Torretas construidas */}
      {(sim.turrets || []).map((tu) => (
        <TurretEntity key={tu.id} turret={tu} />
      ))}

      {/* Horda de Enemigos */}
      {(sim.enemies || []).map((e) => (
        <EnemyEntity key={e.id} enemy={e} />
      ))}

      {/* Proyectiles y Rayos */}
      {(sim.projs || []).map((p) => (
        <ProjectileEntity key={p.id} proj={p} />
      ))}

      {/* Efectos de Área / Explosiones / Novas */}
      {(sim.effects || []).map((ef) => (
        <EffectEntity key={ef.id} effect={ef} />
      ))}
    </group>
  );
}

function HeroEntity({ hero, subPhase }) {
  const groupRef = useRef();
  const holoRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.set(hero.x, 0, hero.z);
      groupRef.current.rotation.y = hero.rotY || 0;
    }
    if (holoRef.current) {
      holoRef.current.position.set(hero.holoX || hero.x, 0.05, hero.holoZ || hero.z);
      holoRef.current.rotation.y = state.clock.elapsedTime * 1.5;
    }
  });

  if (hero.dead) return null;
  const def = defenseById(hero.buildType || hero.ch?.defenses?.[0]?.id);
  const showHolo = subPhase === 'forge' || hero.buildMode;
  const holoColor = hero.holoValid ? '#00f5ff' : '#ff1e42';

  return (
    <>
      <group ref={groupRef} position={[hero.x, 0, hero.z]} rotation={[0, hero.rotY || 0, 0]}>
        <HeroMesh
          charId={hero.char}
          slot={hero.slot}
          moving={hero.moving}
          attackT={hero.attackT}
          castT={hero.castT}
          buffedT={hero.buffedT}
          shieldT={hero.shieldT}
          hp={hero.hp}
          maxHp={hero.maxHp}
        />
      </group>

      {/* Holograma azul/rojo durante la Fase de Forja según si el espacio es válido */}
      {showHolo && def && (
        <group ref={holoRef} position={[hero.holoX || hero.x, 0.05, hero.holoZ || hero.z]}>
          <Cylinder args={[def.radius || 1.3, def.radius || 1.3, 1.6, 8]} position={[0, 0.8, 0]}>
            <meshBasicMaterial color={holoColor} transparent opacity={0.28} wireframe={false} />
            <Edges color={holoColor} />
          </Cylinder>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[(def.range || 4) - 0.12, def.range || 4, 32]} />
            <meshBasicMaterial color={holoColor} transparent opacity={0.45} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </>
  );
}

function HeroMesh({ charId, slot = 0, moving, attackT, buffedT, shieldT }) {
  const bodyRef = useRef();
  const ch = charById(charId);
  const slotColor = SLOT_COLORS[slot] || ch.color;

  useFrame((state) => {
    if (!bodyRef.current) return;
    const t = state.clock.elapsedTime;
    if (charId === 'tecnomago') {
      // Levita en vez de caminar
      bodyRef.current.position.y = 0.55 + Math.sin(t * 3.8 + slot) * 0.22;
    } else {
      bodyRef.current.position.y = moving ? Math.abs(Math.sin(t * 10)) * 0.22 : 0;
    }
    if (attackT > 0) {
      bodyRef.current.rotation.x = 0.25;
    } else {
      bodyRef.current.rotation.x = 0;
    }
  });

  return (
    <group>
      {/* Anillo indicador de jugador (J1-J4) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.95, 1.2, 20]} />
        <meshBasicMaterial color={slotColor} side={THREE.DoubleSide} />
      </mesh>

      {buffedT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[1.3, 1.5, 20]} />
          <meshBasicMaterial color="#aaff00" side={THREE.DoubleSide} />
        </mesh>
      )}

      {shieldT > 0 && (
        <Cylinder args={[1.35, 1.35, 2.4, 12]} position={[0, 1.2, 0]}>
          <meshBasicMaterial color="#ffae00" transparent opacity={0.22} />
          <Edges color="#ffae00" />
        </Cylinder>
      )}

      <group ref={bodyRef}>
        {charId === 'tecnomago' && (
          <group>
            {/* Túnica flotante con cables luminosos */}
            <Cylinder args={[0.35, 0.85, 1.7, 8]} position={[0, 0.9, 0]}>
              <meshToonMaterial color="#111a3a" />
              <Edges color="#00f5ff" />
            </Cylinder>
            <Box args={[0.6, 0.6, 0.6]} position={[0, 1.95, 0]}>
              <meshToonMaterial color="#1b264f" />
              <Edges color="#7df9ff" />
            </Box>
            {/* Orbe de plasma flotante */}
            <Box args={[0.38, 0.38, 0.38]} position={[0.75, 1.6, 0.5]} rotation={[0.4, 0.4, 0]}>
              <meshBasicMaterial color="#00f5ff" />
            </Box>
          </group>
        )}

        {charId === 'paladin' && (
          <group>
            {/* Armadura masiva oscura con grietas de luz naranja */}
            <Box args={[1.15, 1.45, 0.85]} position={[0, 1.0, 0]}>
              <meshToonMaterial color="#1c1624" />
              <Edges color="#ff6a00" />
            </Box>
            <Box args={[0.65, 0.65, 0.65]} position={[0, 2.0, 0]}>
              <meshToonMaterial color="#261e30" />
              <Edges color="#ffb800" />
            </Box>
            {/* Martillo de energía */}
            <group position={[0.85, 1.2, 0.55]}>
              <Cylinder args={[0.08, 0.08, 1.6, 6]} position={[0, 0, 0]}>
                <meshToonMaterial color="#3b2d4a" />
              </Cylinder>
              <Box args={[0.55, 0.55, 0.95]} position={[0, 0.8, 0]}>
                <meshToonMaterial color="#ff6a00" />
                <Edges color="#ffffff" />
              </Box>
            </group>
          </group>
        )}

        {charId === 'cazadora' && (
          <group>
            {/* Silueta ágil con visor cibernético */}
            <Cylinder args={[0.32, 0.52, 1.55, 6]} position={[0, 0.85, 0]}>
              <meshToonMaterial color="#2b0c28" />
              <Edges color="#ff007f" />
            </Cylinder>
            <Box args={[0.52, 0.52, 0.55]} position={[0, 1.85, 0]}>
              <meshToonMaterial color="#1f0a24" />
              <Edges color="#ff007f" />
            </Box>
            {/* Visor cibernético neón */}
            <Box args={[0.56, 0.18, 0.3]} position={[0, 1.88, 0.22]}>
              <meshBasicMaterial color="#00f5ff" />
            </Box>
            {/* Arco láser */}
            <Box args={[0.14, 1.2, 0.35]} position={[0.6, 1.2, 0.55]}>
              <meshToonMaterial color="#ff007f" />
              <Edges color="#00f5ff" />
            </Box>
          </group>
        )}

        {charId === 'chaman' && (
          <group>
            {/* Cyborg tribal con tótems flotantes */}
            <Cylinder args={[0.45, 0.68, 1.6, 7]} position={[0, 0.85, 0]}>
              <meshToonMaterial color="#0d2618" />
              <Edges color="#39ff14" />
            </Cylinder>
            {/* Máscara tribal */}
            <Box args={[0.68, 0.78, 0.5]} position={[0, 1.95, 0.08]}>
              <meshToonMaterial color="#153823" />
              <Edges color="#39ff14" />
            </Box>
            {/* Tótems flotantes alrededor */}
            <Box args={[0.28, 0.65, 0.28]} position={[-0.95, 1.5, 0]}>
              <meshToonMaterial color="#1c472c" />
              <Edges color="#39ff14" />
            </Box>
            <Box args={[0.28, 0.65, 0.28]} position={[0.95, 1.5, 0]}>
              <meshToonMaterial color="#1c472c" />
              <Edges color="#00f5ff" />
            </Box>
          </group>
        )}
      </group>
    </group>
  );
}

function TurretEntity({ turret }) {
  const groupRef = useRef();
  const def = turret.def || defenseById(turret.type);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(turret.x, 0, turret.z);
    groupRef.current.rotation.y = turret.rotY || 0;
    if (def.isAura) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 1.2;
    }
  });

  return (
    <group ref={groupRef} position={[turret.x, 0, turret.z]}>
      {/* Base común */}
      <Cylinder args={[def.radius * 0.85, def.radius, 0.35, 8]} position={[0, 0.18, 0]}>
        <meshToonMaterial color="#161029" />
        <Edges color={def.color} />
      </Cylinder>

      {/* Si tiene buff de Aura Potenciadora */}
      {turret.buffedT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
          <ringGeometry args={[def.radius + 0.2, def.radius + 0.42, 20]} />
          <meshBasicMaterial color="#aaff00" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Geometría específica según tipo de defensa */}
      {(turret.type === 'prisma' || turret.type === 'crio') && (
        <group>
          <Cylinder args={[0.35, 0.55, 1.5, 6]} position={[0, 1.0, 0]}>
            <meshToonMaterial color="#1a1836" />
            <Edges color={def.color} />
          </Cylinder>
          <Box args={[0.65, 0.65, 0.65]} position={[0, 2.05, 0]} rotation={[0.5, 0.5, 0]}>
            <meshToonMaterial color={def.color} />
            <Edges color="#ffffff" />
          </Box>
        </group>
      )}

      {turret.type === 'barricada' && (
        <group>
          <Box args={[3.4, 2.1, 0.9]} position={[0, 1.15, 0]}>
            <meshToonMaterial color="#241a2e" />
            <Edges color="#ff6a00" />
          </Box>
          <Box args={[2.8, 1.5, 1.0]} position={[0, 1.15, 0]}>
            <meshToonMaterial color="#382218" />
            <Edges color="#ffb800" />
          </Box>
        </group>
      )}

      {turret.type === 'balista' && (
        <group>
          <Cylinder args={[0.45, 0.65, 1.1, 6]} position={[0, 0.7, 0]}>
            <meshToonMaterial color="#261c2e" />
            <Edges color="#ffb800" />
          </Cylinder>
          <Box args={[0.5, 0.4, 2.1]} position={[0, 1.4, 0.3]}>
            <meshToonMaterial color="#ff6a00" />
            <Edges color="#ffffff" />
          </Box>
          <Box args={[2.0, 0.22, 0.35]} position={[0, 1.45, 0.8]}>
            <meshToonMaterial color="#ffb800" />
            <Edges color="#ff6a00" />
          </Box>
        </group>
      )}

      {(turret.type === 'explosiva' || turret.type === 'gravedad') && (
        <group>
          <Cylinder args={[0.9, 1.0, 0.18, 6]} position={[0, 0.3, 0]}>
            <meshToonMaterial color="#290d26" />
            <Edges color={def.color} />
          </Cylinder>
          <Box args={[0.5, 0.25, 0.5]} position={[0, 0.42, 0]}>
            <meshBasicMaterial color={def.color} />
          </Box>
        </group>
      )}

      {(turret.type === 'aura_elec' || turret.type === 'aura_pot') && (
        <group>
          <Box args={[0.55, 1.8, 0.55]} position={[0, 1.1, 0]}>
            <meshToonMaterial color="#102b1e" />
            <Edges color={def.color} />
          </Box>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <ringGeometry args={[def.range - 0.18, def.range, 36]} />
            <meshBasicMaterial color={def.color} transparent opacity={0.55} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function EnemyEntity({ enemy }) {
  const groupRef = useRef();
  const isGolem = enemy.type === 'golem';
  const isColossus = enemy.type === 'colossus';
  const scale = isColossus ? 1.65 : isGolem ? 1.15 : 0.72;
  const baseColor = enemy.frozenT > 0
    ? '#00f5ff'
    : enemy.burningT > 0
    ? '#ff5500'
    : isColossus
    ? '#2b0d42'
    : isGolem
    ? '#261029'
    : '#112919';
  const edgeColor = enemy.frozenT > 0
    ? '#ffffff'
    : isColossus
    ? '#b400ff'
    : isGolem
    ? '#ff007f'
    : '#39ff14';

  useFrame((state) => {
    if (!groupRef.current) return;
    const bob = enemy.moving ? Math.abs(Math.sin(state.clock.elapsedTime * 8 + enemy.x)) * 0.22 : 0;
    groupRef.current.position.set(enemy.x, (enemy.y || 0) + bob, enemy.z);
    groupRef.current.rotation.y = enemy.rotY || 0;
  });

  return (
    <group ref={groupRef} position={[enemy.x, enemy.y || 0, enemy.z]} scale={[scale, scale, scale]}>
      {/* Cuerpo principal con MeshToonMaterial y Edges */}
      <Box args={[1.3, 1.5, 1.1]} position={[0, 0.95, 0]}>
        <meshToonMaterial color={baseColor} />
        <Edges color={edgeColor} />
      </Box>
      {/* Núcleo corrupto brillante */}
      <Box args={[0.55, 0.55, 0.55]} position={[0, 1.1, 0.4]}>
        <meshBasicMaterial color={edgeColor} />
      </Box>

      {/* Estados elementales (F.FROZEN, F.BURNING, F.STUNNED) */}
      {enemy.frozenT > 0 && (
        <Box args={[1.6, 1.9, 1.4]} position={[0, 0.95, 0]}>
          <meshBasicMaterial color="#7df9ff" transparent opacity={0.32} />
          <Edges color="#ffffff" />
        </Box>
      )}
      {enemy.burningT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <ringGeometry args={[0.8, 1.15, 16]} />
          <meshBasicMaterial color="#ff4500" side={THREE.DoubleSide} />
        </mesh>
      )}
      {enemy.stunnedT > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.2, 0]}>
          <torusGeometry args={[0.65, 0.08, 6, 16]} />
          <meshBasicMaterial color="#ffd23f" />
        </mesh>
      )}
    </group>
  );
}

function ProjectileEntity({ proj }) {
  if (proj.type === 'beam' || proj.type === 'chain_bolt') {
    const dx = (proj.tx || 0) - proj.x;
    const dz = (proj.tz || 0) - proj.z;
    const len = Math.hypot(dx, dz) || 0.1;
    const midX = proj.x + dx * 0.5;
    const midZ = proj.z + dz * 0.5;
    const ang = Math.atan2(dx, dz);
    return (
      <group position={[midX, proj.y || 1.6, midZ]} rotation={[0, ang, 0]}>
        <Box args={[0.22, 0.22, len]}>
          <meshBasicMaterial color={proj.color || '#00f5ff'} />
        </Box>
      </group>
    );
  }

  return (
    <group position={[proj.x, proj.y || 1.4, proj.z]}>
      <Box args={[0.42, 0.42, 0.75]}>
        <meshBasicMaterial color={proj.color || '#00f5ff'} />
        <Edges color="#ffffff" />
      </Box>
    </group>
  );
}

function EffectEntity({ effect }) {
  const p = Math.min(1, (effect.t || 0) / Math.max(0.1, effect.max || 0.4));
  const radius = (effect.r || 2.5) * (0.3 + p * 0.7);
  const opacity = Math.max(0.05, 1 - p);

  return (
    <group position={[effect.x, 0.15, effect.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.65, radius, 28]} />
        <meshBasicMaterial
          color={effect.color || '#00f5ff'}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
