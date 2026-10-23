'use client';
import { useRef, useMemo, Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Cylinder, Edges, Html } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, CylinderCollider, BallCollider } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  SLOT_COLORS,
  SLOT_NAMES,
  CHARACTERS,
  CRYSTAL_RADIUS,
  defenseById,
} from '../game/constants';
import { STATIC_OBSTACLES } from '../game/sim';
import {
  HeroModelAsset,
  TurretModelAsset,
  EnemyModelAsset,
  EtherCrystalAsset,
  ObsidianRuinsTerrainAsset,
} from './AssetManager';

export default function GameCanvas3D({ host, simRef, isLobby = false, lobbyPlayers = [] }) {
  const wrapRef = useRef(null);

  // Control de ratón en PC (Host) para rotación de cámara en 3ra persona y ataque con clic
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !host) return undefined;

    const onMouseMove = (e) => {
      if (host.phase !== 'playing' || host.paused) return;
      const sim = host.activeSim();
      const isThirdPerson =
        host.cameraMode === 'third_person' ||
        (host.cameraMode === 'auto' && sim && sim.subPhase === 'horde');

      if (isThirdPerson && (document.pointerLockElement === el || e.buttons === 1 || e.buttons === 2)) {
        host.rotateHostCamera(e.movementX * 0.0035, e.movementY * 0.0028);
      } else if (isThirdPerson) {
        // Permitir rotación suave incluso sin PointerLock al mover el cursor
        host.rotateHostCamera(e.movementX * 0.0018, e.movementY * 0.0014);
      }
    };

    const onMouseDown = (e) => {
      if (host.phase !== 'playing' || host.paused) return;
      if (e.target && e.target.closest && e.target.closest('button, .hud-top-bar, .hud-heroes-strip')) {
        return;
      }
      const sim = host.activeSim();
      const isThirdPerson =
        host.cameraMode === 'third_person' ||
        (host.cameraMode === 'auto' && sim && sim.subPhase === 'horde');

      if (e.button === 0 && isThirdPerson) {
        host.mouseAttack = true;
        host.triggerNavMeshClick(false);
      } else if (e.button === 2) {
        host.triggerNavMeshClick(true);
      }
    };

    const onMouseUp = (e) => {
      if (e.button === 0 && host) {
        host.mouseAttack = false;
      }
    };

    const onContextMenu = (e) => {
      if (host && host.phase === 'playing') e.preventDefault();
    };

    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [host]);

  return (
    <div ref={wrapRef} className="canvas3d-wrap">
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{ position: [0, 34, 36], fov: 46, near: 0.4, far: 190 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#05030a']} />
        <fog attach="fog" args={['#05030a', 48, 125]} />

        <Suspense fallback={null}>
          <Physics gravity={[0, -24, 0]} timeStep="vary">
            <ArenaScene
              host={host}
              simRef={simRef}
              isLobby={isLobby}
              lobbyPlayers={lobbyPlayers}
            />
          </Physics>
        </Suspense>

        {/* Postprocesamiento: Iluminación Cyber-Arcana y Bloom para hechizos, auras y el Cristal de Éter */}
        <EffectComposer disableNormalPass multisampling={0}>
          <Bloom luminanceThreshold={0.52} mipmapBlur intensity={1.35} radius={0.68} />
          <Vignette eskil={false} offset={0.14} darkness={0.72} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

function ArenaScene({ host, simRef, isLobby, lobbyPlayers }) {
  const crystalLightRef = useRef();
  const camLookAtRef = useRef(new THREE.Vector3(0, 1.5, 0));

  // Obtener simulación activa (Host o Espejo móvil)
  const getSim = () => {
    if (simRef && simRef.current) return simRef.current;
    if (host) return host.activeSim();
    return null;
  };

  // Controlador Híbrido de Cámara:
  // - Lobby: Órbita cinemática suave
  // - Fase de Forja: Cámara Táctica elevada con Raycasting sobre NavMesh
  // - Fase de Horda: Cámara en 3ra Persona sobre el hombro anclada al pivote del jugador
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const sim = getSim();
    if (sim && typeof sim.advance === 'function') {
      sim.advance(dt);
    }

    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (isLobby || !sim) {
      desiredPos.set(Math.sin(t * 0.25) * 6.5, 24, 28 + Math.cos(t * 0.25) * 3.2);
      desiredLook.set(0, 1.6, 2.0);
    } else {
      const mode = host ? host.cameraMode : 'auto';
      const useThirdPerson =
        mode === 'third_person' || (mode === 'auto' && sim.subPhase === 'horde');

      const targetSlot = host ? host.camTargetSlot : 0;
      const hero =
        (sim.heroes || []).find((h) => h.slot === targetSlot) || (sim.heroes || [])[0];

      if (useThirdPerson && hero && !hero.dead) {
        // Cámara Orbital en 3ra Persona sobre el hombro derecho del modelo 3D del jugador
        const yaw = Number.isFinite(hero.camYaw) ? hero.camYaw : hero.rotY || 0;
        const pitch = Number.isFinite(hero.camPitch) ? hero.camPitch : -0.22;

        const fwdX = Math.sin(yaw);
        const fwdZ = Math.cos(yaw);
        const rightX = -Math.cos(yaw);
        const rightZ = Math.sin(yaw);

        const followDist = 7.2;
        const shoulderOffset = 0.95;
        const pivotY = (hero.y || 0) + 2.25;
        const camHeight = pivotY + 1.85 + Math.sin(-pitch) * 3.4;

        desiredPos.set(
          hero.x - fwdX * followDist + rightX * shoulderOffset,
          Math.max(1.4, camHeight),
          hero.z - fwdZ * followDist + rightZ * shoulderOffset
        );

        const lookDist = 11.0;
        desiredLook.set(
          hero.x + fwdX * lookDist + rightX * (shoulderOffset * 0.35),
          pivotY + Math.sin(pitch) * 4.5,
          hero.z + fwdZ * lookDist + rightZ * (shoulderOffset * 0.35)
        );
      } else {
        // Fase de Forja / Modo Táctico: Vista estratégica isométrica con seguimiento suave
        const hordeCount = sim.enemies ? sim.enemies.length : 0;
        const intensity = Math.min(1.5, hordeCount / 16);
        const hurtShake = sim.crystal && sim.crystal.hurtT > 0 ? 0.55 : 0;
        const shake = intensity * 0.3 + hurtShake;

        const focusX = hero ? hero.x * 0.28 : 0;
        const focusZ = hero ? hero.z * 0.28 : 0;

        desiredPos.set(
          focusX + Math.sin(t * 1.4) * (0.4 + shake),
          35 - intensity * 1.2,
          focusZ + 33 + Math.cos(t * 1.1) * (0.4 + shake)
        );
        desiredLook.set(focusX, 0.5, focusZ);
      }
    }

    const lerpSpeed = isLobby ? 3.2 : 8.5;
    state.camera.position.lerp(desiredPos, Math.min(1, dt * lerpSpeed));
    camLookAtRef.current.lerp(desiredLook, Math.min(1, dt * (lerpSpeed + 2)));
    state.camera.lookAt(camLookAtRef.current);
  });

  // Handlers de Raycasting sobre la malla de navegación (NavMesh) para la Fase de Forja
  const handleNavMeshMove = (e) => {
    if (!host || isLobby || host.phase !== 'playing') return;
    e.stopPropagation();
    host.setNavMeshRay(e.point.x, e.point.z);
  };

  const handleNavMeshClick = (e) => {
    if (!host || isLobby || host.phase !== 'playing') return;
    e.stopPropagation();
    host.setNavMeshRay(e.point.x, e.point.z);
    const sim = getSim();
    if (sim && sim.subPhase === 'forge') {
      host.triggerNavMeshClick(false);
    }
  };

  return (
    <group>
      {/* Iluminación Cyber-Arcana */}
      <hemisphereLight args={['#221442', '#05020a', 1.05]} />
      <directionalLight position={[25, 42, 20]} intensity={1.3} color="#c4e0ff" />
      <pointLight
        ref={crystalLightRef}
        position={[0, 4.8, 0]}
        intensity={5.2}
        distance={42}
        decay={1.5}
        color="#00f5ff"
      />

      {/* Colisionadores Fijos de Rapier para el Terreno, Cristal y Pilares */}
      <RigidBody type="fixed" colliders={false} friction={0.2}>
        <CylinderCollider args={[1.2, 38]} position={[0, -1.2, 0]} />
        <CylinderCollider args={[3.0, CRYSTAL_RADIUS]} position={[0, 3.0, 0]} />
        {STATIC_OBSTACLES.map((obs) => (
          <CylinderCollider
            key={obs.id}
            args={[2.5, obs.r]}
            position={[obs.x, 2.5, obs.z]}
          />
        ))}
      </RigidBody>

      {/* Terreno y NavMesh gestionados por AssetManager */}
      <ObsidianRuinsTerrainAsset
        onNavMeshMove={handleNavMeshMove}
        onNavMeshClick={handleNavMeshClick}
      />

      {/* Núcleo del Mapa: El Cristal de Éter (.GLB + Bloom) */}
      <EtherCrystalAsset crystalLightRef={crystalLightRef} />

      {/* Sistema de Partículas Mágicas 3D */}
      <MagicParticles3D getSim={getSim} />

      {/* Pedestal de personajes seleccionados en el Lobby */}
      {isLobby && <LobbyShowcase lobbyPlayers={lobbyPlayers} />}

      {/* Entidades dinámicas con Físicas Rapier y superposiciones <Html> */}
      <DynamicEntities getSim={getSim} isLobby={isLobby} />
    </group>
  );
}

function LobbyShowcase({ lobbyPlayers }) {
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
            <Cylinder args={[1.55, 1.8, 0.45, 12]} position={[0, 0.22, 0]}>
              <meshStandardMaterial color={active ? '#1d1436' : '#0d0918'} />
              <Edges color={active ? SLOT_COLORS[slot] : '#3a2e54'} />
            </Cylinder>
            {active && (
              <HeroModelAsset
                charId={charId}
                slot={slot}
                animState="idle"
                moving={false}
                attackT={0}
                castT={0.2}
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
  useFrame(() => {
    tickRef.current++;
  });

  const sim = getSim();
  if (!sim) return null;

  return (
    <group>
      {/* Héroes con RigidBody de Rapier y sus hologramas de construcción por Raycasting */}
      {!isLobby &&
        (sim.heroes || []).map((h) => (
          <HeroEntity key={h.id} hero={h} subPhase={sim.subPhase} />
        ))}

      {/* Defensas / Torretas construidas con bloqueo físico en Rapier */}
      {(sim.turrets || []).map((tu) => (
        <TurretEntity key={tu.id} turret={tu} />
      ))}

      {/* Horda de Enemigos con barras de vida <Html> de Drei */}
      {(sim.enemies || []).map((e) => (
        <EnemyEntity key={e.id} enemy={e} />
      ))}

      {/* Proyectiles con colisionadores y brillo Bloom */}
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
  const rbRef = useRef();
  const visualRef = useRef();
  const holoRef = useRef();

  useFrame((state) => {
    // Sincronizar velocidad del joystick/teclado con el RigidBody de Rapier
    if (rbRef.current) {
      const tr = rbRef.current.translation();
      const distDrift = Math.hypot(tr.x - hero.x, tr.z - hero.z);

      if (distDrift > 2.2) {
        rbRef.current.setTranslation(
          { x: hero.x, y: Math.max(0, hero.y || 0), z: hero.z },
          true
        );
      } else {
        rbRef.current.setLinvel(
          { x: hero.vx || 0, y: hero.vy || 0, z: hero.vz || 0 },
          true
        );
      }
    }

    if (visualRef.current) {
      visualRef.current.position.set(hero.x, hero.y || 0, hero.z);
      visualRef.current.rotation.y = hero.rotY || 0;
    }

    if (holoRef.current) {
      holoRef.current.position.set(hero.holoX || hero.x, 0.05, hero.holoZ || hero.z);
      holoRef.current.rotation.y = state.clock.elapsedTime * 1.2;
    }
  });

  if (hero.dead) return null;
  const def = defenseById(hero.buildType || hero.ch?.defenses?.[0]?.id);
  const showHolo = subPhase === 'forge' || hero.buildMode;
  const hpPct = Math.max(0, Math.min(100, (hero.hp / (hero.maxHp || 1)) * 100));

  return (
    <>
      {/* RigidBody dinámico en Rapier para el jugador */}
      <RigidBody
        ref={rbRef}
        type="dynamic"
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={4.0}
        mass={1.5}
        position={[hero.x, hero.y || 0, hero.z]}
      >
        <CapsuleCollider args={[0.55, 0.55]} position={[0, 1.1, 0]} />
      </RigidBody>

      <group ref={visualRef} position={[hero.x, hero.y || 0, hero.z]} rotation={[0, hero.rotY || 0, 0]}>
        <HeroModelAsset
          charId={hero.char}
          slot={hero.slot}
          animState={hero.animState}
          moving={hero.moving}
          attackT={hero.attackT}
          castT={hero.castT}
          buffedT={hero.buffedT}
          shieldT={hero.shieldT}
        />

        {/* Etiqueta y barra flotante <Html> del Guardián */}
        <Html position={[0, 2.85, 0]} center distanceFactor={28} zIndexRange={[4, 0]}>
          <div className="entity-html-tag hero-tag" style={{ '--c': SLOT_COLORS[hero.slot] }}>
            <span className="eh-badge">{SLOT_NAMES[hero.slot]}</span>
            <div className="eh-bar-track">
              <div className="eh-bar-fill hp" style={{ width: `${hpPct}%` }} />
            </div>
          </div>
        </Html>
      </group>

      {/* Holograma proyectado por Raycasting sobre el NavMesh durante la Fase de Forja */}
      {showHolo && def && (
        <group ref={holoRef} position={[hero.holoX || hero.x, 0.05, hero.holoZ || hero.z]}>
          <TurretModelAsset defOverride={def} isHologram holoValid={hero.holoValid} />
        </group>
      )}
    </>
  );
}

function TurretEntity({ turret }) {
  const groupRef = useRef();
  const def = turret.def || defenseById(turret.type);
  const hpPct = Math.max(0, Math.min(100, (turret.hp / (turret.maxHp || def.hp || 1)) * 100));

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(turret.x, 0, turret.z);
    groupRef.current.rotation.y = def.isAura
      ? state.clock.elapsedTime * 1.2
      : turret.rotY || 0;
  });

  return (
    <>
      {/* Bloqueo físico de torretas en Rapier (excepto trampas/auras de piso) */}
      {!def.isTrap && !def.isAura && (
        <RigidBody type="fixed" colliders={false} position={[turret.x, 0, turret.z]}>
          <CylinderCollider args={[1.0, def.radius || 1.2]} position={[0, 1.0, 0]} />
        </RigidBody>
      )}

      <group ref={groupRef} position={[turret.x, 0, turret.z]}>
        <TurretModelAsset turret={turret} />

        {/* Barra de integridad <Html> sobre la defensa cuando recibe daño */}
        {hpPct < 99 && (
          <Html position={[0, 2.5, 0]} center distanceFactor={26} zIndexRange={[3, 0]}>
            <div className="entity-html-tag turret-tag">
              <div className="eh-bar-track">
                <div
                  className="eh-bar-fill turret"
                  style={{ width: `${hpPct}%`, background: def.color }}
                />
              </div>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

function EnemyEntity({ enemy }) {
  const groupRef = useRef();
  const isGolem = enemy.type === 'golem';
  const isColossus = enemy.type === 'colossus';
  const scale = isColossus ? 1.55 : isGolem ? 1.15 : 0.78;
  const hpPct = Math.max(0, Math.min(100, (enemy.hp / (enemy.maxHp || 1)) * 100));

  useFrame((state) => {
    if (!groupRef.current) return;
    const bob = enemy.moving ? Math.abs(Math.sin(state.clock.elapsedTime * 8 + enemy.x)) * 0.2 : 0;
    groupRef.current.position.set(enemy.x, (enemy.y || 0) + bob, enemy.z);
    groupRef.current.rotation.y = enemy.rotY || 0;
  });

  return (
    <group
      ref={groupRef}
      position={[enemy.x, enemy.y || 0, enemy.z]}
      scale={[scale, scale, scale]}
    >
      <EnemyModelAsset enemy={enemy} />

      {/* Superposición HTML (<Html> de Drei) para barra de vida y estados sobre cada enemigo */}
      <Html position={[0, 2.45, 0]} center distanceFactor={28} zIndexRange={[5, 0]}>
        <div className={`entity-html-tag enemy-tag ${enemy.type}`}>
          <div className="eh-enemy-row">
            <span className="eh-enemy-hp">{Math.max(0, Math.round(enemy.hp))}</span>
            {enemy.frozenT > 0 && <span className="eh-status">❄️</span>}
            {enemy.burningT > 0 && <span className="eh-status">🔥</span>}
            {enemy.stunnedT > 0 && <span className="eh-status">⚡</span>}
          </div>
          <div className="eh-bar-track">
            <div className="eh-bar-fill enemy" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
      </Html>
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
    const col = proj.color || '#00f5ff';
    return (
      <group position={[midX, proj.y || 1.6, midZ]} rotation={[0, ang, 0]}>
        <Box args={[0.24, 0.24, len]}>
          <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.8} />
        </Box>
      </group>
    );
  }

  const col = proj.color || '#00f5ff';
  return (
    <RigidBody
      type="kinematicPosition"
      colliders={false}
      position={[proj.x, proj.y || 1.4, proj.z]}
    >
      <BallCollider args={[0.35]} sensor />
      <Box args={[0.44, 0.44, 0.78]}>
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.6} />
        <Edges color="#ffffff" />
      </Box>
    </RigidBody>
  );
}

function EffectEntity({ effect }) {
  const p = Math.min(1, (effect.t || 0) / Math.max(0.1, effect.max || 0.4));
  const radius = (effect.r || 2.5) * (0.3 + p * 0.7);
  const opacity = Math.max(0.05, 1 - p);
  const col = effect.color || '#00f5ff';

  return (
    <group position={[effect.x, 0.16, effect.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.65, radius, 32]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={2.4}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Sistema de Partículas Mágicas 3D (InstancedMesh) para el Cristal de Éter e impactos de combate
 */
function MagicParticles3D({ getSim }) {
  const meshRef = useRef();
  const count = 72;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        radius: 2.2 + (i % 9) * 3.4,
        speed: 0.4 + (i % 5) * 0.25,
        yBase: 0.5 + (i % 7) * 0.85,
        scale: 0.08 + (i % 4) * 0.04,
      })),
    [count]
  );

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const sim = getSim();
    const fxList = sim && sim.effects ? sim.effects : [];

    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      if (i < fxList.length * 4 && fxList.length > 0) {
        // Partículas de explosión mágica sobre efectos activos
        const ef = fxList[i % fxList.length];
        const prog = Math.min(1, (ef.t || 0) / Math.max(0.1, ef.max || 0.4));
        const burstAng = s.angle + t * 4.0;
        const burstR = (ef.r || 2.0) * prog * 0.85;
        dummy.position.set(
          ef.x + Math.cos(burstAng) * burstR,
          0.4 + Math.sin(prog * Math.PI) * 2.4 + (i % 3) * 0.35,
          ef.z + Math.sin(burstAng) * burstR
        );
        const sc = s.scale * 2.2 * (1 - prog * 0.6);
        dummy.scale.set(sc, sc, sc);
      } else {
        // Partículas arcanas orbitando el Cristal de Éter y las ruinas
        const ang = s.angle + t * s.speed * 0.4;
        dummy.position.set(
          Math.cos(ang) * s.radius,
          s.yBase + Math.sin(t * 2.0 + i) * 0.65,
          Math.sin(ang) * s.radius
        );
        dummy.scale.set(s.scale, s.scale, s.scale);
      }
      dummy.rotation.set(t * 1.5, t * 2.1, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2.4} />
    </instancedMesh>
  );
}
