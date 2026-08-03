// ============================================================
// Sprites — pixel art montada com retângulos alinhados à grade.
// Cada criatura é uma lista de formas; formas marcadas com `m`
// são espelhadas no eixo vertical, o que garante simetria
// perfeita e me deixa desenhar só metade do bicho.
// As variantes procedurais recolorem as chaves de paleta,
// então "esqueleto flamejante" e "esqueleto congelado" são o
// mesmo desenho com paletas diferentes — como nos jogos da época.
// ============================================================

import * as THREE from 'three';
import { novoCanvas } from './textures.js';

// ---------- motor de desenho ----------
function pintar(x, ops, cores, W) {
  for (const op of ops) {
    const cor = cores[op.c] ?? op.c;
    if (!cor || cor === 'none') continue;
    x.fillStyle = cor;
    const [rx, ry, rw, rh] = op.r || op.m;
    x.fillRect(rx, ry, rw, rh);
    if (op.m) x.fillRect(W - rx - rw, ry, rw, rh);
  }
}

function texturaDe(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- paletas base por arquétipo ----------
export const PALETAS = {
  esqueleto: { o: '#141210', a: '#D9CFB8', b: '#A2977E', c: '#4A4438', d: '#2E2A22', e: '#FF7A28', g: '#7A6A50' },
  goblin:    { o: '#101A10', a: '#6E9A3E', b: '#4E7028', c: '#7A4A22', d: '#4A2C14', e: '#FFD23A', g: '#B0A08A' },
  cavaleiro: { o: '#0E0E12', a: '#6E7480', b: '#4A5058', c: '#7A1E1E', d: '#4E1212', e: '#FF3A28', g: '#E3B23C' },
  morcego:   { o: '#0E0A10', a: '#4A3450', b: '#2E1E36', c: '#6A4A70', d: '#3A2842', e: '#FF4A6A', g: '#8A6A90' },
  limo:      { o: '#0A1410', a: '#3EA07A', b: '#2A6E56', c: '#7AE0B0', d: '#1E4E3E', e: '#EAFFF4', g: '#3EA07A' },
};

// Afixos: repintam a paleta e ganham nome no HUD.
// Os afixos vivem em data/enemies.json — este array é preenchido no
// boot por definirAfixos(). Ficam em dados justamente para poderem ser
// editados e balanceados sem mexer em código.
export const AFIXOS = [];

export function definirAfixos(lista) {
  AFIXOS.length = 0;
  for (const a of lista || []) {
    // a luz vem como texto no JSON ('0xFF7A28' ou '#FF7A28')
    const luz = typeof a.luz === 'string' ? parseInt(a.luz.replace('#', '0x'), 16) : a.luz;
    AFIXOS.push({ ...a, luz: Number.isFinite(luz) ? luz : null });
  }
  if (!AFIXOS.length) AFIXOS.push({ id: 'nenhum', nome: '', peso: 1, tinta: null, luz: null });
}

export function aplicarAfixo(paleta, afixo) {
  const p = { ...paleta };
  if (afixo && afixo.tinta) Object.assign(p, afixo.tinta);
  return p;
}

// ---------- formas ----------
// Humanoide alto: 20x28
function formasEsqueleto(pose) {
  const perna = pose === 'andar1' ? 1 : 0;
  const braco = pose === 'atacar' ? -4 : 0;
  return [
    { m: [3 , 10 + braco, 3, 9], c: 'o' },      // contorno braços
    { m: [6 , 1 , 8, 9 ], c: 'o' },             // contorno crânio
    { m: [5 , 10, 10, 9], c: 'o' },             // contorno tronco
    { m: [6 , 20, 4, 8 ], c: 'o' },             // contorno pernas
    { r: [7 , 2 , 6, 7 ], c: 'a' },             // crânio
    { m: [7 , 4 , 2, 2 ], c: 'e' },             // olhos acesos
    { r: [9 , 6 , 2, 2 ], c: 'o' },             // nariz
    { m: [8 , 8 , 1, 1 ], c: 'o' },             // dentes
    { r: [6 , 10, 8, 8 ], c: 'a' },             // caixa torácica
    { r: [7 , 11, 6, 1 ], c: 'b' },
    { r: [7 , 13, 6, 1 ], c: 'b' },
    { r: [7 , 15, 6, 1 ], c: 'b' },
    { r: [9 , 10, 2, 8 ], c: 'b' },             // coluna
    { r: [7 , 18, 6, 2 ], c: 'a' },             // bacia
    { m: [4 , 10 + braco, 2, 8], c: 'a' },      // braços
    { m: [3 , 17 + braco, 3, 2], c: 'a' },      // mãos
    { m: [7 , 20 + perna, 2, 6], c: 'a' },      // pernas
    { m: [6 , 26, 4, 2 ], c: 'o' },             // pés
  ];
}

function formasGoblin(pose) {
  const perna = pose === 'andar1' ? 1 : 0;
  const braco = pose === 'atacar' ? -5 : 0;
  return [
    { m: [1 , 4 , 5, 4 ], c: 'o' },             // orelhas
    { m: [2 , 5 , 4, 2 ], c: 'a' },
    { m: [5 , 2 , 10, 10], c: 'o' },            // cabeça
    { r: [6 , 3 , 8, 8 ], c: 'a' },
    { m: [6 , 5 , 3, 2 ], c: 'e' },             // olhos
    { m: [7 , 6 , 1, 1 ], c: 'o' },
    { r: [8 , 8 , 4, 1 ], c: 'b' },             // boca
    { m: [8 , 9 , 1, 1 ], c: '#E8E0C8' },       // presas
    { m: [4 , 11, 12, 9], c: 'o' },             // torso
    { r: [5 , 12, 10, 7], c: 'c' },             // trapo
    { r: [6 , 13, 8, 2 ], c: 'd' },
    { m: [3 , 12 + braco, 3, 8], c: 'o' },      // braços
    { m: [4 , 13 + braco, 2, 6], c: 'a' },
    { m: [6 , 19 + perna, 3, 7], c: 'o' },      // pernas
    { m: [7 , 20 + perna, 2, 5], c: 'a' },
    { m: [5 , 25, 5, 3 ], c: 'd' },             // pés
  ];
}

function formasCavaleiro(pose) {
  const perna = pose === 'andar1' ? 1 : 0;
  const braco = pose === 'atacar' ? -5 : 0;
  return [
    { m: [5 , 1 , 10, 10], c: 'o' },            // elmo
    { r: [6 , 2 , 8, 8 ], c: 'a' },
    { r: [6 , 3 , 8, 1 ], c: 'b' },
    { r: [7 , 5 , 6, 2 ], c: 'o' },             // visor
    { m: [7 , 5 , 2, 2 ], c: 'e' },             // brasa nos olhos
    { r: [9 , 0 , 2, 3 ], c: 'g' },             // crista dourada
    { m: [3 , 10, 14, 11], c: 'o' },            // armadura
    { r: [4 , 11, 12, 9 ], c: 'a' },
    { r: [4 , 11, 12, 1 ], c: 'b' },
    { r: [7 , 12, 6, 7 ], c: 'c' },             // sobreveste
    { r: [9 , 12, 2, 7 ], c: 'g' },             // faixa de ouro
    { m: [2 , 11 + braco, 3, 9], c: 'o' },      // braços
    { m: [3 , 12 + braco, 2, 7], c: 'a' },
    { m: [5 , 20 + perna, 4, 7], c: 'o' },      // pernas
    { m: [6 , 21 + perna, 2, 5], c: 'a' },
    { m: [4 , 26, 5, 2 ], c: 'b' },             // botas
  ];
}

function formasMorcego(pose) {
  const asa = pose === 'andar1' || pose === 'atacar' ? 1 : 0;
  const ay = asa ? 2 : 6;
  const ah = asa ? 9 : 4;
  return [
    { m: [0 , ay, 7, ah], c: 'o' },             // asas
    { m: [1 , ay + 1, 5, ah - 2], c: 'c' },
    { m: [2 , ay + 2, 3, ah - 4], c: 'd' },
    { r: [6 , 6 , 8, 9 ], c: 'o' },             // corpo
    { r: [7 , 7 , 6, 7 ], c: 'a' },
    { m: [7 , 8 , 2, 2 ], c: 'e' },             // olhos
    { m: [6 , 4 , 2, 3 ], c: 'o' },             // orelhas
    { r: [8 , 12, 4, 1 ], c: 'b' },
    { m: [8 , 13, 1, 2 ], c: '#E8E0C8' },       // presas
  ];
}

function formasLimo(pose) {
  const achata = pose === 'andar1' ? 2 : 0;
  const t = pose === 'atacar' ? -2 : 0;
  return [
    { r: [2 , 12 + achata + t, 16, 14 - achata], c: 'o' },
    { r: [3 , 13 + achata + t, 14, 12 - achata], c: 'a' },
    { r: [4 , 14 + achata + t, 12, 4 ], c: 'c' },       // brilho no topo
    { r: [5 , 15 + achata + t, 5 , 2 ], c: '#FFFFFF' },
    { m: [5 , 18 + achata + t, 3, 3 ], c: 'e' },        // olhos
    { m: [6 , 19 + achata + t, 1, 1 ], c: 'o' },
    { r: [4 , 23 + t, 12, 3 ], c: 'b' },
    { m: [3 , 25 + t, 3, 2 ], c: 'd' },
  ];
}

const FORMAS = {
  esqueleto: formasEsqueleto,
  goblin: formasGoblin,
  cavaleiro: formasCavaleiro,
  morcego: formasMorcego,
  limo: formasLimo,
};

// ---------- arma na mão do inimigo ----------
function armaInimigo(x, arquetipo, cores, pose, W) {
  const sobe = pose === 'atacar' ? -5 : 0;
  if (arquetipo === 'esqueleto') {                 // espada quebrada
    x.fillStyle = cores.g;
    x.fillRect(2, 12 + sobe, 2, 8);
    x.fillStyle = '#9AA0A8';
    for (let i = 0; i < 9; i++) x.fillRect(2 - Math.floor(i / 3), 11 + sobe - i, 2, 1);
  } else if (arquetipo === 'goblin') {             // porrete
    x.fillStyle = '#5A3A1E';
    x.fillRect(1, 10 + sobe, 3, 9);
    x.fillStyle = '#7A5028';
    x.fillRect(0, 7 + sobe, 5, 5);
    x.fillStyle = '#3A2410';
    x.fillRect(1, 8 + sobe, 1, 1); x.fillRect(3, 10 + sobe, 1, 1);
  } else if (arquetipo === 'cavaleiro') {          // espadão + escudo
    x.fillStyle = cores.g;
    x.fillRect(0, 12 + sobe, 5, 2);
    x.fillStyle = '#B8BEC8';
    for (let i = 0; i < 13; i++) x.fillRect(1, 11 + sobe - i, 3, 1);
    x.fillStyle = '#EAEFF6';
    for (let i = 0; i < 13; i++) x.fillRect(1, 11 + sobe - i, 1, 1);
    x.fillStyle = cores.o;                          // escudo do outro lado
    x.fillRect(W - 6, 12, 6, 10);
    x.fillStyle = cores.c;
    x.fillRect(W - 5, 13, 4, 8);
    x.fillStyle = cores.g;
    x.fillRect(W - 4, 15, 2, 4);
  }
}

// ---------- montagem dos quadros ----------
const TAM_SPRITE = { esqueleto: [20, 28], goblin: [20, 28], cavaleiro: [20, 28], morcego: [20, 20], limo: [20, 28] };

export function gerarQuadrosInimigo(arquetipo, cores) {
  const [W, H] = TAM_SPRITE[arquetipo] || [20, 28];
  const poses = ['andar0', 'andar1', 'atacar'];
  const quadros = {};
  for (const pose of poses) {
    const { c, x } = novoCanvas(W, H);
    const formas = (FORMAS[arquetipo] || formasEsqueleto)(pose);
    pintar(x, formas, cores, W);
    armaInimigo(x, arquetipo, cores, pose, W);
    quadros[pose] = texturaDe(c);
  }
  quadros.largura = W;
  quadros.altura = H;
  return quadros;
}

// ---------- itens ----------
const ITENS_ARTE = {
  pocao: [
    { r: [5, 1, 4, 2], c: '#8A7050' },
    { r: [6, 3, 2, 2], c: '#C8B090' },
    { r: [3, 5, 8, 8], c: '#1A1410' },
    { r: [4, 6, 6, 6], c: '#B02030' },
    { r: [4, 6, 6, 2], c: '#E04858' },
    { r: [5, 7, 2, 1], c: '#FF98A8' },
  ],
  ouro: [
    { r: [3, 4, 8, 6], c: '#8A6A1E' },
    { r: [4, 3, 6, 7], c: '#E3B23C' },
    { r: [5, 4, 4, 2], c: '#FFE28A' },
    { r: [6, 6, 2, 2], c: '#8A6A1E' },
  ],
  escudo: [
    { r: [2, 2, 10, 8], c: '#2A2622' },
    { r: [3, 3, 8, 7], c: '#6E7480' },
    { r: [4, 4, 6, 3], c: '#8A909C' },
    { r: [5, 5, 4, 4], c: '#E3B23C' },
    { r: [4, 10, 6, 2], c: '#2A2622' },
  ],
  chave: [
    { r: [2, 4, 5, 5], c: '#E3B23C' },
    { r: [3, 5, 3, 3], c: '#1A1410' },
    { r: [7, 6, 6, 2], c: '#E3B23C' },
    { r: [11, 8, 2, 2], c: '#E3B23C' },
    { r: [9, 8, 1, 2], c: '#E3B23C' },
  ],
  reliquia: [
    { r: [5, 1, 3, 3], c: '#7AC8FF' },
    { r: [3, 4, 7, 6], c: '#3A66A8' },
    { r: [4, 5, 5, 4], c: '#7AC8FF' },
    { r: [5, 6, 3, 2], c: '#EAF6FF' },
    { r: [4, 10, 5, 2], c: '#E3B23C' },
  ],
  coracao: [
    { m: [3, 3, 3, 3], c: '#8E1B1B' },
    { r: [3, 5, 7, 3], c: '#B02030' },
    { r: [4, 8, 5, 2], c: '#8E1B1B' },
    { r: [5, 10, 3, 1], c: '#6A1212' },
    { r: [4, 4, 2, 2], c: '#E04858' },
  ],
  espada: [
    { r: [6, 1, 2, 8], c: '#C8CED8' },
    { r: [6, 1, 1, 8], c: '#EAEFF6' },
    { r: [4, 9, 6, 1], c: '#E3B23C' },
    { r: [6, 10, 2, 3], c: '#5A3A1E' },
  ],
};

export function gerarSpriteItem(tipo) {
  const { c, x } = novoCanvas(14, 14);
  pintar(x, ITENS_ARTE[tipo] || ITENS_ARTE.reliquia, {}, 14);
  return texturaDe(c);
}

// Chave: anel vazado em cima, haste e dois dentes. Desenhada com a cor
// da fechadura que ela abre, para a leitura ser imediata.
export function gerarSpriteChave(corHex = '#E3B23C') {
  const { c, x } = novoCanvas(14, 14);
  const escuro = misturar(corHex, '#1A1208', 0.42);
  const claro = misturar(corHex, '#FFFFFF', 0.45);
  x.fillStyle = escuro;
  x.fillRect(3, 1, 6, 6);            // anel (fundo)
  x.fillStyle = corHex;
  x.fillRect(4, 2, 4, 4);
  x.clearRect(5, 3, 2, 2);           // furo do anel
  x.fillRect(5, 7, 2, 6);            // haste
  x.fillRect(7, 9, 3, 2);            // dente de cima
  x.fillRect(7, 12, 2, 1);           // dente de baixo
  x.fillStyle = claro;
  x.fillRect(4, 2, 4, 1);            // brilho no topo do anel
  x.fillRect(5, 7, 1, 5);            // brilho na haste
  return texturaDe(c);
}

function misturar(a, b, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (u, v) => Math.round(u + (v - u) * t).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

// ---------- espada em primeira pessoa ----------
// Lâmina diagonal montada em degraus de 1px: é assim que
// sprite de espada era feita, e é o que evita o look "vetorial".
export function gerarEspadaJogador(corLamina = '#D8DEE8', corPunho = '#E3B23C') {
  const W = 96, H = 72;
  const { c, x } = novoCanvas(W, H);

  // braço/luva
  x.fillStyle = '#2A2420'; x.fillRect(52, 52, 22, 20);
  x.fillStyle = '#4A4038'; x.fillRect(54, 54, 18, 16);
  x.fillStyle = '#6A5A48'; x.fillRect(54, 54, 18, 3);
  x.fillStyle = '#2A2420'; x.fillRect(58, 58, 4, 4); x.fillRect(64, 58, 4, 4);

  // punho
  x.fillStyle = '#5A3A1E'; x.fillRect(56, 44, 10, 12);
  x.fillStyle = '#7A5028'; x.fillRect(56, 44, 3, 12);
  // guarda
  x.fillStyle = corPunho; x.fillRect(46, 40, 30, 5);
  x.fillStyle = '#FFE28A'; x.fillRect(46, 40, 30, 1);
  x.fillStyle = '#8A6A1E'; x.fillRect(46, 44, 30, 1);
  // pomo
  x.fillStyle = corPunho; x.fillRect(58, 56, 6, 4);

  // lâmina em degraus subindo à esquerda
  const passos = 40;
  for (let i = 0; i < passos; i++) {
    const px = 58 - Math.floor(i * 0.9);
    const py = 39 - i;
    const larg = Math.max(3, 10 - Math.floor(i / 8));
    x.fillStyle = corLamina;
    x.fillRect(px - (larg >> 1), py, larg, 1);
    x.fillStyle = '#FFFFFF';
    x.fillRect(px - (larg >> 1), py, 1, 1);      // fio brilhante
    x.fillStyle = '#7A8290';
    x.fillRect(px + (larg >> 1) - 1, py, 1, 1);  // sombra do dorso
  }
  // ponta
  x.fillStyle = corLamina; x.fillRect(22, -1 + 40 - passos + 1, 3, 2);

  return texturaDe(c);
}

// ---------- risco do golpe ----------
export function gerarRisco() {
  const W = 128, H = 96;
  const { c, x } = novoCanvas(W, H);
  for (let faixa = 0; faixa < 3; faixa++) {
    const alpha = [0.9, 0.55, 0.25][faixa];
    const esp = [3, 2, 1][faixa];
    x.fillStyle = `rgba(255,240,200,${alpha})`;
    for (let i = 0; i < 110; i++) {
      const t = i / 110;
      const ang = -0.5 + t * 2.2;
      const raio = 52 + faixa * 7;
      const px = Math.round(20 + Math.cos(ang) * raio);
      const py = Math.round(84 - Math.sin(ang) * raio);
      if (px >= 0 && px < W && py >= 0 && py < H) x.fillRect(px, py, esp, esp);
    }
  }
  return texturaDe(c);
}

// ---------- escudo em primeira pessoa ----------
export function gerarEscudoJogador() {
  const W = 96, H = 96;
  const { c, x } = novoCanvas(W, H);
  x.fillStyle = '#1A1612'; x.fillRect(10, 10, 76, 80);
  x.fillStyle = '#4A4038'; x.fillRect(13, 13, 70, 74);
  x.fillStyle = '#6A5C4A'; x.fillRect(13, 13, 70, 4);
  x.fillStyle = '#2E2820'; x.fillRect(13, 83, 70, 4);
  // travessas de ferro
  x.fillStyle = '#2A2622';
  x.fillRect(13, 34, 70, 6); x.fillRect(13, 60, 70, 6);
  // brasão em ouro
  x.fillStyle = '#E3B23C';
  x.fillRect(40, 26, 16, 44); x.fillRect(28, 40, 40, 16);
  x.fillStyle = '#FFE28A';
  x.fillRect(40, 26, 16, 3); x.fillRect(28, 40, 40, 3);
  x.fillStyle = '#8A6A1E';
  x.fillRect(40, 67, 16, 3); x.fillRect(28, 53, 40, 3);
  return texturaDe(c);
}

// ---------- lança ----------
// Silhueta que precisa dizer ALCANCE antes de qualquer número: haste
// longuíssima atravessando o quadro na diagonal e uma ponta pequena.
// Se a ponta fosse grande, leria como espada.
export function gerarLanca() {
  const W = 112, H = 96;
  const { c, x } = novoCanvas(W, H);
  const ACO = '#C6CDD8', ACO_ALTO = '#FFFFFF', ACO_BAIXO = '#6E7684';
  const HASTE = '#6A4526', HASTE_ALTA = '#8E6034', HASTE_BAIXA = '#42290F';

  // mão embaixo, na base da haste
  x.fillStyle = '#2A2420'; x.fillRect(76, 70, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(78, 72, 18, 18);
  x.fillStyle = '#6A5A48'; x.fillRect(78, 72, 18, 3);
  x.fillStyle = '#2A2420'; x.fillRect(82, 78, 4, 6); x.fillRect(88, 78, 4, 6);

  // haste em degraus de 1px subindo à esquerda
  const passos = 70;
  for (let i = 0; i < passos; i++) {
    const px = 84 - Math.floor(i * 0.86);
    const py = 78 - i;
    x.fillStyle = HASTE_BAIXA; x.fillRect(px - 3, py, 7, 1);
    x.fillStyle = HASTE;       x.fillRect(px - 2, py, 5, 1);
    x.fillStyle = HASTE_ALTA;  x.fillRect(px - 2, py, 1, 1);
    // anéis de reforço a cada 12 degraus
    if (i % 12 === 6) { x.fillStyle = '#B08A3A'; x.fillRect(px - 3, py, 7, 1); }
  }

  // colar de metal onde a ponta encaixa
  x.fillStyle = ACO_BAIXO; x.fillRect(24, 20, 9, 5);
  x.fillStyle = ACO;       x.fillRect(24, 20, 9, 3);

  // ponta em folha: cresce e afina
  for (let i = 0; i < 20; i++) {
    const py = 20 - i;
    const larg = i < 8 ? 3 + i : Math.max(1, 11 - (i - 8) * 1.1) | 0;
    const px = 28 - Math.floor(i * 0.86);
    x.fillStyle = ACO;       x.fillRect(px - (larg >> 1), py, larg, 1);
    x.fillStyle = ACO_ALTO;  x.fillRect(px - (larg >> 1), py, 1, 1);
    x.fillStyle = ACO_BAIXO; x.fillRect(px + (larg >> 1) - 1, py, 1, 1);
  }
  return texturaDe(c);
}

// ---------- martelo de guerra ----------
// O oposto da lança: cabo curto e uma cabeça de bloco gigante. A massa
// tem que estar toda lá em cima, senão não lê como algo que é pesado
// de erguer — e é o peso que justifica a lentidão.
export function gerarMartelo() {
  const W = 118, H = 100;
  const { c, x } = novoCanvas(W, H);
  const FERRO = '#5A616C', FERRO_ALTO = '#98A0AC', FERRO_BAIXO = '#333942';
  const CABO = '#4A3018', CABO_ALTO = '#6E4824';

  x.fillStyle = '#2A2420'; x.fillRect(72, 74, 24, 24);
  x.fillStyle = '#4A4038'; x.fillRect(74, 76, 20, 20);
  x.fillStyle = '#2A2420'; x.fillRect(78, 82, 4, 7); x.fillRect(85, 82, 4, 7);
  x.fillStyle = '#2A2420'; x.fillRect(60, 56, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(62, 58, 18, 18);

  // cabo curto e grosso
  for (let i = 0; i < 42; i++) {
    const px = 80 - Math.floor(i * 0.78);
    const py = 80 - i;
    x.fillStyle = CABO;      x.fillRect(px - 4, py, 9, 1);
    x.fillStyle = CABO_ALTO; x.fillRect(px - 4, py, 2, 1);
    if (i % 5 === 0) { x.fillStyle = '#2E1C0C'; x.fillRect(px - 4, py, 9, 1); }
  }

  // gola de ferro onde o cabo entra na cabeça
  x.fillStyle = FERRO_BAIXO; x.fillRect(40, 40, 22, 9);
  x.fillStyle = FERRO;       x.fillRect(41, 41, 20, 7);
  x.fillStyle = FERRO_ALTO;  x.fillRect(41, 41, 20, 2);

  // Cabeça. Antes era um retângulo largo e chapado, e lia como caixa,
  // não como ferro. O que resolve é o contorno NÃO ser reto: a cabeça
  // agora afina para trás, tem a face de percussão saliente na frente e
  // um bico atrás, então a silhueta sozinha já diz "martelo".
  for (let i = 0; i < 40; i++) {
    const py = 6 + i;
    // frente reta, traseira em barriga: mais larga no meio da cabeça
    const barriga = Math.round(Math.sin((i / 39) * Math.PI) * 5);
    const x0 = 20, x1 = 62 + barriga;
    x.fillStyle = FERRO; x.fillRect(x0, py, x1 - x0, 1);
    // chanfro de cima e de baixo
    if (i < 4 || i > 35) { x.fillStyle = FERRO_BAIXO; x.fillRect(x0, py, x1 - x0, 1); }
    x.fillStyle = i < 6 ? FERRO_ALTO : FERRO_BAIXO;
    x.fillRect(x0, py, 2, 1);
    x.fillStyle = FERRO_BAIXO; x.fillRect(x1 - 2, py, 2, 1);
  }
  // brilho corrido no alto da cabeça
  x.fillStyle = FERRO_ALTO; x.fillRect(22, 8, 38, 3);

  // face de percussão: placa saliente, mais clara, gasta nas quinas
  x.fillStyle = FERRO_BAIXO; x.fillRect(12, 10, 9, 32);
  x.fillStyle = '#7E858F';   x.fillRect(13, 12, 7, 28);
  x.fillStyle = '#A8B0BC';   x.fillRect(13, 12, 7, 3);
  x.fillStyle = '#2A2F36';
  for (const [mx, my] of [[14, 18], [17, 24], [13, 31], [16, 36]]) x.fillRect(mx, my, 2, 2);

  // cintas de reforço atravessando a cabeça
  for (const bx of [30, 50]) {
    x.fillStyle = FERRO_BAIXO; x.fillRect(bx, 6, 4, 40);
    x.fillStyle = '#6E7681';   x.fillRect(bx, 6, 2, 40);
    x.fillStyle = '#232830';   x.fillRect(bx + 1, 14, 2, 2); x.fillRect(bx + 1, 34, 2, 2);
  }

  // bico traseiro: cunha que sai da barriga e termina em ponta
  for (let i = 0; i < 16; i++) {
    const alt = Math.max(1, 16 - i);
    x.fillStyle = i < 3 ? FERRO_ALTO : FERRO;
    x.fillRect(66 + i, 18 + (i >> 1), 1, alt);
    x.fillStyle = FERRO_BAIXO;
    x.fillRect(66 + i, 18 + (i >> 1) + alt - 1, 1, 1);
  }

  return texturaDe(c);
}

// ---------- arco ----------
// Desenhado JÁ RETESADO: o arco parado seria só uma curva, e a corda
// puxada é o que comunica que a coisa está carregada e prestes a sair.
export function gerarArco() {
  const W = 112, H = 104;
  const { c, x } = novoCanvas(W, H);
  const MADEIRA = '#6E4A22', MADEIRA_ALTA = '#9A6C32', MADEIRA_BAIXA = '#412812';
  const CORDA = '#D8CBB0', PENA = '#C4322A';

  // braço do arco: arco de círculo em degraus de 1px
  for (let i = 0; i <= 84; i++) {
    const t = i / 84;
    const ang = -1.32 + t * 2.64;
    const px = Math.round(20 + Math.cos(ang) * 40);
    const py = Math.round(52 + Math.sin(ang) * 46);
    x.fillStyle = MADEIRA_BAIXA; x.fillRect(px - 2, py, 6, 1);
    x.fillStyle = MADEIRA;       x.fillRect(px - 1, py, 4, 1);
    x.fillStyle = MADEIRA_ALTA;  x.fillRect(px - 1, py, 1, 1);
    // empunhadura enrolada no meio
    if (i > 34 && i < 50) { x.fillStyle = '#3A2A18'; x.fillRect(px - 2, py, 6, 1); }
  }

  // corda: das duas pontas até o ponto de puxada
  const pontaA = [Math.round(20 + Math.cos(-1.32) * 40), Math.round(52 + Math.sin(-1.32) * 46)];
  const pontaB = [Math.round(20 + Math.cos(1.32) * 40), Math.round(52 + Math.sin(1.32) * 46)];
  const puxada = [72, 52];
  for (const p of [pontaA, pontaB]) {
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const px = Math.round(p[0] + (puxada[0] - p[0]) * (i / n));
      const py = Math.round(p[1] + (puxada[1] - p[1]) * (i / n));
      x.fillStyle = CORDA; x.fillRect(px, py, 1, 1);
    }
  }

  // flecha encaixada, apontando para a esquerda
  x.fillStyle = '#7A5A34'; x.fillRect(16, 51, 58, 2);
  x.fillStyle = '#A0784A'; x.fillRect(16, 51, 58, 1);
  // ponta
  x.fillStyle = '#C6CDD8'; x.fillRect(10, 50, 7, 4);
  x.fillStyle = '#FFFFFF'; x.fillRect(10, 50, 3, 1);
  // penas
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? PENA : '#8A2018';
    x.fillRect(68 + i, 48 + (i >> 2), 1, 3 + (i >> 1));
    x.fillRect(68 + i, 53 - (i >> 2), 1, 3 + (i >> 1));
  }

  // mão que puxa a corda
  x.fillStyle = '#2A2420'; x.fillRect(72, 44, 20, 20);
  x.fillStyle = '#4A4038'; x.fillRect(74, 46, 16, 16);
  x.fillStyle = '#6A5A48'; x.fillRect(74, 46, 16, 3);
  x.fillStyle = '#2A2420'; x.fillRect(78, 52, 3, 7); x.fillRect(83, 52, 3, 7);

  return texturaDe(c);
}

// ============================================================
// ARMAS DE RUN — achadas no chão, nunca no menu.
// Cada uma precisa ser reconhecível pela SILHUETA sozinha, porque
// você vai trocar de arma no meio de uma briga e não vai ter tempo
// de ler nada.
// ============================================================

// Foice: haste longa e uma lua deitada na ponta. A curva é o que
// diz "isto varre" antes de qualquer número.
export function gerarFoice() {
  const W = 120, H = 104;
  const { c, x } = novoCanvas(W, H);
  const ACO = '#B9C2CE', ALTO = '#FFFFFF', BAIXO = '#65707E';
  const HASTE = '#4A3418', HASTE_ALTA = '#6E4E26';

  x.fillStyle = '#2A2420'; x.fillRect(78, 74, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(80, 76, 18, 18);
  x.fillStyle = '#2A2420'; x.fillRect(84, 82, 4, 6); x.fillRect(90, 82, 4, 6);
  x.fillStyle = '#2A2420'; x.fillRect(66, 56, 20, 20);
  x.fillStyle = '#4A4038'; x.fillRect(68, 58, 16, 16);

  for (let i = 0; i < 62; i++) {
    const px = 88 - Math.floor(i * 0.82), py = 80 - i;
    x.fillStyle = HASTE;      x.fillRect(px - 2, py, 5, 1);
    x.fillStyle = HASTE_ALTA; x.fillRect(px - 2, py, 1, 1);
    if (i % 11 === 5) { x.fillStyle = '#B08A3A'; x.fillRect(px - 2, py, 5, 1); }
  }

  // lâmina: arco que abre para a esquerda e afina na ponta
  for (let i = 0; i < 54; i++) {
    const t = i / 53, ang = -0.35 + t * 2.15;
    const px = Math.round(40 + Math.cos(ang) * 30);
    const py = Math.round(30 + Math.sin(ang) * 24);
    const esp = i < 40 ? 4 - Math.floor(i / 18) : 1;
    x.fillStyle = BAIXO; x.fillRect(px, py, esp + 1, esp + 1);
    x.fillStyle = ACO;   x.fillRect(px, py, esp, esp);
    if (i % 3 === 0) { x.fillStyle = ALTO; x.fillRect(px, py, 1, 1); }
  }
  x.fillStyle = '#8A6A1E'; x.fillRect(60, 24, 10, 7);
  x.fillStyle = '#E3B23C'; x.fillRect(61, 25, 8, 4);
  return texturaDe(c);
}

// Adagas duplas: duas lâminas curtas, uma em cada mão, cruzadas.
// A assimetria é proposital — simetria perfeita leria como uma peça só.
export function gerarAdagas() {
  const W = 118, H = 90;
  const { c, x } = novoCanvas(W, H);
  const ACO = '#D2D8E2', ALTO = '#FFFFFF', BAIXO = '#78808E';

  const lamina = (bx, by, dir, comp) => {
    x.fillStyle = '#2A2420'; x.fillRect(bx - 4, by, 14, 16);
    x.fillStyle = '#4A4038'; x.fillRect(bx - 2, by + 2, 10, 12);
    x.fillStyle = '#8A6A1E'; x.fillRect(bx - 6, by - 4, 18, 4);
    x.fillStyle = '#E3B23C'; x.fillRect(bx - 6, by - 4, 18, 2);
    for (let i = 0; i < comp; i++) {
      const px = bx + 2 + Math.round(i * 0.55) * dir, py = by - 5 - i;
      const larg = Math.max(2, 7 - Math.floor(i / 7));
      x.fillStyle = BAIXO; x.fillRect(px - (larg >> 1), py, larg, 1);
      x.fillStyle = ACO;   x.fillRect(px - (larg >> 1) + 1, py, larg - 1, 1);
      x.fillStyle = ALTO;  x.fillRect(px - (larg >> 1), py, 1, 1);
    }
  };
  lamina(24, 64, -1, 34);
  lamina(88, 72, 1, 30);
  return texturaDe(c);
}

// Besta: arco DEITADO na horizontal sobre uma coronha. É o eixo
// horizontal que a separa do arco longo à primeira vista.
export function gerarBesta() {
  const W = 124, H = 92;
  const { c, x } = novoCanvas(W, H);
  const MADEIRA = '#6A4622', MADEIRA_ALTA = '#8E6230', FERRO = '#7A828E';

  x.fillStyle = '#2A2420'; x.fillRect(76, 56, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(78, 58, 18, 18);
  x.fillStyle = '#2A2420'; x.fillRect(82, 64, 4, 7); x.fillRect(88, 64, 4, 7);

  // coronha
  x.fillStyle = '#3A2412'; x.fillRect(58, 44, 56, 14);
  x.fillStyle = MADEIRA;   x.fillRect(59, 45, 54, 11);
  x.fillStyle = MADEIRA_ALTA; x.fillRect(59, 45, 54, 3);
  x.fillStyle = '#2A1A0C'; x.fillRect(96, 50, 18, 16);

  // calha e virote
  x.fillStyle = '#2A1A0C'; x.fillRect(14, 47, 60, 5);
  x.fillStyle = '#8A6A44'; x.fillRect(16, 48, 52, 2);
  x.fillStyle = '#C6CDD8'; x.fillRect(8, 46, 9, 4);
  x.fillStyle = '#FFFFFF'; x.fillRect(8, 46, 4, 1);

  // braços do arco, na vertical
  for (let s = 0; s < 30; s++) {
    const px = 30 + Math.round(s * 0.30), off = s;
    x.fillStyle = s < 22 ? FERRO : '#5A626E';
    x.fillRect(px, 46 - off, 4, 2);
    x.fillRect(px, 46 + off, 4, 2);
  }
  // corda
  x.fillStyle = '#D8CBB0';
  for (let i = 0; i <= 30; i++) {
    x.fillRect(39 + Math.round(i * 0.5), 17 + i, 1, 1);
    x.fillRect(39 + Math.round(i * 0.5), 75 - i, 1, 1);
  }
  x.fillStyle = FERRO; x.fillRect(54, 44, 8, 14);
  return texturaDe(c);
}

// Chicote de ferro: elos soltos que serpenteiam. Nenhuma linha reta —
// é isso que separa "chicote" de "corrente pendurada".
export function gerarChicote() {
  const W = 126, H = 100;
  const { c, x } = novoCanvas(W, H);
  x.fillStyle = '#2A2420'; x.fillRect(86, 70, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(88, 72, 18, 18);
  x.fillStyle = '#2A2420'; x.fillRect(92, 78, 4, 7); x.fillRect(98, 78, 4, 7);

  x.fillStyle = '#3A2A18'; x.fillRect(84, 58, 12, 18);
  x.fillStyle = '#5A422A'; x.fillRect(85, 59, 10, 15);
  x.fillStyle = '#E3B23C'; x.fillRect(84, 56, 12, 3);

  // elos: senoide que abre conforme se afasta da mão
  for (let i = 0; i < 34; i++) {
    const t = i / 33;
    const px = Math.round(84 - t * 74);
    const py = Math.round(58 - t * 26 + Math.sin(t * 7.5) * (6 + t * 12));
    const s = Math.max(2, 5 - Math.floor(t * 2));
    x.fillStyle = '#39414C'; x.fillRect(px, py, s + 1, s + 1);
    x.fillStyle = i % 2 ? '#8A939F' : '#6A727E'; x.fillRect(px, py, s, s);
    x.fillStyle = '#C2CAD6'; x.fillRect(px, py, 1, 1);
  }
  // farpa na ponta
  x.fillStyle = '#C6CDD8'; x.fillRect(8, 26, 7, 3); x.fillRect(6, 24, 4, 7);
  x.fillStyle = '#FFFFFF'; x.fillRect(6, 24, 2, 2);
  return texturaDe(c);
}

// Canhão de mão: cano curto e GORDO, boca escancarada. Tem que
// parecer que pesa e que dá um coice absurdo.
export function gerarCanhao() {
  const W = 118, H = 92;
  const { c, x } = novoCanvas(W, H);
  const FERRO = '#4E545E', ALTO = '#8A929E', BAIXO = '#2A2F36';
  const MADEIRA = '#5A3A20';

  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(40, 74, 56, 6);

  // cano cônico, boca larga na esquerda
  for (let i = 0; i < 52; i++) {
    const px = 26 + i;
    const alt = Math.round(30 - i * 0.28);
    const py = 30 + Math.round(i * 0.14);
    x.fillStyle = BAIXO; x.fillRect(px, py, 1, alt);
    x.fillStyle = FERRO; x.fillRect(px, py + 2, 1, alt - 4);
    if (i % 13 === 4) { x.fillStyle = ALTO; x.fillRect(px, py, 1, alt); }
  }
  // boca: o buraco tem que ser grande e preto
  x.fillStyle = '#0A0908'; x.fillRect(20, 34, 10, 24);
  x.fillStyle = ALTO;      x.fillRect(18, 30, 5, 32);
  x.fillStyle = BAIXO;     x.fillRect(18, 30, 5, 3);

  // culatra e cabo
  x.fillStyle = BAIXO;   x.fillRect(76, 34, 16, 26);
  x.fillStyle = FERRO;   x.fillRect(77, 35, 14, 24);
  x.fillStyle = ALTO;    x.fillRect(77, 35, 14, 2);
  x.fillStyle = '#171A1F'; x.fillRect(81, 40, 4, 4); x.fillRect(81, 50, 4, 4);
  for (let i = 0; i < 20; i++) {
    x.fillStyle = i % 6 === 2 ? '#7E5430' : MADEIRA;
    x.fillRect(90 + i, 58 + Math.floor(i * 0.7), 1, 16 - Math.floor(i * 0.3));
  }
  x.fillStyle = '#2A2420'; x.fillRect(64, 46, 20, 20);
  x.fillStyle = '#4A4038'; x.fillRect(66, 48, 16, 16);
  return texturaDe(c);
}

// ---------- barra de vida sobre a cabeça ----------
// Uma textura de 1 pixel branco. A cor sai do material e a largura da
// escala do sprite — assim TODOS os inimigos compartilham a mesma
// textura e os mesmos dois materiais, e 26 barras custam o que custa
// uma. Fazer uma textura por inimigo derrubaria o quadro.
let _texBarra = null;
export function texturaBarra() {
  if (_texBarra) return _texBarra;
  const { c, x } = novoCanvas(1, 1);
  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, 1, 1);
  _texBarra = texturaDe(c);
  return _texBarra;
}

// ---------- projétil do chefe ----------
// Núcleo claro com halo irregular. O contorno NÃO pode ser um círculo
// limpo: a coisa tem que parecer energia cuspida, não uma bolinha.
export function gerarProjetil(corRealce = '#FFD65A') {
  const T = 24;
  const { c, x } = novoCanvas(T, T);
  const cx = 12, cy = 12;
  for (let y = 0; y < T; y++) {
    for (let px = 0; px < T; px++) {
      const d = Math.hypot(px - cx, y - cy);
      if (d > 11) continue;
      if (d > 7 && Math.random() > 0.55) continue;
      x.fillStyle = d < 3 ? '#FFFFFF' : d < 6 ? corRealce : 'rgba(255,255,255,.30)';
      x.fillRect(px, y, 1, 1);
    }
  }
  // faíscas saindo
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * 6.28, r = 8 + Math.random() * 4;
    x.fillStyle = corRealce;
    x.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
  return texturaDe(c);
}

// ---------- mercador ----------
// Precisa ser lido como AMIGO à distância, num jogo em que tudo que se
// move quer te matar. Por isso: silhueta larga e parada (nada de garras
// nem chifres), capuz baixo com dois pontos de luz dourada no lugar dos
// olhos, e a balança dourada na mão — o único objeto do jogo que não é
// arma. A cor de ouro faz o resto: é a mesma da saída e do tesouro.
export function gerarMercador() {
  const W = 26, H = 34;
  const { c, x } = novoCanvas(W, H);
  const MANTO = '#3A2E52', MANTO_ALTO = '#54446E', MANTO_BAIXO = '#241C36';
  const OURO = '#E3B23C', OURO_ALTO = '#FFE28A', PELE = '#6A5240';

  // sombra no chão
  x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(5, 32, 16, 2);

  // manto: base larga que afina no capuz
  for (let i = 0; i < 24; i++) {
    const py = 32 - i;
    const larg = i < 14 ? 18 - Math.floor(i * 0.25) : Math.max(9, 15 - (i - 14));
    const px = 13 - (larg >> 1);
    x.fillStyle = MANTO_BAIXO; x.fillRect(px, py, larg, 1);
    x.fillStyle = MANTO;       x.fillRect(px + 1, py, larg - 2, 1);
    if (i % 6 === 2) { x.fillStyle = MANTO_ALTO; x.fillRect(px + 1, py, larg - 2, 1); }
  }
  // dobra central do manto
  x.fillStyle = MANTO_BAIXO; x.fillRect(13, 18, 1, 14);

  // capuz
  x.fillStyle = MANTO_BAIXO; x.fillRect(7, 4, 12, 8);
  x.fillStyle = MANTO;       x.fillRect(8, 5, 10, 6);
  x.fillStyle = MANTO_ALTO;  x.fillRect(8, 4, 10, 1);
  // vão escuro do rosto e os dois olhos
  x.fillStyle = '#0A0810';   x.fillRect(9, 8, 8, 5);
  x.fillStyle = OURO;        x.fillRect(10, 10, 2, 2); x.fillRect(15, 10, 2, 2);
  x.fillStyle = OURO_ALTO;   x.fillRect(10, 10, 1, 1); x.fillRect(15, 10, 1, 1);

  // gola dourada
  x.fillStyle = OURO;      x.fillRect(7, 13, 12, 2);
  x.fillStyle = OURO_ALTO; x.fillRect(7, 13, 12, 1);

  // braço e mão segurando a balança
  x.fillStyle = MANTO_BAIXO; x.fillRect(19, 16, 4, 8);
  x.fillStyle = MANTO;       x.fillRect(19, 16, 3, 7);
  x.fillStyle = PELE;        x.fillRect(20, 23, 3, 3);

  // balança: haste, travessa e dois pratos
  x.fillStyle = OURO;      x.fillRect(21, 18, 1, 6);
  x.fillStyle = OURO;      x.fillRect(18, 18, 7, 1);
  x.fillStyle = OURO_ALTO; x.fillRect(18, 18, 7, 1);
  x.fillStyle = OURO;      x.fillRect(17, 20, 3, 1); x.fillRect(23, 21, 3, 1);
  x.fillStyle = '#8A6A1E'; x.fillRect(18, 19, 1, 1); x.fillRect(24, 19, 1, 2);

  return texturaDe(c);
}

// ---------- escopeta em primeira pessoa ----------
// Cano duplo sobreposto, visto de baixo e um pouco de lado. Os canos
// são cilindros achatados em degraus de 1px, como sprite de 93, e não
// tubos suaves — é o que impede o visual de virar render vetorial.
export function gerarEscopetaJogador() {
  const W = 128, H = 88;
  const { c, x } = novoCanvas(W, H);

  const AZO = '#1E1C1A', ACO = '#4A4E56', ACO_ALTO = '#8A929E', ACO_BAIXO = '#2A2E34';
  const MADEIRA = '#5A3A20', MADEIRA_ALTA = '#7E5430', MADEIRA_BAIXA = '#3A2412';

  // sombra sob a arma, para ela não flutuar
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.fillRect(38, 74, 60, 6);

  // --- canos (dois, sobrepostos) ---
  for (let i = 0; i < 2; i++) {
    const topo = 12 + i * 13;
    x.fillStyle = ACO_BAIXO; x.fillRect(46, topo, 46, 12);
    x.fillStyle = ACO;       x.fillRect(46, topo + 1, 46, 9);
    x.fillStyle = ACO_ALTO;  x.fillRect(46, topo + 1, 46, 2);
    // boca do cano: escura, é o buraco
    x.fillStyle = '#0A0908';  x.fillRect(46, topo + 2, 5, 8);
    x.fillStyle = ACO_ALTO;   x.fillRect(45, topo, 2, 12);
  }
  // costura entre os canos
  x.fillStyle = AZO; x.fillRect(46, 24, 46, 2);

  // --- bloco da culatra ---
  x.fillStyle = ACO_BAIXO; x.fillRect(90, 10, 18, 32);
  x.fillStyle = ACO;       x.fillRect(91, 12, 16, 28);
  x.fillStyle = ACO_ALTO;  x.fillRect(91, 12, 16, 2);
  x.fillStyle = AZO;       x.fillRect(94, 18, 3, 3);   // pino
  x.fillStyle = AZO;       x.fillRect(94, 30, 3, 3);

  // --- guarda-mato e gatilho ---
  x.fillStyle = ACO_BAIXO; x.fillRect(96, 42, 14, 3);
  x.fillStyle = AZO;       x.fillRect(99, 42, 3, 7);

  // --- coronha de madeira ---
  for (let i = 0; i < 26; i++) {
    const px = 104 + i;
    const py = 40 + Math.floor(i * 0.75);
    const alt = 20 - Math.floor(i * 0.25);
    x.fillStyle = MADEIRA_BAIXA; x.fillRect(px, py, 1, alt);
    x.fillStyle = MADEIRA;       x.fillRect(px, py + 1, 1, alt - 3);
    if (i % 7 !== 3) { x.fillStyle = MADEIRA_ALTA; x.fillRect(px, py + 1, 1, 2); }
  }

  // --- mão de apoio no cano ---
  x.fillStyle = '#2A2420'; x.fillRect(62, 22, 20, 20);
  x.fillStyle = '#4A4038'; x.fillRect(64, 24, 16, 16);
  x.fillStyle = '#6A5A48'; x.fillRect(64, 24, 16, 3);
  x.fillStyle = '#2A2420'; x.fillRect(67, 30, 3, 8); x.fillRect(72, 30, 3, 8);

  return texturaDe(c);
}

// Clarão do disparo: pétalas irregulares, nunca um círculo — círculo
// perfeito é o que denuncia forma gerada por fórmula.
export function gerarFogoDeBoca() {
  const W = 96, H = 96;
  const { c, x } = novoCanvas(W, H);
  const cx = 48, cy = 48;
  const petalas = [
    [0, 40], [0.5, 26], [1.1, 34], [1.7, 20], [2.3, 30],
    [2.9, 22], [3.6, 38], [4.2, 24], [4.9, 32], [5.6, 26],
  ];
  const camadas = [
    { cor: '#7A3A0E', esc: 1.0 },
    { cor: '#E8873A', esc: 0.74 },
    { cor: '#FFD65A', esc: 0.46 },
    { cor: '#FFF6D8', esc: 0.24 },
  ];
  for (const cam of camadas) {
    x.fillStyle = cam.cor;
    for (const [ang, raio] of petalas) {
      const r = raio * cam.esc;
      for (let t = 0; t < r; t++) {
        const px = Math.round(cx + Math.cos(ang) * t);
        const py = Math.round(cy + Math.sin(ang) * t);
        const esp = Math.max(1, Math.round((r - t) * 0.45));
        x.fillRect(px - (esp >> 1), py - (esp >> 1), esp, esp);
      }
    }
  }
  return texturaDe(c);
}

// ---------- zweihänder ----------
// Lâmina larguíssima, guarda em cruz e um ricasso enrolado em couro:
// a silhueta tem que dizer "duas mãos" antes de qualquer texto.
export function gerarZweihander() {
  const W = 128, H = 96;
  const { c, x } = novoCanvas(W, H);
  const ACO = '#C2CAD6', ACO_ALTO = '#FFFFFF', ACO_BAIXO = '#6A7280';
  const COURO = '#4A3020', OURO = '#E3B23C';

  x.fillStyle = '#2A2420'; x.fillRect(66, 66, 24, 24);
  x.fillStyle = '#4A4038'; x.fillRect(68, 68, 20, 20);
  x.fillStyle = '#2A2420'; x.fillRect(72, 74, 4, 5); x.fillRect(79, 74, 4, 5);
  x.fillStyle = '#2A2420'; x.fillRect(58, 52, 22, 22);
  x.fillStyle = '#4A4038'; x.fillRect(60, 54, 18, 18);

  x.fillStyle = COURO; x.fillRect(68, 48, 12, 24);
  for (let i = 0; i < 6; i++) { x.fillStyle = '#6A4830'; x.fillRect(68, 49 + i * 4, 12, 1); }

  x.fillStyle = OURO;     x.fillRect(46, 42, 46, 6);
  x.fillStyle = '#FFE28A'; x.fillRect(46, 42, 46, 2);
  x.fillStyle = '#8A6A1E'; x.fillRect(46, 47, 46, 1);
  x.fillStyle = OURO;     x.fillRect(44, 38, 5, 12); x.fillRect(90, 38, 5, 12);

  x.fillStyle = COURO;   x.fillRect(64, 30, 14, 12);
  x.fillStyle = '#6A4830'; x.fillRect(64, 30, 14, 2);

  const passos = 32;
  for (let i = 0; i < passos; i++) {
    const py = 30 - i;
    const px = 71 - Math.floor(i * 0.55);
    const larg = i < passos - 6 ? 22 - Math.floor(i / 10) : Math.max(3, 16 - (i - (passos - 6)) * 3);
    x.fillStyle = ACO;       x.fillRect(px - (larg >> 1), py, larg, 1);
    x.fillStyle = ACO_ALTO;  x.fillRect(px - (larg >> 1), py, 2, 1);
    x.fillStyle = ACO_BAIXO; x.fillRect(px + (larg >> 1) - 2, py, 2, 1);
    if (i % 2 === 0) { x.fillStyle = ACO_BAIXO; x.fillRect(px - 1, py, 2, 1); }
  }
  return texturaDe(c);
}
