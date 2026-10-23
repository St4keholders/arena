'use client';
import React, { Suspense, useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Box, Cylinder, Edges } from '@react-three/drei';
import * as THREE from 'three';
import {
  PORTALS,
  SLOT_COLORS,
  CHARACTERS,
  charById,
  defenseById,
} from '../game/constants';
import { STATIC_OBSTACLES } from '../game/sim';

/**
 * Registro centralizado del Pipeline de Assets (.glb / .gltf)
 * Permite reemplazar cualquier archivo en /public/models/ por exportaciones de Blender o Rhino.
 */
export const MODEL_REGISTRY = {
  heroes: {
    tecnomago: '/models/hero_tecnomago.glb',
    paladin: '/models/hero_paladin.glb',
    cazadora: '/models/hero_cazadora.glb',
    chaman: '/models/hero_chaman.glb',
  },
  turrets: {
    prisma: '/models/turret_prisma.glb',
    crio: '/models/turret_crio.glb',
    barricada: '/models/turret_barricada.glb',
    balista: '/models/turret_balista.glb',
    explosiva: '/models/turret_explosiva.glb',
    gravedad: '/models/turret_gravedad.glb',
    aura_elec: '/models/turret_aura_elec.glb',
    aura_pot: '/models/turret_aura_pot.glb',
  },
  enemies: {
    swarm: '/models/enemy_swarm.glb',
    golem: '/models/enemy_golem.glb',
    colossus: '/models/enemy_colossus.glb',
  },
  environment: {
    crystal: '/models/crystal_ether.glb',
    terrain: '/models/terrain_obsidian.glb',
  },
};

// Precarga asíncrona de los modelos .glb en caché de Drei
if (typeof window !== 'undefined') {
  Object.values(MODEL_REGISTRY).forEach((group) => {
    Object.values(group).forEach((url) => {
      try {
        useGLTF.preload(url);
      } catch (e) {
        /* fallback seguro */
      }
    });
  });
}

class GLTFErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

/**
 * Cargador genérico de escena .GLB con soporte de clips de animación (idle, run, attack)
 * y articulación por nodos para modelos exportados de Blender / Rhino.
 */
function GLBSceneInstance({
  url,
  animState = 'idle',
  scale = 1,
  tintColor = null,
  emissiveColor = null,
  emissiveIntensity = 0.6,
  wireframe = false,
  opacity = 1,
}) {
  const groupRef = useRef();
  const gltf = useGLTF(url);

  const clonedScene = useMemo(() => {
    if (!gltf || !gltf.scene) return null;
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (node.isMesh && node.material) {
        node.material = node.material.clone();
        if (tintColor) {
          node.material.color = new THREE.Color(tintColor);
        }
        if (emissiveColor) {
          node.material.emissive = new THREE.Color(emissiveColor);
          node.material.emissiveIntensity = emissiveIntensity;
        }
        if (opacity < 1) {
          node.material.transparent = true;
          node.material.opacity = opacity;
        }
        node.material.wireframe = wireframe;
      }
    });
    return clone;
  }, [gltf, tintColor, emissiveColor, emissiveIntensity, wireframe, opacity]);

  const { actions } = useAnimations(gltf?.animations || [], groupRef);

  // Si el .glb incluye clips de animación embebidos (idle, run, attack), reproducirlos con crossFade
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    const clipName =
      actions[animState]
        ? animState
        : actions[animState.toUpperCase()]
        ? animState.toUpperCase()
        : Object.keys(actions)[0];
    const act = actions[clipName];
    if (act) {
      act.reset().fadeIn(0.15).play();
      return () => {
        act.fadeOut(0.15);
      };
    }
  }, [actions, animState]);

  // Articulación cinemática sobre nodos del modelo .glb (Weapon, Head, Torso, Core)
  useFrame((state) => {
    if (!clonedScene) return;
    const t = state.clock.elapsedTime;
    const weapon = clonedScene.getObjectByName('Weapon');
    const head = clonedScene.getObjectByName('Head');
    const core = clonedScene.getObjectByName('Core');

    if (weapon) {
      if (animState === 'attack') {
        weapon.rotation.x = Math.sin(t * 28) * 0.85;
        weapon.rotation.z = Math.cos(t * 22) * 0.45;
      } else if (animState === 'run') {
        weapon.rotation.x = Math.sin(t * 11) * 0.32;
        weapon.rotation.z = 0;
      } else {
        weapon.rotation.x = Math.sin(t * 2.5) * 0.08;
        weapon.rotation.z = 0;
      }
    }
    if (head) {
      head.rotation.y = Math.sin(t * 2.0) * 0.12;
    }
    if (core) {
      core.rotation.y = t * 1.8;
      core.rotation.x = t * 1.1;
    }
  });

  if (!clonedScene) return null;
  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      <primitive object={clonedScene} />
    </group>
  );
}

/**
 * Modelo 3D de Personaje (Héroe) gestionado por AssetManager
 */
export function HeroModelAsset({
  charId,
  slot = 0,
  animState = 'idle',
  moving = false,
  attackT = 0,
  castT = 0,
  buffedT = 0,
  shieldT = 0,
}) {
  const bodyRef = useRef();
  const auraRef = useRef();
  const ch = charById(charId);
  const slotColor = SLOT_COLORS[slot] || ch.color;
  const glbUrl = MODEL_REGISTRY.heroes[charId] || MODEL_REGISTRY.heroes.tecnomago;

  const resolvedAnim =
    attackT > 0
      ? 'attack'
      : castT > 0
      ? 'cast'
      : animState || (moving ? 'run' : 'idle');

  useFrame((state) => {
    if (!bodyRef.current) return;
    const t = state.clock.elapsedTime;
    if (charId === 'tecnomago') {
      bodyRef.current.position.y = 0.35 + Math.sin(t * 3.8 + slot) * 0.18;
    } else if (resolvedAnim === 'run') {
      bodyRef.current.position.y = Math.abs(Math.sin(t * 11)) * 0.22;
    } else {
      bodyRef.current.position.y = Math.sin(t * 2.6 + slot) * 0.05;
    }

    if (resolvedAnim === 'attack') {
      bodyRef.current.rotation.x = 0.26;
    } else if (resolvedAnim === 'run') {
      bodyRef.current.rotation.x = 0.12;
    } else {
      bodyRef.current.rotation.x = 0;
    }

    if (auraRef.current) {
      auraRef.current.rotation.z = t * 1.4;
    }
  });

  return (
    <group>
      {/* Anillo de identificación de Guardián (J1-J4) con brillo Emissive para Bloom */}
      <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.98, 1.24, 24]} />
        <meshStandardMaterial
          color={slotColor}
          emissive={slotColor}
          emissiveIntensity={1.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {buffedT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[1.32, 1.54, 24]} />
          <meshStandardMaterial
            color="#aaff00"
            emissive="#aaff00"
            emissiveIntensity={2.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {shieldT > 0 && (
        <Cylinder args={[1.38, 1.38, 2.45, 14]} position={[0, 1.22, 0]}>
          <meshStandardMaterial
            color="#ffae00"
            emissive="#ffae00"
            emissiveIntensity={1.2}
            transparent
            opacity={0.25}
          />
          <Edges color="#ffae00" />
        </Cylinder>
      )}

      <group ref={bodyRef}>
        <GLTFErrorBoundary fallback={<HeroFallbackMesh charId={charId} />}>
          <Suspense fallback={<HeroFallbackMesh charId={charId} />}>
            <GLBSceneInstance
              url={glbUrl}
              animState={resolvedAnim}
              emissiveColor={ch.color}
              emissiveIntensity={resolvedAnim === 'attack' || resolvedAnim === 'cast' ? 1.5 : 0.75}
            />
          </Suspense>
        </GLTFErrorBoundary>

        {/* Detalles de clase luminosos de alta fidelidad (Orbes, Visores, Tótems) */}
        <HeroArcaneAttachments charId={charId} animState={resolvedAnim} />
      </group>
    </group>
  );
}

function HeroArcaneAttachments({ charId, animState }) {
  const orbRef = useRef();
  useFrame((state) => {
    if (!orbRef.current) return;
    const t = state.clock.elapsedTime;
    orbRef.current.rotation.y = t * (animState === 'attack' ? 5.0 : 1.6);
  });

  return (
    <group ref={orbRef}>
      {charId === 'tecnomago' && (
        <mesh position={[-0.75, 1.65, 0.4]}>
          <octahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.4} />
        </mesh>
      )}
      {charId === 'paladin' && (
        <mesh position={[-0.75, 1.25, 0.45]}>
          <boxGeometry args={[0.25, 1.15, 0.85]} />
          <meshStandardMaterial color="#241830" emissive="#ff6a00" emissiveIntensity={1.2} />
          <Edges color="#ffb800" />
        </mesh>
      )}
      {charId === 'cazadora' && (
        <mesh position={[0, 1.92, 0.32]}>
          <boxGeometry args={[0.58, 0.16, 0.18]} />
          <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.5} />
        </mesh>
      )}
      {charId === 'chaman' && (
        <>
          <mesh position={[-0.95, 1.55, 0]}>
            <octahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[0.95, 1.55, 0]}>
            <octahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.2} />
          </mesh>
        </>
      )}
    </group>
  );
}

function HeroFallbackMesh({ charId }) {
  const ch = charById(charId);
  return (
    <group>
      <Cylinder args={[0.38, 0.72, 1.6, 8]} position={[0, 0.9, 0]}>
        <meshStandardMaterial color="#16102b" emissive={ch.color} emissiveIntensity={0.45} />
        <Edges color={ch.color} />
      </Cylinder>
      <Box args={[0.6, 0.6, 0.6]} position={[0, 1.95, 0]}>
        <meshStandardMaterial color="#1f1638" emissive={ch.color} emissiveIntensity={0.8} />
        <Edges color="#ffffff" />
      </Box>
    </group>
  );
}

/**
 * Modelo 3D de Torreta / Defensa o su Holograma de Raycasting en Fase de Forja
 */
export function TurretModelAsset({ turret, defOverride = null, isHologram = false, holoValid = true }) {
  const def = defOverride || turret?.def || defenseById(turret?.type);
  const glbUrl = MODEL_REGISTRY.turrets[def.id] || MODEL_REGISTRY.turrets.prisma;
  const holoColor = holoValid ? '#00f5ff' : '#ff1e42';

  if (isHologram) {
    return (
      <group>
        <GLTFErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <GLBSceneInstance
              url={glbUrl}
              tintColor={holoColor}
              emissiveColor={holoColor}
              emissiveIntensity={1.8}
              opacity={0.38}
              wireframe
            />
          </Suspense>
        </GLTFErrorBoundary>
        <Cylinder args={[def.radius || 1.3, def.radius || 1.3, 1.5, 12]} position={[0, 0.75, 0]}>
          <meshStandardMaterial
            color={holoColor}
            emissive={holoColor}
            emissiveIntensity={1.4}
            transparent
            opacity={0.22}
          />
          <Edges color={holoColor} />
        </Cylinder>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[(def.range || 4) - 0.14, def.range || 4, 36]} />
          <meshStandardMaterial
            color={holoColor}
            emissive={holoColor}
            emissiveIntensity={1.5}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      {/* Anillo de buff si tiene Aura Potenciadora */}
      {turret?.buffedT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
          <ringGeometry args={[def.radius + 0.2, def.radius + 0.44, 24]} />
          <meshStandardMaterial
            color="#aaff00"
            emissive="#aaff00"
            emissiveIntensity={1.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Radio visual permanente para Auras */}
      {def.isAura && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[def.range - 0.18, def.range, 36]} />
          <meshStandardMaterial
            color={def.color}
            emissive={def.color}
            emissiveIntensity={1.5}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <GLTFErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <GLBSceneInstance
            url={glbUrl}
            animState={turret?.attackT > 0 ? 'attack' : 'idle'}
            emissiveColor={def.color}
            emissiveIntensity={turret?.attackT > 0 ? 1.8 : 0.85}
          />
        </Suspense>
      </GLTFErrorBoundary>
    </group>
  );
}

/**
 * Modelo 3D de Enemigo (Enjambre, Gólem Corrupto, Coloso de Obsidiana)
 */
export function EnemyModelAsset({ enemy }) {
  const isGolem = enemy.type === 'golem';
  const isColossus = enemy.type === 'colossus';
  const glbUrl = MODEL_REGISTRY.enemies[enemy.type] || MODEL_REGISTRY.enemies.swarm;

  const edgeColor =
    enemy.frozenT > 0
      ? '#7df9ff'
      : enemy.burningT > 0
      ? '#ff5500'
      : isColossus
      ? '#b400ff'
      : isGolem
      ? '#ff007f'
      : '#39ff14';

  const animState = enemy.attackT > 0 ? 'attack' : enemy.moving ? 'run' : 'idle';

  return (
    <group>
      <GLTFErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <GLBSceneInstance
            url={glbUrl}
            animState={animState}
            tintColor={enemy.frozenT > 0 ? '#00d8ff' : null}
            emissiveColor={edgeColor}
            emissiveIntensity={enemy.hurtT > 0 ? 2.4 : 0.95}
          />
        </Suspense>
      </GLTFErrorBoundary>

      {/* Estados elementales visuales (Congelado, Quemado, Aturdido) */}
      {enemy.frozenT > 0 && (
        <Box args={[1.6, 1.9, 1.4]} position={[0, 0.95, 0]}>
          <meshStandardMaterial
            color="#7df9ff"
            emissive="#00f5ff"
            emissiveIntensity={1.2}
            transparent
            opacity={0.32}
          />
          <Edges color="#ffffff" />
        </Box>
      )}
      {enemy.burningT > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <ringGeometry args={[0.8, 1.18, 18]} />
          <meshStandardMaterial
            color="#ff4500"
            emissive="#ff4500"
            emissiveIntensity={2.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {enemy.stunnedT > 0 && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.3, 0]}>
          <torusGeometry args={[0.68, 0.08, 8, 18]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffd23f" emissiveIntensity={2.0} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Cristal de Éter Central con Bloom Emissive y modelo .GLB
 */
export function EtherCrystalAsset({ crystalLightRef }) {
  const crystalMeshRef = useRef();
  const crystalRing1Ref = useRef();
  const crystalRing2Ref = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (crystalLightRef?.current) {
      const mix = (Math.sin(t * 2.6) + 1) * 0.5;
      const c1 = new THREE.Color('#00f5ff');
      const c2 = new THREE.Color('#ff007f');
      crystalLightRef.current.color.lerpColors(c1, c2, mix);
      crystalLightRef.current.intensity = 5.2 + Math.sin(t * 4.5) * 1.4;
    }
    if (crystalMeshRef.current) {
      crystalMeshRef.current.rotation.y = t * 0.75;
      crystalMeshRef.current.position.y = 3.9 + Math.sin(t * 2.2) * 0.45;
    }
    if (crystalRing1Ref.current) {
      crystalRing1Ref.current.rotation.x = t * 0.9;
      crystalRing1Ref.current.rotation.y = t * 0.5;
    }
    if (crystalRing2Ref.current) {
      crystalRing2Ref.current.rotation.z = -t * 0.8;
      crystalRing2Ref.current.rotation.x = Math.PI / 3 + Math.sin(t) * 0.2;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <Cylinder args={[2.7, 3.3, 0.75, 12]} position={[0, 0.37, 0]}>
        <meshStandardMaterial color="#140d26" roughness={0.35} metalness={0.6} />
        <Edges color="#00f5ff" />
      </Cylinder>

      <group ref={crystalMeshRef} position={[0, 3.9, 0]}>
        <GLTFErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <GLBSceneInstance
              url={MODEL_REGISTRY.environment.crystal}
              scale={0.75}
              emissiveColor="#00f5ff"
              emissiveIntensity={2.2}
            />
          </Suspense>
        </GLTFErrorBoundary>
        <mesh>
          <octahedronGeometry args={[2.1, 0]} />
          <meshStandardMaterial
            color="#00f5ff"
            emissive="#00c8ff"
            emissiveIntensity={1.85}
            roughness={0.15}
            metalness={0.8}
          />
          <Edges color="#ffffff" />
        </mesh>
      </group>

      <group position={[0, 3.9, 0]}>
        <mesh ref={crystalRing1Ref}>
          <torusGeometry args={[2.95, 0.08, 10, 32]} />
          <meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={2.2} />
        </mesh>
        <mesh ref={crystalRing2Ref}>
          <torusGeometry args={[3.45, 0.07, 10, 32]} />
          <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.2} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Terreno 3D y Malla de Navegación (NavMesh) con soporte de Raycasting para Fase de Forja
 */
export function ObsidianRuinsTerrainAsset({ onNavMeshMove, onNavMeshClick }) {
  const circuitAngles = useMemo(() => [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], []);
  const diagAngles = useMemo(
    () => [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4],
    []
  );

  return (
    <group>
      {/* Superficie de NavMesh interactiva para Raycasting de torretas */}
      <mesh
        name="navmesh-surface"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        onPointerMove={onNavMeshMove}
        onClick={onNavMeshClick}
      >
        <circleGeometry args={[37.5, 48]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Plataforma principal de obsidiana */}
      <Cylinder args={[38, 35, 2.4, 24]} position={[0, -1.2, 0]}>
        <meshStandardMaterial color="#0c0817" roughness={0.65} metalness={0.35} />
        <Edges color="#00f5ff" />
      </Cylinder>

      {/* Segundo anillo arcano interior */}
      <Cylinder args={[24, 24.5, 0.18, 24]} position={[0, 0.02, 0]}>
        <meshStandardMaterial color="#130d24" roughness={0.5} metalness={0.4} />
        <Edges color="#ff007f" />
      </Cylinder>

      {/* Anillo de santuario central */}
      <Cylinder args={[9.5, 9.8, 0.22, 16]} position={[0, 0.06, 0]}>
        <meshStandardMaterial color="#191130" roughness={0.45} metalness={0.5} />
        <Edges color="#39ff14" />
      </Cylinder>

      {/* Circuitos mágicos brillantes con Bloom hacia los 4 portales */}
      {circuitAngles.map((ang, idx) => {
        const col = idx % 2 === 0 ? '#00f5ff' : '#ff007f';
        return (
          <group key={idx} rotation={[0, ang, 0]}>
            <Box args={[0.48, 0.08, 28]} position={[0, 0.1, -18]}>
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={1.9} />
            </Box>
            <Box args={[1.85, 0.06, 28]} position={[0, 0.05, -18]}>
              <meshStandardMaterial color="#1a1230" />
              <Edges color={col} />
            </Box>
          </group>
        );
      })}

      {/* Circuitos diagonales secundarios */}
      {diagAngles.map((ang, idx) => (
        <group key={idx} rotation={[0, ang, 0]}>
          <Box args={[0.26, 0.07, 22]} position={[0, 0.08, -15]}>
            <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={1.6} />
          </Box>
        </group>
      ))}

      {/* Pilares de Obsidiana en las ruinas (Obstáculos estáticos) */}
      {STATIC_OBSTACLES.map((obs) => (
        <group key={obs.id} position={[obs.x, 0, obs.z]}>
          <Cylinder args={[obs.r, obs.r * 1.15, 0.8, 8]} position={[0, 0.4, 0]}>
            <meshStandardMaterial color="#161029" />
            <Edges color="#00f5ff" />
          </Cylinder>
          <Box args={[obs.r * 1.1, 4.2, obs.r * 1.1]} position={[0, 2.5, 0]}>
            <meshStandardMaterial color="#0e091c" />
            <Edges color="#ff007f" />
          </Box>
          <Box args={[obs.r * 0.55, 0.95, obs.r * 0.55]} position={[0, 5.15, 0]}>
            <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.2} />
          </Box>
        </group>
      ))}

      {/* Los 4 Portales de Horda en los extremos del mapa */}
      {PORTALS.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
          <Cylinder args={[2.8, 3.1, 0.5, 10]} position={[0, 0.25, 0]}>
            <meshStandardMaterial color="#1c0d2b" />
            <Edges color={p.color} />
          </Cylinder>
          <Box args={[0.7, 4.8, 0.7]} position={[-2.2, 2.4, 0]}>
            <meshStandardMaterial color="#120920" />
            <Edges color={p.color} />
          </Box>
          <Box args={[0.7, 4.8, 0.7]} position={[2.2, 2.4, 0]}>
            <meshStandardMaterial color="#120920" />
            <Edges color={p.color} />
          </Box>
          <Box args={[5.2, 0.8, 0.8]} position={[0, 4.9, 0]}>
            <meshStandardMaterial color="#120920" />
            <Edges color="#00f5ff" />
          </Box>
          <mesh position={[0, 2.5, 0]}>
            <torusGeometry args={[1.68, 0.14, 10, 28]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={2.5} />
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
        <Box
          key={i}
          args={[3.5, 1.4, 3.5]}
          position={[fx, fy, fz]}
          rotation={[0.2 * i, 0.5 * i, 0.1]}
        >
          <meshStandardMaterial color="#110b22" />
          <Edges color={i % 2 === 0 ? '#00f5ff' : '#39ff14'} />
        </Box>
      ))}
    </group>
  );
}
