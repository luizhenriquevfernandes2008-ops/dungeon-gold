// ============================================================
// Aleatoriedade com semente (mulberry32).
// Mesma semente = mesma masmorra. Útil para reproduzir bugs.
// ============================================================

export function criarRng(semente) {
  let a = semente >>> 0;
  const rng = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  rng.float = (min, max) => rng() * (max - min) + min;
  rng.escolher = arr => arr[Math.floor(rng() * arr.length)];
  rng.chance = p => rng() < p;
  rng.embaralhar = arr => {
    const c = arr.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  };
  // Escolha ponderada: itens precisam ter .peso
  rng.ponderado = lista => {
    const total = lista.reduce((s, i) => s + (i.peso ?? 1), 0);
    let r = rng() * total;
    for (const it of lista) { r -= (it.peso ?? 1); if (r <= 0) return it; }
    return lista[lista.length - 1];
  };
  return rng;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sementeAleatoria = () => (Math.random() * 0xFFFFFFFF) >>> 0;
