'use client';
import { useRef, useState, useEffect } from 'react';
import { SLOT_NAMES, charById, defenseById } from '../game/constants';
import { eulerToQuat } from '../game/mirror';

export default function TouchGamepad({
  slot,
  color,
  hud,
  inpRef,
  isHost,
  paused,
  lost,
  onSelectDefense,
  onPlaceDefense,
  onTriggerAttack,
  onTriggerJump,
  onTriggerPower,
  onStartHorde,
  onPause,
  onQuit,
}) {
  const h = hud || {};
  const ch = charById(h.char || 'tecnomago');
  const subPhase = h.subPhase || 'forge';
  const isForge = subPhase === 'forge';

  const [wheelOpen, setWheelOpen] = useState(true);
  const [joyVis, setJoyVis] = useState({ active: false, ox: 0, oy: 0, dx: 0, dy: 0 });
  const [camLookActive, setCamLookActive] = useState(false);

  const joyTouchId = useRef(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const camTouchId = useRef(null);
  const camLastPos = useRef({ x: 0, y: 0 });

  // Abrir automáticamente la rueda de construcción al entrar en Fase de Forja
  useEffect(() => {
    setWheelOpen(isForge);
  }, [isForge]);

  const selectedDefId = h.buildType || ch.defenses[0]?.id;
  const selectedDef = defenseById(selectedDefId);
  const canAfford = (h.mana ?? 100) >= (selectedDef?.cost || 0);
  const holoOk = h.holoValid !== false && canAfford;

  // --------- Lado Izquierdo: Joystick Virtual para Movimiento Direccional (RigidBody Rapier) ---------
  const handleJoyDown = (e) => {
    if (joyTouchId.current !== null) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* nada */
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    joyTouchId.current = e.pointerId;
    joyOrigin.current = { x: ox, y: oy };
    inpRef.current.x = 0;
    inpRef.current.z = 0;
    setJoyVis({ active: true, ox, oy, dx: 0, dy: 0 });
  };

  const handleJoyMove = (e) => {
    if (joyTouchId.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const maxR = 58;
    let dx = cx - joyOrigin.current.x;
    let dy = cy - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    const nx = Math.round((dx / maxR) * 100) / 100;
    const nz = Math.round((dy / maxR) * 100) / 100;
    inpRef.current.x = Math.abs(nx) < 0.08 ? 0 : nx;
    inpRef.current.z = Math.abs(nz) < 0.08 ? 0 : nz;
    setJoyVis((prev) => ({ ...prev, dx, dy }));
  };

  const handleJoyUp = (e) => {
    if (joyTouchId.current !== e.pointerId) return;
    joyTouchId.current = null;
    inpRef.current.x = 0;
    inpRef.current.z = 0;
    setJoyVis({ active: false, ox: 0, oy: 0, dx: 0, dy: 0 });
  };

  // --------- Lado Derecho: Área Táctil para Rotar la Cámara (3ra Persona) ---------
  const handleCamDown = (e) => {
    if (camTouchId.current !== null) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      /* nada */
    }
    camTouchId.current = e.pointerId;
    camLastPos.current = { x: e.clientX, y: e.clientY };
    setCamLookActive(true);
  };

  const handleCamMove = (e) => {
    if (camTouchId.current !== e.pointerId) return;
    const dx = e.clientX - camLastPos.current.x;
    const dy = e.clientY - camLastPos.current.y;
    camLastPos.current = { x: e.clientX, y: e.clientY };

    const nextYaw = (inpRef.current.cy ?? Math.PI) - dx * 0.011;
    const nextPitch = Math.max(
      -0.75,
      Math.min(0.42, (inpRef.current.cp ?? -0.22) - dy * 0.008)
    );
    inpRef.current.cy = nextYaw;
    inpRef.current.cp = nextPitch;
    inpRef.current.cq = eulerToQuat(nextPitch, nextYaw, 0);
  };

  const handleCamUp = (e) => {
    if (camTouchId.current !== e.pointerId) return;
    camTouchId.current = null;
    setCamLookActive(false);
  };

  // --------- Botones de Acción (Ataque, Salto y Habilidad Especial) ---------
  const handleAttackDown = (e) => {
    e.preventDefault();
    inpRef.current.atk = true;
    onTriggerAttack && onTriggerAttack();
    if (navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (err) {
        /* nada */
      }
    }
  };

  const handleAttackUp = (e) => {
    e.preventDefault();
    inpRef.current.atk = false;
  };

  const handleJumpTap = (e) => {
    e.preventDefault();
    onTriggerJump && onTriggerJump();
    if (navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {
        /* nada */
      }
    }
  };

  const hpPct = Math.max(
    0,
    Math.min(100, ((h.hp ?? ch.stats.hp) / (h.maxHp || ch.stats.hp)) * 100)
  );
  const manaPct = Math.max(0, Math.min(100, ((h.mana ?? 120) / (h.maxMana || 180)) * 100));
  const powerPct = Math.max(0, Math.min(100, h.powerCharge || 0));
  const powerReady = powerPct >= 100;

  return (
    <div className="tpad" style={{ '--c': color, '--cls-c': ch.color }}>
      {/* Barra superior: Indicador de Vida, Maná, Fase y Cristal */}
      <header className="tpad-top">
        <div className="tpad-id">
          <span className="tpad-slot">{SLOT_NAMES[slot] || 'J1'}</span>
          <span className="tpad-char">{ch.name}</span>
        </div>

        <div className="tpad-bars">
          <div
            className="stat-bar hp"
            role="progressbar"
            aria-label="Vida"
            aria-valuenow={h.hp ?? ch.stats.hp}
          >
            <div className="stat-fill" style={{ width: `${hpPct}%` }} />
            <span className="stat-txt">
              HP {h.hp ?? ch.stats.hp}/{h.maxHp ?? ch.stats.hp}
            </span>
          </div>
          <div
            className="stat-bar mana"
            role="progressbar"
            aria-label="Maná"
            aria-valuenow={h.mana ?? 120}
          >
            <div className="stat-fill" style={{ width: `${manaPct}%` }} />
            <span className="stat-txt">
              ÉTER {h.mana ?? 120}/{h.maxMana ?? 180}
            </span>
          </div>
        </div>

        <div className="tpad-phase-box">
          <span className={`phase-pill ${isForge ? 'forge' : 'horde'}`}>
            {isForge ? `FORJA · ${h.forgeTimer ?? 30}s` : `HORDA · OLA ${h.wave || 1}`}
          </span>
          <button className="tpad-icon-btn" onClick={onPause} aria-label="Pausar partida">
            II
          </button>
        </div>
      </header>

      {/* Mensaje flotante de evento */}
      {h.msg && <div className="tpad-toast">{h.msg}</div>}

      {/* Cuerpo del controlador dividido en Zona Izquierda (Joystick) y Zona Derecha (Cámara + Acción / Forja) */}
      <div className="tpad-body">
        {/* ZONA IZQUIERDA: Joystick Virtual para Movimiento Direccional */}
        <div
          className="tpad-left-zone"
          onPointerDown={handleJoyDown}
          onPointerMove={handleJoyMove}
          onPointerUp={handleJoyUp}
          onPointerCancel={handleJoyUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="joy-hint">
            <span>✢ JOYSTICK DE MOVIMIENTO 3D</span>
            <small>Impulsa el RigidBody respecto a la cámara</small>
          </div>
          {joyVis.active && (
            <div
              className="joy-base"
              style={{ left: `${joyVis.ox}px`, top: `${joyVis.oy}px` }}
            >
              <div
                className="joy-stick"
                style={{
                  transform: `translate(${joyVis.dx}px, ${joyVis.dy}px)`,
                }}
              />
            </div>
          )}
        </div>

        {/* ZONA DERECHA: Área Táctil de Cámara + Botones de Ataque, Salto, Especial y Forja */}
        <div className="tpad-right-zone">
          {isForge ? (
            <div className="forge-panel">
              <div className="forge-wheel-header">
                <button
                  type="button"
                  className={`wheel-toggle ${wheelOpen ? 'open' : ''}`}
                  onClick={() => setWheelOpen((o) => !o)}
                >
                  ⚙ RUEDA DE CONSTRUCCIÓN {wheelOpen ? '▾' : '▸'}
                </button>
                <span className={`holo-status ${holoOk ? 'ok' : 'bad'}`}>
                  {holoOk
                    ? '● HOLOGRAMA VÁLIDO'
                    : !canAfford
                    ? '● MANÁ INSUFICIENTE'
                    : '● ESPACIO BLOQUEADO'}
                </span>
              </div>

              {wheelOpen && (
                <div className="build-wheel" role="radiogroup" aria-label="Seleccionar defensa">
                  {ch.defenses.map((def) => {
                    const active = selectedDefId === def.id;
                    const affordable = (h.mana ?? 120) >= def.cost;
                    return (
                      <button
                        key={def.id}
                        type="button"
                        className={`wheel-slice ${active ? 'selected' : ''} ${
                          !affordable ? 'dim' : ''
                        }`}
                        style={{ '--def-c': def.color }}
                        onClick={() => onSelectDefense && onSelectDefense(def.id)}
                      >
                        <div className="slice-title">{def.name}</div>
                        <div className="slice-cost">{def.cost} ÉTER</div>
                        <div className="slice-desc">{def.desc}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Touchpad táctil de orientación también disponible en Fase de Forja */}
              <div
                className={`cam-look-pad compact ${camLookActive ? 'active' : ''}`}
                onPointerDown={handleCamDown}
                onPointerMove={handleCamMove}
                onPointerUp={handleCamUp}
                onPointerCancel={handleCamUp}
              >
                <span>⟳ DESLIZA AQUÍ PARA GIRAR APUNTADO / CÁMARA</span>
              </div>

              <div className="forge-actions">
                <button
                  type="button"
                  className={`action-btn build-btn ${holoOk ? 'valid' : 'invalid'}`}
                  onClick={onPlaceDefense}
                >
                  <span className="btn-main">FORJAR {selectedDef?.short?.toUpperCase()}</span>
                  <span className="btn-sub">Costo: {selectedDef?.cost} Éter</span>
                </button>

                <button
                  type="button"
                  className="action-btn ready-horde-btn"
                  onClick={onStartHorde}
                >
                  ⚔ ¡INICIAR HORDA!
                </button>
              </div>
            </div>
          ) : (
            <div className="horde-panel">
              {/* Barra superior derecha: Acceso rápido a Forja en medio del combate */}
              <div className="horde-top-tools">
                <button
                  type="button"
                  className={`mini-forge-btn ${wheelOpen ? 'on' : ''}`}
                  onClick={() => setWheelOpen((o) => !o)}
                >
                  🛠 {wheelOpen ? 'Cerrar Forja' : `Forjar (${selectedDef?.short} · ${selectedDef?.cost})`}
                </button>
                {wheelOpen && (
                  <div className="mini-wheel-drawer">
                    {ch.defenses.map((def) => (
                      <button
                        key={def.id}
                        type="button"
                        className={`mini-slice ${selectedDefId === def.id ? 'on' : ''}`}
                        onClick={() => onSelectDefense && onSelectDefense(def.id)}
                      >
                        {def.short} ({def.cost})
                      </button>
                    ))}
                    <button type="button" className="mini-place-btn" onClick={onPlaceDefense}>
                      Colocar
                    </button>
                  </div>
                )}
              </div>

              {/* Área Táctil para rotar la cámara en 3ra persona deslizando el dedo */}
              <div
                className={`cam-look-pad ${camLookActive ? 'active' : ''}`}
                onPointerDown={handleCamDown}
                onPointerMove={handleCamMove}
                onPointerUp={handleCamUp}
                onPointerCancel={handleCamUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="cam-pad-reticle">⊕</div>
                <div className="cam-pad-txt">
                  <span>CÁMARA 3RA PERSONA</span>
                  <small>Desliza el dedo para rotar vista y apuntar</small>
                </div>
              </div>

              {/* Cluster de Combate: Habilidad Especial, Salto y Ataque Básico */}
              <div className="combat-cluster-3p">
                {/* Botón de Habilidad Especial (Definitiva) */}
                <button
                  type="button"
                  className={`combat-btn ultimate-btn ${powerReady ? 'ready' : ''}`}
                  onClick={onTriggerPower}
                  disabled={!powerReady}
                >
                  <span className="ult-label">
                    {powerReady ? '⚡ ESPECIAL' : `⚡ ${powerPct}%`}
                  </span>
                  <small className="ult-name">{ch.powerName}</small>
                </button>

                {/* Botón de Salto (Impulso vertical en Rapier) */}
                <button
                  type="button"
                  className="combat-btn jump-btn"
                  onPointerDown={handleJumpTap}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="jump-icon">⇪</span>
                  <span className="jump-title">SALTO</span>
                  <small className="atk-sub">Impulso 3D</small>
                </button>

                {/* Botón de Ataque Básico */}
                <button
                  type="button"
                  className="combat-btn basic-atk-btn"
                  onPointerDown={handleAttackDown}
                  onPointerUp={handleAttackUp}
                  onPointerCancel={handleAttackUp}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="atk-icon">✦</span>
                  <span className="atk-title">ATAQUE</span>
                  <small className="atk-sub">{ch.basicAttack.name}</small>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay de Pausa o Reconexión */}
      {(paused || lost) && (
        <div className="tpad-overlay">
          <div className="tpad-modal">
            <h2>{lost ? 'RECONECTANDO AL CRISTAL…' : 'PARTIDA EN PAUSA'}</h2>
            {!lost && (
              <button type="button" className="m-btn cyan wide" onClick={onPause}>
                Continuar Defensa
              </button>
            )}
            {!lost && isHost && (
              <button type="button" className="m-btn magenta wide" onClick={onQuit}>
                Volver al Lobby
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
