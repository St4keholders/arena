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
        <span className="logo-sub">CYBER-ARCANA DEFENSE 3D</span>
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
      } catch (er) { /* sin almacenamiento */ }
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
      {/* Escena 3D de Three.js renderizada en tiempo real */}
      {host && (
        <GameCanvas3D
          host={host}
          isLobby={!st || st.phase === 'lobby'}
          lobbyPlayers={st ? st.players : []}
        />
      )}

      {/* Sala de Espera (Lobby) */}
      {st && host && st.phase === 'lobby' && (
        <LobbyOverlay st={st} host={host} qr={qr} url={url} />
      )}

      {/* HUD de Partida en Curso (Fase de Forja y Fase de Horda) */}
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
      <div className="lobby-main">
        {/* Panel Izquierdo: Guardianes Conectados y Clases 3D */}
        <div className="lobby-left">
          <div className="lobby-header-row">
            <Logo small />
            <button type="button" className="mini-btn" onClick={joinKeyboardSlot}>
              + Añadir Guardián Local (Teclado)
            </button>
          </div>

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
                              ? '📱 Mando Celular P2P'
                              : '📱 Reconectando…'
                            : p.kind === 'kbA'
                            ? '⌨ Teclado WASD + Espacio/E/F'
                            : '⌨ Teclado Flechas'}
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
          ⚔ ¡INICIAR HORDA!
        </button>
      </div>

      <footer className="lobby-foot">
        <span>
          Controles PC de respaldo · <b>WASD</b> mueve, <b>1/2</b> elige torreta, <b>F</b> construye,{' '}
          <b>Espacio</b> ataque básico, <b>E</b> definitiva · Los modelos 3D en el centro muestran las clases activas.
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

function PlayingHudOverlay({ st, host }) {
  const crystalPct = Math.max(0, Math.min(100, (st.crystalHp / (st.crystalMaxHp || 1500)) * 100));
  const isForge = st.subPhase === 'forge';

  return (
    <div className="hud-overlay">
      {/* Barra Superior: Estado del Cristal de Éter, Ronda y Fase */}
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
          {isForge ? (
            <>
              <div className="phase-banner forge">
                <span>⚙ FASE DE FORJA</span>
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
            onClick={() => host.togglePause()}
            title="Pausa (Esc)"
          >
            II
          </button>
        </div>
      </div>

      {/* Tarjetas Inferiores de los Héroes en Campo */}
      <div className="hud-heroes-strip">
        {(st.heroesHud || []).map((h) => {
          const ch = charById(h.char);
          const hpW = Math.max(0, Math.min(100, (h.hp / (h.maxHp || 1)) * 100));
          const manaW = Math.max(0, Math.min(100, (h.mana / (h.maxMana || 1)) * 100));
          return (
            <div
              key={h.slot}
              className="hud-hero-card"
              style={{ '--c': SLOT_COLORS[h.slot], '--cls-c': ch.color }}
            >
              <div className="hh-top">
                <span className="hh-slot">{SLOT_NAMES[h.slot]}</span>
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
