// ============================================================
// Configurações do jogador — persistidas em localStorage.
// ============================================================

const CHAVE = 'dungeongold.settings.v1';

const PADRAO = {
  master: 70,
  music: 55,
  sfx: 80,
  quality: 'med',      // low | med | high
  brilho: 115,         // 60..220 — 100 = neutro; acima disso levanta as sombras
  dither: true,
  scanlines: true,
  flicker: true,
  fov: 82,
  sens: 100,
  bob: true,
};

export const Settings = {
  data: { ...PADRAO },
  ouvintes: [],

  carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) Object.assign(this.data, JSON.parse(bruto));
    } catch (e) {
      console.warn('[settings] não consegui ler o localStorage:', e);
    }
    return this.data;
  },

  salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[settings] não consegui salvar:', e);
    }
  },

  set(chave, valor) {
    this.data[chave] = valor;
    this.salvar();
    this.ouvintes.forEach(fn => fn(chave, valor, this.data));
  },

  aoMudar(fn) { this.ouvintes.push(fn); },

  restaurar() {
    Object.assign(this.data, PADRAO);
    this.salvar();
    this.ouvintes.forEach(fn => fn('*', null, this.data));
  },
};

// Largura interna de renderização por nível de qualidade.
export const LARGURA_QUALIDADE = { low: 256, med: 384, high: 512 };
