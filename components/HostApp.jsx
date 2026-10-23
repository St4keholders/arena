'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { GameHost, peerParamsString } from '../game/engine';
import {
  PASSWORD_HASH,
  CHARACTERS,
  MODES,
  DIFFICULTIES,
  SLOT_COLORS,
  SLOT_NAMES,
  GAME_NAME,
  CRYSTAL_MAX_HP,
  FORGE_DURATION,
  charById,
} from '../game/constants';
import { sha256 } from '../game/sha256';
import GameCanvas3D from './GameCanvas3D';

export default function HostApp() {
  const [unlocked, setUnlocked] = useState(null);

  useEffect(() => {
    let ok = false;
    try {
      ok = localStorage.getItem('arna_ok') === PASSWORD_HASH;
    } catch (e) {
      ok = false;
    }
    setUnlocked(ok);
  }, []);

  if (unlocked === null) return <div className="screen" />;
  if (!unlocked) return <PasswordGate onOk={() => setUnlocked(true)} />;
  return <ArenaHostScreen />;
}

function Logo({ small = false }) {
  return (
    <div className={small ? 'logo small' : 'logo'}>
      <span className="logo-gem">❖</span>
      <div className="logo-txt-wrap">
        <span className="logo-title">{GAME_NAME}</span>
        <span className="logo-sub">CYBER-ARCANA DEFENSE 3D · FASE 2</span>
      </div>
    </div>
  );
}

function PasswordGate({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const h = await sha256(pw);
    setBusy(false);
    if (h === PASSWORD_HASH) {
      try {
        localStorage.setItem('arna_ok', h);
      } catch (er) {
        /* sin almacenamiento */
      }
      onOk();
    } else {
      setErr('Contraseña arcana incorrecta');
      setPw('');
    }
  };

  return (
    <div className="screen gate">
      <div className="cyber-grid-bg" />
      <form className="gate-card" onSubmit={submit}>
        <Logo />
        <p className="gate-desc">
          Santuario del Cristal de Éter · Ingresa la clave de acceso para abrir el nodo P2P.
        </p>
        <label htmlFor="pw">CONTRASEÑA DE ACCESO</label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setErr('');
          }}
          placeholder="•••••••••"
          autoComplete="current-password"
        />
        <button className="btn cyan wide" type="submit" disabled={busy || !pw}>
          {busy ? 'VERIFICANDO…' : 'DESBLOQUEAR ARENA'}
        </button>
        <p className="err" role="alert">
          {err}
        </p>
      </form>
    </div>
  );
}

function ArenaHostScreen() {
  const hostRef = useRef(null);
  const [st, setSt] = useState(null);
  const [qr, setQr] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    const host = new GameHost((s) => setSt(s));
    hostRef.current = host;
    window.__arenaHost = host;
    setSt(host.snapshot());

    const unlockAudio = () => {
      host.audio.init();
    };
    window.addEventListener('pointerdown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      host.destroy();
    };
  }, []);

  useEffect(() => {
    if (!st || !st.code) return;
    const u = `${window.location.origin}/mando?c=${st.code}${peerParamsString()}`;
    setUrl(u);
    QRCode.toDataURL(u, {
      margin: 1,
      width: 340,
      errorCorrectionLevel: 'M',
      color: { dark: '#05030a', light: '#00f5ff' },
    })
      .then(setQr)
      .catch(() => setQr(''));
  }, [st && st.code]);

  const host = hostRef.current;

  return (
    <div className="screen game">
      {/* Escena 3D con modelos .GLB, Físicas Rapier y Postprocesamiento Bloom */}
      {host && (
        <GameCanvas3D
          host={host}
          isLobby={!st || st.phase === 'lobby'}
          lobbyPlayers={st ? st.players : []}
        />
      )}

      {/* Sala de Espera (Lobby con sistema de navegación por pestañas) */}
      {st && host && st.phase === 'lobby' && (
        <LobbyOverlay st={st} host={host} qr={qr} url={url} />
      )}

      {/* HUD de Partida en Curso (Fase de Forja y Fase de Horda en 3ra Persona) */}
      {st && host && st.phase === 'playing' && (
        <PlayingHudOverlay st={st} host={host} />
      )}

      {/* Modal de Pausa */}
      {st && host && st.phase === 'playing' && st.paused && (
        <PauseModal host={host} />
      )}

      {/* Pantalla de Resultados */}
      {st && host && st.phase === 'results' && (
        <ResultsModal st={st} host={host} />
      )}
    </div>
  );
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen && document.exitFullscreen();
  } else if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
}

function LobbyOverlay({ st, host, qr, url }) {
  const { cfg } = st;
  const [activeTab, setActiveTab] = useState('lobby'); // 'lobby' | 'instructions'

  const cycleSlotChar = (slotIdx, dir) => {
    const p = host.players[slotIdx];
    if (!p) return;
    const idx = CHARACTERS.findIndex((c) => c.id === p.char);
    p.char = CHARACTERS[(idx + dir + CHARACTERS.length) % CHARACTERS.length].id;
    host.audio.sfx('select');
    host.broadcastLobby();
    host.changed();
  };

  const joinKeyboardSlot = () => {
    const free = host.players.findIndex((p) => !p);
    if (free < 0) return;
    const hasKbA = host.players.some((p) => p && p.kind === 'kbA');
    host.players[free] = {
      slot: free,
      kind: hasKbA ? 'kbB' : 'kbA',
      char: host.freeChar(),
      connected: true,
    };
    host.audio.sfx('join');
    host.broadcastLobby();
    host.changed();
  };

  return (
    <div className="overlay lobby">
      {/* Barra Superior con Logo y Sistema de Navegación por Pestañas */}
      <div className="lobby-top-nav">
        <Logo small />

        <nav className="lobby-tabs" role="tablist" aria-label="Navegación del Santuario">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lobby'}
            className={`lobby-tab-btn ${activeTab === 'lobby' ? 'active' : ''}`}
            onClick={() => {
              host.audio.sfx('select');
              setActiveTab('lobby');
            }}
          >
            ⚔ SALA DE GUARDIANES
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'instructions'}
            className={`lobby-tab-btn ${activeTab === 'instructions' ? 'active' : ''}`}
            onClick={() => {
              host.audio.sfx('select');
              setActiveTab('instructions');
            }}
          >
            📖 INSTRUCCIONES Y CLASES
          </button>
        </nav>

        <div className="lobby-top-actions">
          <button type="button" className="mini-btn" onClick={joinKeyboardSlot}>
            + Añadir Guardián PC (Teclado/Ratón)
          </button>
        </div>
      </div>

      {/* Contenido Dinámico según Pestaña Activa */}
      {activeTab === 'instructions' ? (
        <InstructionsTabPanel onBackToLobby={() => setActiveTab('lobby')} />
      ) : (
        <div className="lobby-main">
          {/* Panel Izquierdo: Guardianes Conectados y Clases 3D */}
          <div className="lobby-left">
            <div className="slots-grid">
              {st.players.map((p, i) => {
                const ch = p ? charById(p.char) : null;
                return (
                  <div
                    key={i}
                    className={`slot-card ${p ? 'active' : ''}`}
                    style={{ '--c': SLOT_COLORS[i], '--cls-c': ch ? ch.color : SLOT_COLORS[i] }}
                  >
                    <div className="slot-badge">{SLOT_NAMES[i]}</div>
                    {p && ch ? (
                      <>
                        <div className="slot-avatar" style={{ borderColor: ch.color }}>
                          <span>{ch.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="slot-info">
                          <div className="slot-title-row">
                            <button
                              type="button"
                              className="char-arrow"
                              onClick={() => cycleSlotChar(i, -1)}
                              aria-label="Clase anterior"
                            >
                              ◀
                            </button>
                            <span className="slot-name">{ch.name}</span>
                            <button
                              type="button"
                              className="char-arrow"
                              onClick={() => cycleSlotChar(i, 1)}
                              aria-label="Siguiente clase"
                            >
                              ▶
                            </button>
                          </div>
                          <div className="slot-role">{ch.role}</div>
                          <div className="slot-defs">
                            {ch.defenses.map((d) => (
                              <span key={d.id} className="def-chip">
                                {d.short} ({d.cost})
                              </span>
                            ))}
                          </div>
                          <div className="slot-device">
                            {p.kind === 'phone'
                              ? p.connected
                                ? '📱 Mando Celular P2P (Joystick + Cámara)'
                                : '📱 Reconectando…'
                              : p.kind === 'kbA'
                              ? '⌨🖱 PC 3ra Persona (WASD + Ratón + Espacio)'
                              : '⌨ Teclado Secundario (Flechas)'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="slot-remove"
                          title="Quitar jugador"
                          onClick={() => host.removePlayer(i)}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <div className="slot-empty">
                        <strong>Ranura de Guardián Libre</strong>
                        <small>Escanea el QR con tu celular o pulsa W / ↑ en el teclado</small>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel Derecho: QR de Emparejamiento apuntando a /mando */}
          <div className="lobby-right">
            <div className="qr-card">
              <div className="qr-header">CONECTA TU CELULAR COMO MANDO</div>
              <div className="qr-frame">
                {qr ? (
                  <img src={qr} alt="Código QR hacia /mando" />
                ) : (
                  <div className="qr-wait">Generando enlace P2P…</div>
                )}
              </div>
              <div className="room-code">{st.code || '·····'}</div>
              <div className={`peer-badge ${st.peerStatus}`}>
                {st.peerStatus === 'ready'
                  ? '● Nodo WebRTC P2P Activo'
                  : st.peerStatus === 'error'
                  ? '● ' + (st.peerError || 'Sin conexión')
                  : '● Enlazando servidor PeerJS…'}
              </div>
              <p className="qr-help">
                Escanea con la cámara o abre{' '}
                <b>{url ? url.split('?')[0].replace(/^https?:\/\//, '') : '/mando'}</b> e ingresa el
                código.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra Inferior del Lobby: Configuración y Botón "Iniciar Horda" */}
      <div className="lobby-bar">
        <div className="cfg-group">
          <div className="cfg-label">MODO DE DEFENSA</div>
          <div className="seg">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cfg.mode === m.id ? 'on' : ''}
                onClick={() => host.setCfg({ mode: m.id })}
                title={m.desc}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="cfg-group">
          <div className="cfg-label">AMENAZA ARCANO-MECÁNICA</div>
          <div className="seg">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={cfg.diff === d.id ? 'on' : ''}
                onClick={() => host.setCfg({ diff: d.id })}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn cyan start-horde-cta"
          onClick={() => host.startGame()}
        >
          ⚔ ¡INICIAR PARTIDA!
        </button>
      </div>

      <footer className="lobby-foot">
        <span>
          Controles PC 3ra Persona · <b>WASD</b> mueve según cámara, <b>Ratón</b> apunta/construye por Raycasting,{' '}
          <b>Espacio</b> salta, <b>Clic Izq / Q</b> ataca, <b>E</b> definitiva, <b>C</b> alterna cámara.
        </span>
        <div className="foot-btns">
          <button type="button" className="mini-btn" onClick={() => host.toggleMute()}>
            {st.muted ? '🔇 Sonido Off' : '🔊 Sonido On'}
          </button>
          <button type="button" className="mini-btn" onClick={toggleFullscreen}>
            ⛶ Pantalla Completa
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Pestaña "Instrucciones": Panel flotante superpuesto al <canvas> que detalla:
 * 1. Controles (Host PC vs. Mando Celular)
 * 2. Estadísticas de las 4 clases de personajes
 * 3. Funcionamiento del Cristal de Éter y el Loop de Jugabilidad (Forja + Horda en 3ra persona)
 */
function InstructionsTabPanel({ onBackToLobby }) {
  return (
    <div className="instructions-panel" role="tabpanel" aria-label="Instrucciones de Arena">
      <div className="inst-grid">
        {/* Columna 1: Controles Host (PC) vs. Celular (Mando P2P) */}
        <section className="inst-card">
          <div className="inst-card-header">
            <span className="inst-icon">🎮</span>
            <h3>CONTROLES: HOST (PC) VS. CELULAR (MANDO)</h3>
          </div>

          <div className="control-block">
            <h4>🖥 CONTROLES EN PC (ANFITRIÓN · 3RA PERSONA Y FORJA)</h4>
            <ul className="control-list">
              <li>
                <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
                <span>Movimiento direccional relativo a la orientación de la cámara.</span>
              </li>
              <li>
                <kbd>Ratón</kbd>
                <span>
                  Rotación orbital de la cámara sobre el hombro y apuntado con retícula central (o{' '}
                  <b>Raycasting</b> sobre el NavMesh en Fase de Forja).
                </span>
              </li>
              <li>
                <kbd>Clic Izq</kbd> / <kbd>Q</kbd>
                <span>Disparar Ataque Básico en combate o instanciar torreta en Fase de Forja.</span>
              </li>
              <li>
                <kbd>Espacio</kbd>
                <span>Salto físico 3D impulsado por el motor de físicas Rapier.</span>
              </li>
              <li>
                <kbd>1</kbd> <kbd>2</kbd> + <kbd>F</kbd>
                <span>Elegir tipo de defensa y proyectar/construir holograma.</span>
              </li>
              <li>
                <kbd>E</kbd> / <kbd>C</kbd>
                <span>
                  <b>E</b> desata la Habilidad Especial (100% ⚡) · <b>C</b> alterna Cámara Táctica / 3ra Persona.
                </span>
              </li>
            </ul>
          </div>

          <div className="control-block">
            <h4>📱 CONTROLES EN CELULAR (MANDO P2P WEBRTC)</h4>
            <ul className="control-list">
              <li>
                <kbd>Lado Izquierdo</kbd>
                <span>
                  <b>Joystick Virtual:</b> Movimiento direccional 360° sincronizado con el vector de
                  velocidad del <code>RigidBody</code> en Rapier.
                </span>
              </li>
              <li>
                <kbd>Lado Derecho</kbd>
                <span>
                  <b>Touchpad de Cámara:</b> Desliza el dedo para rotar la cámara en 3ra persona
                  (sincronizada por cuaterniones en tiempo real).
                </span>
              </li>
              <li>
                <kbd>Botones Acción</kbd>
                <span>
                  Botones dedicados de <b>✦ Ataque</b>, <b>⇪ Salto</b>, <b>⚡ Habilidad Especial</b> y{' '}
                  <b>⚙ Rueda de Forja</b>.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Columna 2: Estadísticas de las 4 Clases de Personajes */}
        <section className="inst-card">
          <div className="inst-card-header">
            <span className="inst-icon">⚔</span>
            <h3>ESTADÍSTICAS DE LAS 4 CLASES DE GUARDIANES</h3>
          </div>

          <div className="inst-classes-list">
            {CHARACTERS.map((ch) => (
              <div key={ch.id} className="inst-class-item" style={{ '--cc': ch.color }}>
                <div className="inst-class-top">
                  <div>
                    <strong style={{ color: ch.color }}>{ch.full}</strong>
                    <span className="inst-class-role">{ch.role}</span>
                  </div>
                  <div className="inst-stat-pills">
                    <span>HP {ch.stats.hp}</span>
                    <span>ÉTER {ch.stats.maxMana + 60}</span>
                    <span>VEL {ch.stats.speed}</span>
                  </div>
                </div>

                <div className="inst-bars-grid">
                  <div className="inst-mini-stat">
                    <span>ATQ</span>
                    <div className="inst-bar">
                      <div style={{ width: `${(ch.stats.attack / 5) * 100}%`, background: ch.color }} />
                    </div>
                  </div>
                  <div className="inst-mini-stat">
                    <span>DEF</span>
                    <div className="inst-bar">
                      <div style={{ width: `${(ch.stats.defense / 5) * 100}%`, background: ch.color }} />
                    </div>
                  </div>
                  <div className="inst-mini-stat">
                    <span>MAG</span>
                    <div className="inst-bar">
                      <div style={{ width: `${(ch.stats.magic / 5) * 100}%`, background: ch.color }} />
                    </div>
                  </div>
                </div>

                <div className="inst-class-skills">
                  <small>
                    <b>✦ Básico:</b> {ch.basicAttack.name} ({ch.basicAttack.dmg} DMG) ·{' '}
                    <b>⚡ Especial:</b> {ch.powerName}
                  </small>
                  <small>
                    <b>🛠 Defensas (.glb):</b>{' '}
                    {ch.defenses.map((d) => `${d.name} (${d.cost} Éter)`).join(' · ')}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Columna 3: Funcionamiento del Cristal de Éter y Loop de Juego */}
        <section className="inst-card">
          <div className="inst-card-header">
            <span className="inst-icon">❖</span>
            <h3>EL CRISTAL DE ÉTER Y FASES DE DEFENSA</h3>
          </div>

          <div className="ether-explain-box">
            <div className="ether-gem-badge">❖</div>
            <div>
              <h4>NÚCLEO ARCANA ({CRYSTAL_MAX_HP} HP)</h4>
              <p>
                El Cristal de Éter levita en el centro del santuario. Las hordas emergen de los{' '}
                <b>4 Portales Cardinales</b> buscando fracturarlo. Si su integridad llega a{' '}
                <b>0 HP</b>, la partida termina en derrota. Al superar cada oleada, el Cristal
                regenera <b>+140 HP</b> y otorga Éter adicional a todos los guardianes.
              </p>
            </div>
          </div>

          <div className="loop-steps">
            <div className="loop-step forge">
              <span className="step-tag">1. FASE DE FORJA ({FORGE_DURATION}s)</span>
              <p>
                La cámara adopta un <b>modo táctico elevado</b>. Usa el ratón (Raycasting sobre el
                NavMesh) o tu posición para proyectar el holograma de tus torretas. Si el holograma
                es <b style={{ color: '#00f5ff' }}>Azul (Válido)</b>, instanciarás el modelo{' '}
                <code>.glb</code> con colisión física en Rapier.
              </p>
            </div>

            <div className="loop-step horde">
              <span className="step-tag">2. FASE DE HORDA (3RA PERSONA)</span>
              <p>
                La cámara realiza una transición suave y se ancla <b>sobre el hombro</b> de tu
                guardián. Apunta con la retícula central, salta obstáculos y combina efectos
                elementales: <b>❄️ Congelación</b> (Criogénica), <b>🔥 Quemadura</b> (Trampa
                Explosiva), <b>⚡ Electrocución</b> (Chamán) y <b>🌀 Gravedad</b>.
              </p>
            </div>
          </div>

          <button type="button" className="btn cyan wide" onClick={onBackToLobby}>
            ⚔ VOLVER A LA SALA DE GUARDIANES
          </button>
        </section>
      </div>
    </div>
  );
}

function PlayingHudOverlay({ st, host }) {
  const [showHelp, setShowHelp] = useState(false);
  const crystalPct = Math.max(0, Math.min(100, (st.crystalHp / (st.crystalMaxHp || 1500)) * 100));
  const isForge = st.subPhase === 'forge';
  const isThirdPerson =
    st.cameraMode === 'third_person' || (st.cameraMode === 'auto' && !isForge);

  return (
    <div className="hud-overlay">
      {/* Retícula Central de Apuntado en 3ra Persona (PC Host) */}
      {isThirdPerson && !st.paused && !showHelp && (
        <div className="third-person-reticle" aria-hidden="true">
          <div className="reticle-ring" />
          <div className="reticle-dot" />
          <span className="reticle-label">3RA PERSONA · CLIC IZQ ATACAR</span>
        </div>
      )}

      {/* Barra Superior: Estado del Cristal de Éter, Ronda, Cámara y Fase */}
      <div className="hud-top-bar">
        <div className="hud-wave-box">
          <span className="hud-wave-label">OLEADA</span>
          <span className="hud-wave-num">
            {st.wave} <small>/ {st.maxWaves}</small>
          </span>
        </div>

        <div className="hud-crystal-box">
          <div className="crystal-header">
            <span>❖ CRISTAL DE ÉTER</span>
            <span>
              {st.crystalHp} / {st.crystalMaxHp} HP
            </span>
          </div>
          <div className="crystal-bar-track">
            <div className="crystal-bar-fill" style={{ width: `${crystalPct}%` }} />
          </div>
        </div>

        <div className="hud-phase-controls">
          <button
            type="button"
            className="mini-btn cam-toggle-btn"
            onClick={() => host.toggleCameraMode()}
            title="Alternar Cámara 3ra Persona / Táctica (Tecla C)"
          >
            🎥 {isThirdPerson ? '3ra Persona [C]' : 'Vista Táctica [C]'}
          </button>

          {isForge ? (
            <>
              <div className="phase-banner forge">
                <span>⚙ FASE DE FORJA (RAYCAST)</span>
                <strong>{st.forgeTimer}s</strong>
              </div>
              <button
                type="button"
                className="btn magenta launch-wave-btn"
                onClick={() => host.triggerHorde()}
              >
                ⚔ ¡INICIAR HORDA!
              </button>
            </>
          ) : (
            <div className="phase-banner horde">
              <span>🔥 FASE DE HORDA</span>
              <strong>{st.enemiesLeft} Enemigos</strong>
            </div>
          )}

          <button
            type="button"
            className="corner-pause-btn"
            onClick={() => setShowHelp((v) => !v)}
            title="Instrucciones y Controles"
          >
            ?
          </button>
          <button
            type="button"
            className="corner-pause-btn"
            onClick={() => host.togglePause()}
            title="Pausa (Esc)"
          >
            II
          </button>
        </div>
      </div>

      {/* Modal flotante de Instrucciones durante la partida si se pulsa '?' */}
      {showHelp && (
        <div className="hud-help-modal">
          <InstructionsTabPanel onBackToLobby={() => setShowHelp(false)} />
        </div>
      )}

      {/* Tarjetas Inferiores de los Héroes en Campo */}
      <div className="hud-heroes-strip">
        {(st.heroesHud || []).map((h) => {
          const ch = charById(h.char);
          const hpW = Math.max(0, Math.min(100, (h.hp / (h.maxHp || 1)) * 100));
          const manaW = Math.max(0, Math.min(100, (h.mana / (h.maxMana || 1)) * 100));
          const isCamTarget = st.camTargetSlot === h.slot;
          return (
            <div
              key={h.slot}
              className={`hud-hero-card ${isCamTarget ? 'cam-focus' : ''}`}
              style={{ '--c': SLOT_COLORS[h.slot], '--cls-c': ch.color }}
              onClick={() => {
                host.camTargetSlot = h.slot;
                host.changed();
              }}
              title="Clic para anclar la cámara 3ra persona a este guardián"
            >
              <div className="hh-top">
                <span className="hh-slot">
                  {SLOT_NAMES[h.slot]} {isCamTarget ? '🎥' : ''}
                </span>
                <span className="hh-name">{ch.name}</span>
                <span className="hh-ult">{h.powerCharge}% ⚡</span>
              </div>
              <div className="hh-bar hp">
                <div style={{ width: `${hpW}%` }} />
                <span>
                  HP {h.hp}/{h.maxHp}
                </span>
              </div>
              <div className="hh-bar mana">
                <div style={{ width: `${manaW}%` }} />
                <span>
                  ÉTER {h.mana}/{h.maxMana}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PauseModal({ host }) {
  return (
    <div className="overlay center">
      <div className="modal-card">
        <h2>PARTIDA EN PAUSA</h2>
        <p>El nexo temporal del Cristal de Éter está detenido.</p>
        <div className="modal-actions">
          <button type="button" className="btn cyan wide" onClick={() => host.togglePause()}>
            CONTINUAR DEFENSA
          </button>
          <button type="button" className="btn magenta wide" onClick={() => host.toLobby()}>
            VOLVER AL LOBBY
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsModal({ st, host }) {
  const res = st.results || [];
  return (
    <div className="overlay center">
      <div className="modal-card results-card">
        <div className={`results-badge ${st.victory ? 'win' : 'lose'}`}>
          {st.victory ? '❖ VICTORIA ARCANA' : '✕ NÚCLEO DESTRUIDO'}
        </div>
        <h2>{st.victory ? '¡EL CRISTAL DE ÉTER SOBREVIVIÓ!' : 'LAS RUINAS HAN CAÍDO'}</h2>
        <table className="results-table">
          <thead>
            <tr>
              <th>Guardián</th>
              <th>Clase</th>
              <th>Bajas</th>
              <th>Defensas</th>
              <th>Daño Total</th>
            </tr>
          </thead>
          <tbody>
            {res.map((r) => {
              const ch = charById(r.char);
              return (
                <tr key={r.slot} style={{ '--c': SLOT_COLORS[r.slot] }}>
                  <td>
                    <span className="res-slot">{SLOT_NAMES[r.slot]}</span>
                  </td>
                  <td>{ch.name}</td>
                  <td>{r.kills}</td>
                  <td>{r.built}</td>
                  <td>{r.dmgDealt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="btn cyan wide" onClick={() => host.toLobby()} autoFocus>
          VOLVER A LA SALA DE ESPERA
        </button>
      </div>
    </div>
  );
}
