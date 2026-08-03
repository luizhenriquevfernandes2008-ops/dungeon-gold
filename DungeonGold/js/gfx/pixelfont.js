// ============================================================
// Fonte de bitmap 5x7 feita à mão.
// Toda a interface do jogo usa isso — nenhuma webfont dentro
// da HUD, porque texto antisserrilhado destruiria o pixel.
// ============================================================

const G = {
  'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
  'C': '.####|#....|#....|#....|#....|#....|.####',
  'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
  'E': '#####|#....|#....|####.|#....|#....|#####',
  'F': '#####|#....|#....|####.|#....|#....|#....',
  'G': '.####|#....|#....|#.###|#...#|#...#|.####',
  'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  'I': '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  'J': '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  'L': '#....|#....|#....|#....|#....|#....|#####',
  'M': '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  'P': '####.|#...#|#...#|####.|#....|#....|#....',
  'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  'S': '.####|#....|#....|.###.|....#|....#|####.',
  'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  'W': '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '%': '#...#|#..#.|...#.|..#..|.#...|.#..#|#...#',
  '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  ':': '.....|..#..|.....|.....|.....|..#..|.....',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.....|..#..',
  ',': '.....|.....|.....|.....|.....|..#..|.#...',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

const CACHE = new Map();
function grade(ch) {
  if (!CACHE.has(ch)) CACHE.set(ch, (G[ch] || G['?']).split('|'));
  return CACHE.get(ch);
}

export const LARGURA_GLIFO = 5;
export const ALTURA_GLIFO = 7;

/**
 * Escreve texto em pixel art.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} texto
 * @param {number} x posição esquerda (em pixels do canvas)
 * @param {number} y posição do topo
 * @param {object} op { escala, cor, contorno, sombra, espaco, alinhar }
 */
export function escrever(ctx, texto, x, y, op = {}) {
  const escala = op.escala ?? 1;
  const cor = op.cor ?? '#D8CBB0';
  const espaco = op.espaco ?? 1;
  const passo = (LARGURA_GLIFO + espaco) * escala;
  const t = String(texto).toUpperCase();

  if (op.alinhar === 'direita') x -= larguraTexto(t, escala, espaco);
  else if (op.alinhar === 'centro') x -= (larguraTexto(t, escala, espaco) / 2) | 0;

  // contorno preto: desenha o glifo deslocado nas 8 direções
  if (op.contorno) {
    ctx.fillStyle = op.contorno === true ? '#000' : op.contorno;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        desenharLinha(ctx, t, x + dx * escala, y + dy * escala, escala, espaco, passo);
      }
  }
  if (op.sombra) {
    ctx.fillStyle = op.sombra === true ? 'rgba(0,0,0,.55)' : op.sombra;
    desenharLinha(ctx, t, x + escala, y + escala, escala, espaco, passo);
  }

  ctx.fillStyle = cor;
  desenharLinha(ctx, t, x, y, escala, espaco, passo);

  // brilho no topo dos glifos (dá o "metal quente" dos números do Doom)
  if (op.brilho) {
    ctx.fillStyle = op.brilho;
    for (let i = 0; i < t.length; i++) {
      const g = grade(t[i]);
      for (let cx = 0; cx < LARGURA_GLIFO; cx++) {
        if (g[0][cx] === '#') ctx.fillRect(x + i * passo + cx * escala, y, escala, escala);
      }
    }
  }
  return larguraTexto(t, escala, espaco);
}

function desenharLinha(ctx, t, x, y, escala, espaco, passo) {
  for (let i = 0; i < t.length; i++) {
    const g = grade(t[i]);
    const ox = x + i * passo;
    for (let ry = 0; ry < ALTURA_GLIFO; ry++) {
      const linha = g[ry];
      for (let rx = 0; rx < LARGURA_GLIFO; rx++) {
        if (linha[rx] === '#') ctx.fillRect(ox + rx * escala, y + ry * escala, escala, escala);
      }
    }
  }
}

export function larguraTexto(texto, escala = 1, espaco = 1) {
  const n = String(texto).length;
  if (!n) return 0;
  return n * (LARGURA_GLIFO + espaco) * escala - espaco * escala;
}

/** Máscara booleana de um caractere — usada pelo título em voxels. */
export function mascaraGlifo(ch) {
  return grade(String(ch).toUpperCase()).map(l => l.split('').map(c => c === '#'));
}
