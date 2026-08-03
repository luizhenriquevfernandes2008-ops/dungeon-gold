// ============================================================
// Chefe final — sprite montado peça por peça.
//
// O resto do jogo desenha inimigos a partir de formas fixas. Aqui
// não dá: o chefe final tem que ser algo que você NUNCA viu, toda
// run. Então ele é composto — corpo, cabeça, braços e paleta são
// sorteados com a semente da run, e cada peça é desenhada por uma
// função própria em cima de uma silhueta comum.
//
// O que garante que ele não pareça um inimigo comum aumentado:
// nenhuma peça daqui é reaproveitada de sprites.js, a escala é
// quase o triplo, e a silhueta tem sempre um elemento que nenhum
// bicho normal tem — chifre, coroa, olho a mais ou tentáculo.
// ============================================================

import * as THREE from 'three';
import { novoCanvas } from './textures.js';
import { criarRng } from '../core/rng.js';

const W = 64, H = 72;

function textura(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// espelha no eixo vertical: desenho metade, ganho simetria de graça
function sim(x, rx, ry, rw, rh) {
  x.fillRect(rx, ry, rw, rh);
  x.fillRect(W - rx - rw, ry, rw, rh);
}

// ---------- corpos ----------
// Cada corpo devolve onde o pescoço fica, para a cabeça encaixar.
const CORPOS = {
  // massa larga que se estreita para cima, pernas curtas e grossas
  colossal(x, c, rng) {
    for (let i = 0; i < 34; i++) {
      const py = 66 - i;
      const larg = Math.round(26 - i * 0.33 + Math.sin(i * 0.4) * 1.5);
      x.fillStyle = c.b; sim(x, 32 - larg, py, larg, 1);
      x.fillStyle = c.a; sim(x, 32 - larg + 2, py, larg - 2, 1);
      if (i % 7 === 3) { x.fillStyle = c.e; sim(x, 32 - larg + 2, py, 3, 1); }
    }
    // pernas
    x.fillStyle = c.c; sim(x, 12, 60, 9, 12);
    x.fillStyle = c.b; sim(x, 13, 60, 7, 10);
    // placas do peito
    x.fillStyle = c.c; sim(x, 20, 44, 11, 3); sim(x, 21, 50, 9, 3);
    return { pescoco: 32, ombro: 40, larguraOmbro: 22 };
  },

  // alto e fino, costelas à mostra, pernas longas
  esguio(x, c, rng) {
    for (let i = 0; i < 40; i++) {
      const py = 62 - i;
      const larg = Math.round(11 + Math.sin(i * 0.22) * 4);
      x.fillStyle = c.b; sim(x, 32 - larg, py, larg, 1);
      x.fillStyle = c.a; sim(x, 32 - larg + 1, py, larg - 1, 1);
    }
    x.fillStyle = c.c; sim(x, 24, 66, 5, 6); sim(x, 18, 62, 4, 10);
    // costelas
    for (let i = 0; i < 6; i++) {
      x.fillStyle = c.e; sim(x, 22, 40 + i * 4, 9, 1);
      x.fillStyle = c.c; sim(x, 22, 41 + i * 4, 9, 1);
    }
    return { pescoco: 22, ombro: 30, larguraOmbro: 15 };
  },

  // borrão irregular, sem simetria limpa, escorre para baixo
  amorfo(x, c, rng) {
    for (let i = 0; i < 38; i++) {
      const py = 68 - i;
      const larg = Math.round(20 + Math.sin(i * 0.55) * 7 + rng.float(-2, 2));
      x.fillStyle = c.b; sim(x, 32 - larg, py, larg, 1);
      x.fillStyle = c.a; sim(x, 32 - larg + 2, py, larg - 2, 1);
    }
    // gotas escorrendo
    for (let i = 0; i < 10; i++) {
      const px = rng.int(10, 30), alt = rng.int(3, 9);
      x.fillStyle = c.b; sim(x, px, 66, 2, alt);
      x.fillStyle = c.e; sim(x, px, 66, 1, 2);
    }
    // bolhas
    for (let i = 0; i < 12; i++) {
      const px = rng.int(14, 30), py = rng.int(34, 62), s = rng.int(2, 4);
      x.fillStyle = c.e; sim(x, px, py, s, s);
      x.fillStyle = c.c; sim(x, px, py, s, 1);
    }
    return { pescoco: 30, ombro: 38, larguraOmbro: 20 };
  },

  // tórax segmentado e muitas patas finas saindo dos lados
  insetoide(x, c, rng) {
    for (let i = 0; i < 30; i++) {
      const py = 58 - i;
      const larg = Math.round(15 + Math.sin(i * 0.9) * 3);
      x.fillStyle = c.b; sim(x, 32 - larg, py, larg, 1);
      x.fillStyle = c.a; sim(x, 32 - larg + 2, py, larg - 2, 1);
      if (i % 5 === 0) { x.fillStyle = c.c; sim(x, 32 - larg, py, larg, 1); }
    }
    // patas: quatro pares em ângulos diferentes
    for (let p = 0; p < 4; p++) {
      const baseY = 40 + p * 6;
      for (let s = 0; s < 14; s++) {
        const px = 17 - s, py = baseY + Math.round(s * (0.5 + p * 0.25));
        if (py > 71 || px < 0) break;
        x.fillStyle = s < 7 ? c.b : c.c;
        sim(x, px, py, 2, 1);
      }
    }
    x.fillStyle = c.c; sim(x, 22, 58, 6, 12);
    return { pescoco: 28, ombro: 34, larguraOmbro: 14 };
  },
};

// ---------- cabeças ----------
function desenharCabeca(x, c, cab, ancora, rng) {
  const cy = ancora.pescoco - 12;
  const larg = cab.coroa ? 13 : 11;

  // crânio
  x.fillStyle = c.b; sim(x, 32 - larg, cy, larg, 14);
  x.fillStyle = c.a; sim(x, 32 - larg + 2, cy + 1, larg - 2, 12);
  x.fillStyle = c.c; sim(x, 32 - larg + 2, cy + 11, larg - 2, 3);   // mandíbula na sombra

  // olhos: acendem na cor de realce, é o que o jogador procura no escuro
  const olhos = cab.olhos;
  if (olhos <= 3) {
    for (let i = 0; i < Math.ceil(olhos / 2); i++) {
      x.fillStyle = c.e; sim(x, 24 + i * 4, cy + 4, 3, 3);
      x.fillStyle = '#FFFFFF'; sim(x, 24 + i * 4, cy + 4, 1, 1);
    }
    if (olhos === 3) { x.fillStyle = c.e; x.fillRect(31, cy + 1, 2, 2); }
  } else {
    // enxame: muitos olhos pequenos espalhados
    for (let i = 0; i < olhos; i++) {
      const px = 22 + (i % 3) * 4, py = cy + 3 + Math.floor(i / 3) * 4;
      x.fillStyle = c.e; sim(x, px, py, 2, 2);
    }
  }

  // dentes
  for (let i = 0; i < 4; i++) { x.fillStyle = '#E8E0D0'; sim(x, 24 + i * 2, cy + 12, 1, 2); }

  // chifres
  for (let h = 0; h < cab.chifres / 2; h++) {
    const bx = 22 - h * 3, curva = 0.55 + h * 0.3;
    for (let s = 0; s < 11 - h * 2; s++) {
      x.fillStyle = s < 6 ? c.a : c.e;
      sim(x, bx - Math.round(s * curva), cy - s, 3 - (s > 6 ? 1 : 0), 2);
    }
  }

  // coroa
  if (cab.coroa) {
    x.fillStyle = '#E3B23C'; sim(x, 32 - larg, cy - 4, larg, 3);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#FFE28A'; sim(x, 21 + i * 4, cy - 8, 2, 5); }
    x.fillStyle = '#8A6A1E'; sim(x, 32 - larg, cy - 2, larg, 1);
  }
}

// ---------- braços ----------
function desenharBracos(x, c, br, ancora, rng) {
  const oy = ancora.ombro, ox = 32 - ancora.larguraOmbro;

  if (br.id === 'garras') {
    for (let s = 0; s < 16; s++) {
      x.fillStyle = s < 10 ? c.a : c.b;
      sim(x, ox - Math.round(s * 0.55), oy + s, 5, 2);
    }
    // três dedos longos
    for (let d = 0; d < 3; d++)
      for (let s = 0; s < 8; s++) {
        x.fillStyle = s > 5 ? '#E8E0D0' : c.e;
        sim(x, ox - 9 - d * 2 - Math.round(s * 0.4), oy + 16 + s + d, 2, 1);
      }

  } else if (br.id === 'marreta') {
    for (let s = 0; s < 14; s++) {
      x.fillStyle = c.a; sim(x, ox - Math.round(s * 0.35), oy + s, 6, 2);
    }
    // bloco na ponta
    x.fillStyle = c.c; sim(x, ox - 12, oy + 14, 13, 11);
    x.fillStyle = c.b; sim(x, ox - 11, oy + 15, 11, 9);
    x.fillStyle = c.e; sim(x, ox - 11, oy + 15, 11, 2);
    for (let i = 0; i < 3; i++) { x.fillStyle = c.c; sim(x, ox - 9 + i * 4, oy + 18, 2, 2); }

  } else {
    // tentáculos: três por lado, cada um com curva própria
    for (let t = 0; t < 3; t++) {
      const fase = rng.float(0, 6.28), amp = rng.float(1.4, 3.0);
      for (let s = 0; s < 24; s++) {
        const px = ox - Math.round(s * 0.42 + Math.sin(s * 0.42 + fase) * amp);
        const py = oy + t * 5 + s;
        if (py > 71) break;
        x.fillStyle = s < 14 ? c.a : c.b;
        sim(x, px, py, 3 - (s > 16 ? 1 : 0), 1);
        if (s % 5 === 2) { x.fillStyle = c.e; sim(x, px, py, 1, 1); }
      }
    }
  }
}

/**
 * Monta o chefe final a partir das peças escolhidas.
 * Devolve os dois quadros usados pelo resto do jogo (parado e atacando)
 * mais um quadro de raiva, usado a partir da fase 2.
 */
export function gerarChefeFinal(pecas, semente) {
  const rng = criarRng(semente >>> 0);
  const c = pecas.paleta;

  const fazer = (pose) => {
    const { c: canvas, x } = novoCanvas(W, H);
    const r = criarRng(semente >>> 0);   // mesma semente por quadro: o bicho não muda de forma entre quadros
    const ancora = CORPOS[pecas.corpo.id](x, c, r);

    // a pose de ataque abre os braços e adianta a cabeça
    if (pose === 'atacar') {
      x.save();
      x.translate(0, -2);
    }
    desenharBracos(x, c, pecas.bracos, ancora, r);
    desenharCabeca(x, c, pecas.cabeca, ancora, r);
    if (pose === 'atacar') x.restore();

    // aura: pontinhos soltos ao redor, densidade cresce com a fase
    const aura = pose === 'raiva' ? 26 : 10;
    for (let i = 0; i < aura; i++) {
      const px = rng.int(2, W - 3), py = rng.int(2, H - 3);
      x.fillStyle = pose === 'raiva' ? '#FFFFFF' : c.e;
      x.fillRect(px, py, 1, 1);
    }
    return textura(canvas);
  };

  return {
    andar0: fazer('parado'),
    andar1: fazer('atacar'),
    atacar: fazer('atacar'),
    raiva: fazer('raiva'),
    largura: W,
    altura: H,
  };
}

/** Sorteia as peças e os números do chefe final desta run. */
export function sortearChefeFinal(dados, andar, semente) {
  const rng = criarRng(semente >>> 0);
  const d = dados;

  const corpo = rng.escolher(d.corpos);
  const cabeca = rng.escolher(d.cabecas);
  const bracos = rng.escolher(d.bracos);
  const paletaBruta = rng.escolher(d.paletas);
  const paleta = { ...paletaBruta };

  const titulo = rng.escolher(d.titulos);
  const epiteto = rng.escolher(d.epitetos);

  // Três ataques, um por faixa de fase. Sortear três de qualquer jeito
  // dava chefes com dois ataques travados na fase 3 — a primeira fase
  // ficava com um golpe só e a luta começava morna. Assim ele sempre
  // tem o que fazer desde o primeiro segundo, e sempre guarda uma
  // carta para quando estiver acuado.
  const usados = new Set();
  const pegar = faseMax => {
    const pool = rng.embaralhar(
      d.ataques.filter(a => (a.faseMin ?? 1) <= faseMax && !usados.has(a.id)));
    const a = pool[0];
    if (a) usados.add(a.id);
    return a;
  };
  const ataques = [pegar(1), pegar(2), pegar(3)].filter(Boolean);
  // rede de segurança: se algum escalão ficou vazio, completa com o que sobrou
  while (ataques.length < 3) {
    const a = rng.embaralhar(d.ataques.filter(x => !usados.has(x.id)))[0];
    if (!a) break;
    usados.add(a.id);
    ataques.push(a);
  }

  const b = d.base;
  const extra = Math.max(0, andar - 1);

  return {
    pecas: { corpo, cabeca, bracos, paleta },
    semente,
    nome: `${titulo} ${epiteto}`,
    frase: rng.escolher(d.frases ?? ['Ele esperou.']),
    ataques,
    vida: Math.round((b.vida + b.vidaPorAndar * extra) * corpo.vida),
    dano: Math.round((b.dano + b.danoPorAndar * extra) * bracos.dano),
    velocidade: b.velocidade * corpo.velocidade,
    alcance: bracos.alcance,
    cadencia: b.cadencia,
    ouro: b.ouro,
    escala: corpo.escala,
    alturaMaxima: d.arena?.alturaMaxima ?? 0.62,
    armadura: corpo.armadura,
    luz: parseInt(paleta.luz.replace('0x', ''), 16),
    fases: d.fases,
    chefe: true,
    chefeFinal: true,
    sprite: 'chefeFinal',
  };
}
