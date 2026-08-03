// ============================================================
// Texturas — desenhadas em canvas 2D, pixel a pixel, e viradas
// em texturas do three com filtro NEAREST.
// Nada de cor chapada: toda superfície tem argamassa, manchas,
// rachaduras e variação por bloco. É isso que tira o aspecto
// de "cubo cinza de tutorial".
// ============================================================

import * as THREE from 'three';
import { criarRng } from '../core/rng.js';

const TAM = 64;

// ---------- temas visuais por andar ----------
//
// Um tema não é só paleta: cada um traz um bloco `arq` que
// SOBRESCREVE os parâmetros de geração da masmorra. É isso que faz
// a Gruta parecer escavada e a Forja parecer construída, mesmo os
// dois saindo do mesmo algoritmo procedural. Trocar o tema muda
// tamanho de sala, largura de corredor, altura de teto, densidade
// de tocha, presença de pilares e erosão das paredes.
//
// Cada tema segura 2 andares.
export const TEMAS = {
  cripta: {
    nome: 'Cripta',
    lema: 'corredores apertados, tocha a cada esquina',
    parede: ['#4A4740', '#565248', '#3E3B35', '#615C50'],
    argamassa: '#221F1B',
    chao: ['#3A3731', '#454138', '#2F2C27'],
    teto: ['#232019', '#2B2720'],
    musgo: '#3E4A31',
    nevoa: 0x0E0C0A,
    luz: 0xFFB870,
    acento: '#6B6252',
    arq: {
      tamanhoSalaMin: 5, tamanhoSalaMax: 8,
      alturaParede: 3.4,
      densidadeTocha: 0.17,
      corredorLargo: false, pilares: 0, irregular: 0,
      semTeto: false,
    },
  },

  catacumba: {
    nome: 'Catacumba',
    lema: 'salões longos e escuros, poucas tochas',
    parede: ['#5A4A3A', '#6B5844', '#4A3D30', '#7A6650'],
    argamassa: '#2A2018',
    chao: ['#463A2C', '#514334', '#382E24'],
    teto: ['#2A2118', '#33291E'],
    musgo: '#4A4A2E',
    nevoa: 0x120D08,
    luz: 0xFFA855,
    acento: '#8A7355',
    arq: {
      tamanhoSalaMin: 4, tamanhoSalaMax: 13,
      alturaParede: 4.4,
      densidadeTocha: 0.07,
      corredorLargo: false, pilares: 0.12, irregular: 0,
      semTeto: false,
    },
  },

  gruta: {
    nome: 'Gruta Afundada',
    lema: 'nada aqui foi construído — foi escavado',
    parede: ['#3A4A44', '#46584F', '#2E3C38', '#52685C'],
    argamassa: '#141C1A',
    chao: ['#2E3A34', '#37453E', '#25302B'],
    teto: ['#161E1B', '#1C2622'],
    musgo: '#2E6E4A',
    nevoa: 0x081210,
    luz: 0x6AE0B0,
    acento: '#3E7A62',
    arq: {
      tamanhoSalaMin: 6, tamanhoSalaMax: 12,
      alturaParede: 3.0,
      densidadeTocha: 0.05,
      corredorLargo: true, pilares: 0.05, irregular: 0.55,
      semTeto: false,
    },
  },

  forja: {
    nome: 'Forja',
    lema: 'salões altos de pilar, brasa por toda parte',
    parede: ['#4A3430', '#5C4038', '#3A2825', '#6E4C40'],
    argamassa: '#1E1210',
    chao: ['#3E2A26', '#4A322C', '#31221F'],
    teto: ['#241614', '#2E1C19'],
    musgo: '#5A3020',
    nevoa: 0x160A08,
    luz: 0xFF8A3C,
    acento: '#8E4A32',
    arq: {
      tamanhoSalaMin: 8, tamanhoSalaMax: 14,
      alturaParede: 6.2,
      densidadeTocha: 0.19,
      corredorLargo: true, pilares: 0.30, irregular: 0,
      semTeto: false,
    },
  },

  biblioteca: {
    nome: 'Biblioteca Afogada',
    lema: 'estantes de pedra em fileira, luz fria',
    parede: ['#3A4250', '#454F60', '#2E3540', '#525E72'],
    argamassa: '#181C24',
    chao: ['#2E3540', '#38404E', '#252B34'],
    teto: ['#1A1E26', '#222732'],
    musgo: '#2E4A5A',
    nevoa: 0x080C12,
    luz: 0x7AB8FF,
    acento: '#5A6E8A',
    arq: {
      tamanhoSalaMin: 7, tamanhoSalaMax: 11,
      alturaParede: 5.6,
      densidadeTocha: 0.09,
      corredorLargo: false, pilares: 0.55, irregular: 0,
      semTeto: false,
    },
  },

  santuario: {
    nome: 'Santuário Caído',
    lema: 'o teto ruiu — acima de você só o vazio',
    parede: ['#3E3A48', '#4A4556', '#33303C', '#585264'],
    argamassa: '#1C1922',
    chao: ['#35323E', '#3F3B4A', '#2B2833'],
    teto: ['#201D28', '#282434'],
    musgo: '#3A4A4A',
    nevoa: 0x0C0A12,
    luz: 0xC9A8FF,
    acento: '#6A6280',
    arq: {
      tamanhoSalaMin: 8, tamanhoSalaMax: 15,
      alturaParede: 7.4,
      densidadeTocha: 0.08,
      corredorLargo: true, pilares: 0.18, irregular: 0,
      semTeto: true,
    },
  },

  abismo: {
    nome: 'Abismo',
    lema: 'a rocha sangra e não há mais teto nenhum',
    parede: ['#4A2222', '#5E2A28', '#3A1A1A', '#72322E'],
    argamassa: '#1A0C0C',
    chao: ['#3E1E1E', '#4C2624', '#2E1616'],
    teto: ['#220E0E', '#2E1414'],
    musgo: '#6A2018',
    nevoa: 0x160606,
    luz: 0xFF5A3C,
    acento: '#A03A2A',
    arq: {
      tamanhoSalaMin: 6, tamanhoSalaMax: 14,
      alturaParede: 5.2,
      densidadeTocha: 0.06,
      corredorLargo: true, pilares: 0.10, irregular: 0.40,
      semTeto: true,
    },
  },
};

// ============================================================
// BIOMAS DE DESVIO — o que existe do outro lado do portal.
//
// Estes NÃO entram no sorteio dos andares normais. Só se chega neles
// atravessando um portal, e é isso que faz o portal valer a pena: não
// é mais uma masmorra repintada, é um lugar que a masmorra não tem.
//
// A diferença tinha que ser estrutural, não de cor: a Superfície é
// aberta, larguíssima e sem teto nenhum — depois de dez andares de
// corredor, respirar é o prêmio. A Escadaria é o oposto: apertada,
// altíssima e vermelha, um funil que só desce.
// ============================================================
export const BIOMAS = {
  superficie: {
    nome: 'Superfície',
    lema: 'céu aberto pela primeira vez — e nada aqui é amigo',
    desvio: true,
    parede: ['#5A6250', '#6E7860', '#4A5242', '#7E8A70'],
    argamassa: '#2A3024',
    chao: ['#4A5A38', '#56683F', '#3C4A2E'],
    teto: ['#0A1020', '#0E1628'],
    musgo: '#7EA83C',
    nevoa: 0x1A2438,
    luz: 0xBFD8FF,          // luar frio, não tocha
    acento: '#9AB07A',
    arq: {
      tamanhoSalaMin: 10, tamanhoSalaMax: 18,
      // A grade PRECISA crescer junto com as salas. Com a grade padrão
      // de 40 quase nenhuma sala de 18 cabia, sobravam duas ou três, e
      // o desvio saía mais pobre que a masmorra — o contrário do
      // combinado. Clareiras grandes exigem terreno grande.
      gradeMin: 54, gradeMax: 62,
      salasMin: 8, salasMax: 12,
      alturaParede: 9.0,
      densidadeTocha: 0.04,
      corredorLargo: true, pilares: 0.06, irregular: 0.30,
      semTeto: true,
      chancePorta: 0.05,
    },
  },

  escadaria: {
    nome: 'Escadaria para o Inferno',
    lema: 'só desce, e cada degrau é mais quente que o anterior',
    desvio: true,
    parede: ['#3A1410', '#4E1C16', '#2A0E0A', '#66261C'],
    argamassa: '#140604',
    chao: ['#5A1A10', '#722216', '#42120C'],
    teto: ['#1A0806', '#240C08'],
    musgo: '#C43A18',
    nevoa: 0x200604,
    luz: 0xFF7A2A,
    acento: '#C4522A',
    arq: {
      tamanhoSalaMin: 4, tamanhoSalaMax: 7,
      // salas pequenas, mas MUITAS: é um poço de patamares, e o
      // apinhado é o ponto — você desce brigando em espaço curto
      gradeMin: 42, gradeMax: 50,
      salasMin: 13, salasMax: 18,
      alturaParede: 13.0,      // teto altíssimo: o poço engole a vista
      densidadeTocha: 0.26,
      corredorLargo: false, pilares: 0.30, irregular: 0,
      semTeto: false,
      chancePorta: 0.22,
    },
  },
};

export const NOMES_BIOMAS = Object.keys(BIOMAS);

export function biomaPorNome(nome) {
  return BIOMAS[nome] ?? null;
}

export const NOMES_TEMAS = Object.keys(TEMAS);

// UM tema por andar. Antes eram dois, e com 20 andares o Abismo assumia
// do 15 em diante — a segunda metade da run inteira era vermelha e igual.
export const ANDARES_POR_TEMA = 1;

/**
 * Ordem dos temas desta run.
 *
 * Não é uma tabela fixa: a cada run os temas são embaralhados. Se a run
 * for mais longa que a lista, embaralha de novo — garantindo que o
 * último tema de uma volta nunca emende com o primeiro da seguinte.
 * Duas runs seguidas nunca descem na mesma ordem, e é isso que impede
 * o jogador de decorar "andar 4 é a Forja".
 */
export function montarSequenciaTemas(semente, andares) {
  const rng = criarRng((semente >>> 0) || 1);
  const saida = [];
  let ultimo = null;

  while (saida.length < andares) {
    const volta = rng.embaralhar(NOMES_TEMAS);
    // se o primeiro da volta nova for igual ao último da anterior, troca
    // com o segundo — dois andares seguidos iguais é exatamente o que
    // estamos consertando
    if (volta[0] === ultimo && volta.length > 1) {
      [volta[0], volta[1]] = [volta[1], volta[0]];
    }
    for (const t of volta) {
      if (saida.length >= andares) break;
      saida.push(t);
      ultimo = t;
    }
  }
  return saida;
}

/** Fallback por andar, usado quando não há sequência de run montada. */
export function temaDoAndar(andar) {
  const i = Math.min(NOMES_TEMAS.length - 1, Math.floor((andar - 1) / ANDARES_POR_TEMA));
  return TEMAS[NOMES_TEMAS[i]];
}

export function temaPorNome(nome) {
  return TEMAS[nome] ?? TEMAS[NOMES_TEMAS[0]];
}

// Mescla os parâmetros de arquitetura do tema por cima do balanceamento.
export function configDoTema(cfg, tema) {
  return { ...cfg, dungeon: { ...cfg.dungeon, ...(tema.arq || {}) } };
}

// ---------- utilidades de desenho ----------
function novoCanvas(w = TAM, h = TAM) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x };
}

function paraTextura(canvas, repetir = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetir, repetir);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

function mexerCor(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta));
  const b = Math.max(0, Math.min(255, (n & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

// ---------- parede de blocos ----------
export function texturaParede(tema, semente = 1) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();

  x.fillStyle = tema.argamassa;
  x.fillRect(0, 0, TAM, TAM);

  const alturaBloco = 16;
  const larguraBloco = 32;
  for (let ly = 0; ly < TAM / alturaBloco; ly++) {
    const desloc = (ly % 2) * (larguraBloco / 2);
    for (let bx = -1; bx <= TAM / larguraBloco; bx++) {
      const px = bx * larguraBloco + desloc;
      const py = ly * alturaBloco;
      const cor = rng.escolher(tema.parede);
      x.fillStyle = cor;
      x.fillRect(px + 1, py + 1, larguraBloco - 2, alturaBloco - 2);

      // chanfro: topo claro, base escura (dá volume sem normal map)
      x.fillStyle = mexerCor(cor, 18);
      x.fillRect(px + 1, py + 1, larguraBloco - 2, 1);
      x.fillStyle = mexerCor(cor, -20);
      x.fillRect(px + 1, py + alturaBloco - 2, larguraBloco - 2, 1);

      // granulado
      for (let i = 0; i < 46; i++) {
        const gx = px + 1 + rng.int(0, larguraBloco - 3);
        const gy = py + 1 + rng.int(0, alturaBloco - 3);
        x.fillStyle = mexerCor(cor, rng.int(-16, 16));
        x.fillRect(gx, gy, 1, 1);
      }

      // rachadura ocasional
      if (rng.chance(0.22)) {
        let cx = px + rng.int(4, larguraBloco - 5);
        let cy = py + 2;
        x.fillStyle = mexerCor(cor, -34);
        const passos = rng.int(4, alturaBloco - 4);
        for (let s = 0; s < passos; s++) {
          x.fillRect(cx, cy, 1, 1);
          cx += rng.int(-1, 1); cy += 1;
        }
      }
    }
  }

  // manchas de musgo/umidade escorrendo do topo
  for (let i = 0; i < 5; i++) {
    const mx = rng.int(0, TAM - 1);
    const alt = rng.int(6, 26);
    x.globalAlpha = 0.28;
    x.fillStyle = tema.musgo;
    for (let s = 0; s < alt; s++) {
      const larg = Math.max(1, 3 - Math.floor(s / 9));
      x.fillRect(mx - (larg >> 1), s, larg, 1);
    }
    x.globalAlpha = 1;
  }

  // escurece a base (sujeira acumulada)
  const grad = x.createLinearGradient(0, TAM - 14, 0, TAM);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.34)');
  x.fillStyle = grad;
  x.fillRect(0, TAM - 14, TAM, 14);

  return paraTextura(c);
}

// ---------- parede com detalhe (nicho / faixa de ouro) ----------
export function texturaParedeOrnada(tema, semente = 7) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();
  const base = texturaParede(tema, semente);
  x.drawImage(base.image, 0, 0);
  base.dispose();

  // faixa central com relevo e runa dourada
  x.fillStyle = mexerCor(tema.acento, -10);
  x.fillRect(0, 26, TAM, 12);
  x.fillStyle = mexerCor(tema.acento, 22);
  x.fillRect(0, 26, TAM, 1);
  x.fillStyle = mexerCor(tema.acento, -30);
  x.fillRect(0, 37, TAM, 1);

  for (let i = 0; i < 4; i++) {
    const rx = 6 + i * 16;
    x.fillStyle = '#E3B23C';
    x.fillRect(rx, 29, 1, 6);
    x.fillRect(rx + 3, 29, 1, 6);
    x.fillRect(rx, 31, 4, 1);
    x.fillStyle = 'rgba(0,0,0,.4)';
    x.fillRect(rx + 1, 35, 3, 1);
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(0,0,0,${rng.float(0.05, 0.2)})`;
    x.fillRect(rng.int(0, TAM - 1), 26 + rng.int(0, 11), 1, 1);
  }
  return paraTextura(c);
}

// ---------- chão ----------
export function texturaChao(tema, semente = 3) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();
  x.fillStyle = tema.argamassa;
  x.fillRect(0, 0, TAM, TAM);

  const t = 16;
  for (let gy = 0; gy < TAM / t; gy++) {
    for (let gx = 0; gx < TAM / t; gx++) {
      const cor = rng.escolher(tema.chao);
      x.fillStyle = cor;
      x.fillRect(gx * t + 1, gy * t + 1, t - 2, t - 2);
      x.fillStyle = mexerCor(cor, 12);
      x.fillRect(gx * t + 1, gy * t + 1, t - 2, 1);
      for (let i = 0; i < 34; i++) {
        x.fillStyle = mexerCor(cor, rng.int(-18, 14));
        x.fillRect(gx * t + 1 + rng.int(0, t - 3), gy * t + 1 + rng.int(0, t - 3), 1, 1);
      }
      // lasca no canto
      if (rng.chance(0.3)) {
        x.fillStyle = mexerCor(cor, -26);
        const q = rng.int(2, 4);
        x.fillRect(gx * t + rng.int(1, t - q - 1), gy * t + rng.int(1, t - q - 1), q, q);
      }
    }
  }
  return paraTextura(c);
}

// ---------- teto ----------
export function texturaTeto(tema, semente = 5) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();
  x.fillStyle = tema.teto[0];
  x.fillRect(0, 0, TAM, TAM);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = rng.chance(0.5) ? tema.teto[1] : mexerCor(tema.teto[0], rng.int(-10, 10));
    x.fillRect(rng.int(0, TAM - 1), rng.int(0, TAM - 1), 1, 1);
  }
  // vigas
  x.fillStyle = 'rgba(0,0,0,.42)';
  x.fillRect(0, 14, TAM, 3);
  x.fillRect(0, 46, TAM, 3);
  return paraTextura(c);
}

// ---------- porta ----------
export function texturaPorta(tema, semente = 11) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();
  x.fillStyle = '#3A2618';
  x.fillRect(0, 0, TAM, TAM);
  // tábuas verticais
  for (let i = 0; i < 4; i++) {
    const px = i * 16;
    const cor = ['#4A3020', '#553824', '#412A1B', '#5E3F28'][i % 4];
    x.fillStyle = cor;
    x.fillRect(px + 1, 0, 14, TAM);
    for (let g = 0; g < 90; g++) {
      x.fillStyle = mexerCor(cor, rng.int(-14, 10));
      x.fillRect(px + 1 + rng.int(0, 13), rng.int(0, TAM - 1), 1, rng.int(1, 3));
    }
  }
  // bandas de ferro com rebites de ouro
  ['#2A2622', '#2A2622'].forEach((cor, i) => {
    const y = i === 0 ? 10 : 46;
    x.fillStyle = cor; x.fillRect(0, y, TAM, 8);
    x.fillStyle = '#4A443C'; x.fillRect(0, y, TAM, 1);
    for (let r = 4; r < TAM; r += 12) {
      x.fillStyle = '#E3B23C'; x.fillRect(r, y + 3, 2, 2);
      x.fillStyle = '#8A6A1E'; x.fillRect(r, y + 4, 2, 1);
    }
  });
  // maçaneta
  x.fillStyle = '#E3B23C'; x.fillRect(48, 30, 4, 4);
  x.fillStyle = '#FFE28A'; x.fillRect(48, 30, 4, 1);
  return paraTextura(c);
}

// ---------- escada de descida ----------
export function texturaEscada(tema, semente = 13) {
  const rng = criarRng(semente);
  const { c, x } = novoCanvas();
  x.fillStyle = '#100C0A';
  x.fillRect(0, 0, TAM, TAM);
  for (let i = 0; i < 6; i++) {
    const y = i * 10;
    const t = 1 - i / 7;
    const v = Math.floor(70 * t) + 14;
    x.fillStyle = `rgb(${v},${Math.floor(v * .92)},${Math.floor(v * .8)})`;
    x.fillRect(i * 2, y, TAM - i * 4, 7);
    x.fillStyle = `rgba(0,0,0,.5)`;
    x.fillRect(i * 2, y + 7, TAM - i * 4, 3);
    for (let g = 0; g < 30; g++) {
      x.fillStyle = `rgba(0,0,0,${rng.float(.05, .25)})`;
      x.fillRect(i * 2 + rng.int(0, TAM - i * 4 - 1), y + rng.int(0, 6), 1, 1);
    }
  }
  return paraTextura(c);
}

// ---------- tocha (2 quadros de chama) ----------
export function quadrosTocha() {
  const quadros = [];
  for (let f = 0; f < 4; f++) {
    const rng = criarRng(100 + f);
    const { c, x } = novoCanvas(16, 24);
    // suporte de ferro
    x.fillStyle = '#2A2622'; x.fillRect(6, 14, 4, 10);
    x.fillStyle = '#453E36'; x.fillRect(6, 14, 1, 10);
    x.fillStyle = '#5A4632'; x.fillRect(5, 11, 6, 4);
    // chama, camadas de fora pra dentro
    const camadas = [
      { cor: 'rgba(255,90,20,.55)', larg: 8, alt: 13 },
      { cor: '#FF7A28', larg: 6, alt: 11 },
      { cor: '#FFB03A', larg: 4, alt: 8 },
      { cor: '#FFE9A0', larg: 2, alt: 5 },
    ];
    for (const cam of camadas) {
      x.fillStyle = cam.cor;
      for (let y = 0; y < cam.alt; y++) {
        const t = y / cam.alt;
        const w = Math.max(1, Math.round(cam.larg * (1 - t * t) + (rng.chance(.4) ? 1 : 0)));
        const cx = 8 + rng.int(-1, 1) * (t > .4 ? 1 : 0);
        x.fillRect(cx - (w >> 1), 13 - y, w, 1);
      }
    }
    // fagulhas
    for (let i = 0; i < 3; i++) {
      x.fillStyle = '#FFD070';
      x.fillRect(rng.int(4, 11), rng.int(0, 5), 1, 1);
    }
    quadros.push(paraTextura(c));
  }
  return quadros;
}

// ---------- pedestal de item ----------
export function texturaPedestal() {
  const { c, x } = novoCanvas(32, 32);
  const rng = criarRng(77);
  x.fillStyle = '#3A362E'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 300; i++) {
    x.fillStyle = mexerCor('#3A362E', rng.int(-14, 16));
    x.fillRect(rng.int(0, 31), rng.int(0, 31), 1, 1);
  }
  x.fillStyle = '#E3B23C';
  x.fillRect(0, 6, 32, 2);
  x.fillStyle = '#8A6A1E';
  x.fillRect(0, 8, 32, 1);
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.fillRect(0, 24, 32, 8);
  return paraTextura(c);
}

// ---------- armadilhas ----------
// A placa dos espinhos tem que ser LEGÍVEL de longe e diferente do
// chão comum: metal escuro, rebites nos cantos e nove furos alinhados
// por onde os ferros saem. Quem vê a placa e não para, escolheu passar.
export function texturaPlacaEspinhos() {
  const { c, x } = novoCanvas(32, 32);
  const rng = criarRng(131);
  x.fillStyle = '#2E2A26'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = mexerCor('#2E2A26', rng.int(-10, 14));
    x.fillRect(rng.int(0, 31), rng.int(0, 31), 1, 1);
  }
  // moldura e rebites
  x.fillStyle = '#514A40'; x.fillRect(1, 1, 30, 1); x.fillRect(1, 1, 1, 30);
  x.fillStyle = '#171412'; x.fillRect(1, 30, 30, 1); x.fillRect(30, 1, 1, 30);
  for (const [rx, ry] of [[3, 3], [28, 3], [3, 28], [28, 28]]) {
    x.fillStyle = '#6A6154'; x.fillRect(rx, ry, 2, 2);
    x.fillStyle = '#171412'; x.fillRect(rx + 1, ry + 1, 1, 1);
  }
  // furos por onde os espinhos sobem
  for (let fy = 0; fy < 3; fy++) {
    for (let fx = 0; fx < 3; fx++) {
      const px = 7 + fx * 9, py = 7 + fy * 9;
      x.fillStyle = '#0A0908'; x.fillRect(px, py, 4, 4);
      x.fillStyle = '#141110'; x.fillRect(px, py, 4, 1);
    }
  }
  // mancha de ferrugem: já feriu alguém antes de você
  x.fillStyle = 'rgba(120,40,26,.30)';
  for (let i = 0; i < 40; i++) x.fillRect(rng.int(4, 27), rng.int(4, 27), rng.int(1, 3), 1);
  return paraTextura(c);
}

// Grelha do jato de fogo: fendas fundas e brasa viva no fundo, para a
// placa se distinguir da dos espinhos sem depender de cor de aviso.
export function texturaGrelhaFogo() {
  const { c, x } = novoCanvas(32, 32);
  const rng = criarRng(211);
  x.fillStyle = '#241F1B'; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 240; i++) {
    x.fillStyle = mexerCor('#241F1B', rng.int(-8, 16));
    x.fillRect(rng.int(0, 31), rng.int(0, 31), 1, 1);
  }
  x.fillStyle = '#4A4038'; x.fillRect(1, 1, 30, 1); x.fillRect(1, 1, 1, 30);
  x.fillStyle = '#120F0D'; x.fillRect(1, 30, 30, 1); x.fillRect(30, 1, 1, 30);
  for (let i = 0; i < 5; i++) {
    const py = 5 + i * 5;
    x.fillStyle = '#0A0806'; x.fillRect(5, py, 22, 3);
    x.fillStyle = '#7A2E0C'; x.fillRect(5, py + 1, 22, 1);
    for (let k = 0; k < 6; k++) {
      x.fillStyle = rng.chance(0.5) ? '#E8873A' : '#FFB03A';
      x.fillRect(rng.int(5, 26), py + 1, 1, 1);
    }
  }
  return paraTextura(c);
}

// Lodo: verde doente com bolhas. Sem contorno definido — é poça, não
// tapete —, então a borda desfia em pontos cada vez mais raros.
export function texturaLodo() {
  const { c, x } = novoCanvas(64, 64);
  const rng = criarRng(307);
  const cx = 32, cy = 32;
  for (let y = 0; y < 64; y++) {
    for (let px = 0; px < 64; px++) {
      const d = Math.hypot(px - cx, y - cy) / 30;
      if (d > 1) continue;
      if (d > 0.72 && !rng.chance(1 - (d - 0.72) / 0.28)) continue;
      const t = rng.int(-16, 18);
      x.fillStyle = mexerCor(d > 0.55 ? '#3E5A22' : '#5A7A28', t);
      x.fillRect(px, y, 1, 1);
    }
  }
  // bolhas
  for (let i = 0; i < 26; i++) {
    const ang = rng.float(0, 6.28), r = rng.float(0, 25);
    const px = Math.round(cx + Math.cos(ang) * r), py = Math.round(cy + Math.sin(ang) * r);
    const s = rng.int(2, 4);
    x.fillStyle = '#8ABF3A'; x.fillRect(px, py, s, s);
    x.fillStyle = '#C8F06A'; x.fillRect(px, py, s, 1);
  }
  const t = paraTextura(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export { paraTextura, novoCanvas, mexerCor };
