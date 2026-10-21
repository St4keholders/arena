'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CHARACTERS,
  MODES,
  DIFFICULTIES,
  SLOT_COLORS,
  SLOT_NAMES,
  GAME_NAME,
  charById,
} from '../game/constants';
import { peerOptionsFromURL } from '../game/peeropts';
import { peerIdForCode } from '../game/engine';
import TouchGamepad from './TouchGamepad';

function getPid() {
  try {
    let id = localStorage.getItem('arna_pid');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('arna_pid', id);
    }
    return id;
  } catch (e) {
    return Math.random().toString(36).slice(2);
  }
}

export default function ControllerApp() {
  const [code, setCode] = useState(null);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('connecting');
  const [slot, setSlot] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [pinfo, setPinfo] = useState({});
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(false);

  const connRef = useRef(null);
  const phaseRef = useRef('lobby');
  const inpRef = useRef({
    x: 0,
    z: 0,
    atk: false,
    ac: 0,
    pc: 0,
    bc: 0,
    def: null,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = (q.get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCode(c || '');
  }, []);

  // Conexión P2P WebRTC con el Host
  useEffect(() => {
    if (!code) return undefined;
    let peer = null;
    let dead = false;
    let retryT = null;
    const pid = getPid();

    const onMsg = (m) => {
      if (!m || typeof m !== 'object') return;
      switch (m.t) {
        case 'welcome':
          setSlot(m.slot);
          break;
        case 'lobby':
          setLobby(m);
          setSlot(m.you);
          if (m.phase) setPhase(m.phase);
          break;
        case 'phase':
          setPhase(m.phase);
          setPinfo(m);
          setPaused(false);
          if (m.phase !== 'playing') setHud(null);
          break;
        case 'hud':
          setHud(m);
          break;
        case 'buzz':
          if (navigator.vibrate) {
            try { navigator.vibrate(m.ms); } catch (e) { /* nada */ }
          }
          break;
        case 'paused':
          setPaused(!!m.v);
          break;
        case 'full':
          setStatus('full');
          dead = true;
          break;
        case 'kicked':
          setStatus('kicked');
          dead = true;
          break;
        default:
          break;
      }
    };

    const retry = () => {
      if (dead) return;
      clearTimeout(retryT);
      retryT = setTimeout(() => {
        if (dead) return;
        if (peer && !peer.destroyed && peer.open) openConn();
        else {
          try { peer && peer.destroy(); } catch (e) { /* nada */ }
          start();
        }
      }, 2000);
    };

    const openConn = () => {
      const conn = peer.connect(peerIdForCode(code), {
        reliable: true,
        serialization: 'json',
      });
      const to = setTimeout(() => {
        if (!conn.open) {
          try { conn.close(); } catch (e) { /* nada */ }
          setStatus((s) => (s === 'online' ? 'lost' : 'nohost'));
          retry();
        }
      }, 9000);

      conn.on('open', () => {
        clearTimeout(to);
        connRef.current = conn;
        setStatus('online');
        conn.send({ t: 'hello', pid });
      });
      conn.on('data', onMsg);
      conn.on('close', () => {
        clearTimeout(to);
        if (connRef.current === conn) connRef.current = null;
        if (!dead) {
          setStatus('lost');
          retry();
        }
      });
      conn.on('error', () => {
        clearTimeout(to);
      });
    };

    const start = async () => {
      const { Peer } = await import('peerjs');
      if (dead) return;
      peer = new Peer(undefined, peerOptionsFromURL());
      peer.on('open', () => openConn());
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') {
          setStatus((s) => (s === 'online' ? 'lost' : 'nohost'));
        } else {
          setStatus((s) => (s === 'online' ? 'lost' : 'connecting'));
        }
        retry();
      });
      peer.on('disconnected', () => {
        try {
          if (!peer.destroyed) peer.reconnect();
        } catch (er) { /* nada */ }
      });
    };

    start();
    return () => {
      dead = true;
      clearTimeout(retryT);
      try {
        peer && peer.destroy();
      } catch (e) { /* nada */ }
    };
  }, [code]);

  const send = (m) => {
    const c = connRef.current;
    if (c && c.open) {
      try {
        c.send(m);
      } catch (e) { /* nada */ }
    }
  };

  // Bucle de envío de inputs de mando cada 33ms
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== 'playing') return;
      const i = inpRef.current;
      send({
        t: 'in',
        x: i.x,
        z: i.z,
        atk: i.atk,
        ac: i.ac,
        pc: i.pc,
        bc: i.bc,
        def: i.def,
      });
    }, 33);
    return () => clearInterval(id);
  }, []);

  if (code === null) return <div className="m-screen" />;

  // Pantalla de ingreso de código si se abrió /mando sin parámetro ?c=
  if (!code) {
    return (
      <div className="m-screen m-center">
        <div className="m-logo">❖ {GAME_NAME}</div>
        <p className="m-sub">
          Escanea el código QR en la pantalla principal o introduce el código arcano de 5 caracteres.
        </p>
        <form
          className="m-code-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().length >= 4) {
              const u = new URL(window.location.href);
              u.searchParams.set('c', typed.trim().toUpperCase());
              window.location.href = u.toString();
            }
          }}
        >
          <input
            className="m-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            maxLength={5}
            placeholder="CÓDIGO"
            autoCapitalize="characters"
            aria-label="Código de sala"
          />
          <button className="m-btn cyan wide" type="submit">
            CONECTAR MANDO
          </button>
        </form>
      </div>
    );
  }

  if (status === 'full') {
    return (
      <StatusScreen
        title="SANTUARIO LLENO"
        text="Ya hay 4 guardianes conectados a esta sesión."
      />
    );
  }
  if (status === 'kicked') {
    return (
      <StatusScreen
        title="CONEXIÓN CERRADA"
        text="Fuiste desconectado de la sala. Toca para reconectar."
        onClick={() => window.location.reload()}
      />
    );
  }
  if (status !== 'online' && !lobby) {
    return (
      <StatusScreen
        title={status === 'nohost' ? 'BUSCANDO EL CRISTAL…' : 'ENLAZANDO NODO P2P…'}
        text={
          status === 'nohost'
            ? `Verifica que la sala ${code} esté abierta en la pantalla principal.`
            : `Código de sala: ${code}`
        }
        spin
      />
    );
  }

  const me = lobby && slot !== null ? lobby.players[slot] : null;
  const color = slot !== null ? SLOT_COLORS[slot] : '#00f5ff';
  const isHost = (lobby && lobby.host) || slot === 0;
  const lost = status !== 'online';

  // Pantalla de juego (Fase de Forja + Fase de Horda)
  if (phase === 'playing') {
    return (
      <TouchGamepad
        slot={slot}
        color={color}
        hud={hud}
        inpRef={inpRef}
        isHost={isHost}
        paused={paused}
        lost={lost}
        onSelectDefense={(defId) => {
          inpRef.current.def = defId;
        }}
        onPlaceDefense={() => {
          inpRef.current.bc++;
        }}
        onTriggerAttack={() => {
          inpRef.current.ac++;
        }}
        onTriggerPower={() => {
          inpRef.current.pc++;
        }}
        onStartHorde={() => send({ t: 'start_horde' })}
        onPause={() => send({ t: 'pause' })}
        onQuit={() => send({ t: 'quit' })}
      />
    );
  }

  // Pantalla de resultados en el celular
  if (phase === 'results') {
    return (
      <div className="m-screen m-center" style={{ '--c': color }}>
        <div className="m-tag">{SLOT_NAMES[slot] || 'J1'}</div>
        <h2 className="m-res-title">
          {pinfo.victory ? '¡CRISTAL DE ÉTER PROTEGIDO!' : 'EL CRISTAL HA CAÍDO'}
        </h2>
        <p className="m-sub">
          {pinfo.victory
            ? 'Las hordas corruptas fueron erradicadas de las ruinas.'
            : 'Las fuerzas corruptas destruyeron el núcleo.'}
        </p>
        {isHost ? (
          <button className="m-btn cyan wide" onClick={() => send({ t: 'quit' })}>
            VOLVER AL LOBBY
          </button>
        ) : (
          <p className="m-small">Esperando a que el anfitrión regrese al lobby…</p>
        )}
      </div>
    );
  }

  // Pantalla de Lobby en el celular (Selección de las 4 Clases Jugables)
  const mine = me ? charById(me.char) : CHARACTERS[0];

  return (
    <div className="m-screen m-lobby" style={{ '--c': color }}>
      <header className="m-head">
        <div className="m-logo">❖ {GAME_NAME}</div>
        {slot !== null && <div className="m-tag">{SLOT_NAMES[slot]}</div>}
        {lost && <div className="m-lost">Reconectando…</div>}
      </header>

      <div className="m-card">
        <div className="m-h">ELIGE TU CLASE CYBER-ARCANA</div>
        <div className="m-chars-grid">
          {CHARACTERS.map((c) => {
            const takenBy =
              lobby && lobby.players
                ? lobby.players.findIndex((p, i) => p && i !== slot && p.char === c.id)
                : -1;
            const isSelected = mine.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className={`m-char-card ${isSelected ? 'on' : ''}`}
                style={{ '--cc': c.color }}
                onClick={() => send({ t: 'pick', char: c.id })}
              >
                <div className="m-char-dot" style={{ background: c.color }} />
                <div className="m-char-name">{c.name}</div>
                <div className="m-char-role">{c.role}</div>
                {takenBy >= 0 && (
                  <span className="m-char-taken" style={{ background: SLOT_COLORS[takenBy] }}>
                    {SLOT_NAMES[takenBy]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {mine && (
          <div className="m-class-detail" style={{ '--cc': mine.color }}>
            <div className="m-detail-head">
              <h3>{mine.full}</h3>
              <span>{mine.aesthetic}</span>
            </div>
            <div className="m-detail-row">
              <b>✦ Ataque Básico:</b> {mine.basicAttack.name} — <em>{mine.basicAttack.desc}</em>
            </div>
            <div className="m-detail-row">
              <b>⚡ Definitiva:</b> {mine.powerName} — <em>{mine.powerDesc}</em>
            </div>
            <div className="m-detail-defs">
              {mine.defenses.map((d) => (
                <div key={d.id} className="m-def-pill">
                  <span className="m-def-name">{d.name}</span>
                  <span className="m-def-cost">{d.cost} Éter</span>
                  <p>{d.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isHost && lobby && (
        <div className="m-card">
          <div className="m-h">CONFIGURACIÓN DEL ANFITRIÓN</div>
          <div className="m-seg">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={lobby.cfg?.mode === m.id ? 'on' : ''}
                onClick={() => send({ t: 'cfg', cfg: { mode: m.id } })}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="m-seg">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={lobby.cfg?.diff === d.id ? 'on' : ''}
                onClick={() => send({ t: 'cfg', cfg: { diff: d.id } })}
              >
                {d.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="m-btn cyan wide big"
            onClick={() => send({ t: 'start' })}
          >
            ⚔ ¡INICIAR DEFENSA!
          </button>
        </div>
      )}
    </div>
  );
}

function StatusScreen({ title, text, spin, onClick }) {
  return (
    <div className="m-screen m-center" onClick={onClick}>
      <div className="m-logo">❖ {GAME_NAME}</div>
      {spin && <div className="m-spin" />}
      <h2>{title}</h2>
      <p className="m-sub">{text}</p>
    </div>
  );
}
