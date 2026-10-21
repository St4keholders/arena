// SHA-256 (usa crypto.subtle si existe; si no, una versión en JS)
function sha256js(ascii) {
  const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
  const maxWord = 2 ** 32;
  const words = [];
  const bytes = new TextEncoder().encode(ascii);
  const bitLen = bytes.length * 8;
  const hash = [], k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (candidate ** 0.5 * maxWord) | 0;
      k[primeCounter++] = (candidate ** (1 / 3) * maxWord) | 0;
    }
  }
  const arr = Array.from(bytes);
  arr.push(0x80);
  while (arr.length % 64 - 56) arr.push(0);
  for (let i = 0; i < arr.length; i++) words[i >> 2] |= arr[i] << ((3 - i) % 4) * 8;
  words[words.length] = (bitLen / maxWord) | 0;
  words[words.length] = bitLen;
  let H = hash.slice(0, 8);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const old = H;
    H = H.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = H[0], e = H[4];
      const temp1 = H[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
      H = [(temp1 + temp2) | 0].concat(H);
      H[4] = (H[4] + temp1) | 0;
      H.length = 8;
    }
    for (let i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export async function sha256(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* usar la versión JS */ }
  return sha256js(text);
}

export { sha256js };
