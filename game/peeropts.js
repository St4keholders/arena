// Opciones del servidor de conexión (PeerJS). Por defecto usa el servidor público gratuito.
// Para pruebas locales se puede pasar ?peerhost=...&peerport=...&peerpath=...&peersecure=1
export function peerOptionsFromURL() {
  if (typeof window === 'undefined') return { debug: 0 };
  const q = new URLSearchParams(window.location.search);
  const o = { debug: 0 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || 9000);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

export function peerParamsString() {
  if (typeof window === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of ['peerhost', 'peerport', 'peerpath', 'peersecure']) {
    if (q.get(k)) keep.set(k, q.get(k));
  }
  const s = keep.toString();
  return s ? '&' + s : '';
}
