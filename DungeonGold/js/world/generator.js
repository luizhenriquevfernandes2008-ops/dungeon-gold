// ============================================================
// Geração procedural da masmorra.
//
// Algoritmo: salas retangulares espalhadas sem sobreposição,
// ligadas por corredores em L na ordem do vizinho mais próximo
// (isso evita o "polvo" de corredores que sai de uma sala só),
// mais algumas ligações extras para criar voltas — masmorra em
// árvore pura é chata, o jogador sempre refaz o mesmo caminho.
//
// Valores da grade:
//   0 = maciço   1 = chão   2 = porta   3 = escada de descida
// ============================================================

import { criarRng } from '../core/rng.js';

export const VAZIO = 0, CHAO = 1, PORTA = 2, ESCADA = 3;

const TIPOS_SALA = {
  INICIO: 'inicio',
  COMBATE: 'combate',
  ITEM: 'item',
  TESOURO: 'tesouro',
  CHEFE: 'chefe',
  SAIDA: 'saida',
  LOJA: 'loja',
  PORTAL: 'portal',
};

// Chaves coloridas, na ordem em que são atribuídas.
export const CORES_CHAVE = [
  { id: 'ouro',   nome: 'dourada',   corHex: '#E3B23C', cor: 0xE3B23C },
  { id: 'safira', nome: 'de safira', corHex: '#5A9AE0', cor: 0x5A9AE0 },
  { id: 'rubi',   nome: 'de rubi',   corHex: '#C4322A', cor: 0xC4322A },
];

// Inundação a partir de uma célula, tratando uma lista de células como
// intransponíveis. Devolve o mapa de visitados — é com ele que se prova
// que trancar uma porta não isola a saída.
function alcancarDe(grade, L, A, em, x0, y0, bloqueios = []) {
  const vis = new Uint8Array(L * A);
  const bloq = new Set(bloqueios.map(b => b.x + b.y * L));
  const fila = [[x0, y0]];
  vis[em(x0, y0)] = 1;
  while (fila.length) {
    const [x, y] = fila.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L || ny >= A) continue;
      const i = em(nx, ny);
      if (vis[i] || grade[i] === VAZIO || bloq.has(i)) continue;
      vis[i] = 1;
      fila.push([nx, ny]);
    }
  }
  return vis;
}

/**
 * Arena do chefe final: UMA sala, e nada mais.
 *
 * O andar final não passa pelo gerador normal de propósito. Corredor,
 * porta, tesouro e armadilha diluem a única luta que importa — e pior,
 * dão onde se esconder. Aqui é um salão fechado, sem saída e sem
 * quina para trapacear: o jogador entra por uma ponta, ele espera na
 * outra, e o espaço é grande o bastante para os dois circularem.
 */
export function gerarArenaChefe(andar, semente, cfg) {
  const rng = criarRng(semente);
  const d = cfg.dungeon;

  const W = d.arenaLargura ?? 26, A = d.arenaAltura ?? 26;
  const L = W + 6, ALT = A + 6;
  const grade = new Uint8Array(L * ALT);
  const em = (x, y) => x + y * L;

  const sala = { id: 0, x: 3, y: 3, w: W, h: A, cx: (3 + W / 2) | 0, cy: (3 + A / 2) | 0, tipo: 'chefe' };
  for (let y = sala.y; y < sala.y + sala.h; y++)
    for (let x = sala.x; x < sala.x + sala.w; x++) grade[em(x, y)] = CHAO;

  // Cantos chanfrados: um retângulo puro lê como caixa. Cortar as
  // quinas dá silhueta de arena e ainda tira o canto onde dava para
  // encostar e ficar fora do alcance de metade dos ataques.
  const corte = Math.round(Math.min(W, A) * 0.22);
  for (let i = 0; i < corte; i++) {
    for (let k = 0; k < corte - i; k++) {
      grade[em(sala.x + i, sala.y + k)] = VAZIO;
      grade[em(sala.x + W - 1 - i, sala.y + k)] = VAZIO;
      grade[em(sala.x + i, sala.y + A - 1 - k)] = VAZIO;
      grade[em(sala.x + W - 1 - i, sala.y + A - 1 - k)] = VAZIO;
    }
  }

  // Jogador entra por uma borda, o chefe fica no CENTRO. Antes ele
  // ficava na borda oposta e a entrada virava uma caminhada de doze
  // segundos até um pontinho no fundo. Do centro ele domina a arena e
  // já está à distância de leitura assim que você entra.
  const inicio = { ...sala, cx: sala.cx, cy: sala.y + 2 };
  const saida = { ...sala, cx: sala.cx, cy: sala.cy };

  // Tochas só na parede, viradas para dentro — a arena precisa ser
  // vista, não explorada.
  const tochas = [];
  for (let x = sala.x + 2; x < sala.x + W - 2; x += 4) {
    if (grade[em(x, sala.y)] !== VAZIO) tochas.push({ x, y: sala.y, dx: 0, dy: -1, rot: 0 });
    if (grade[em(x, sala.y + A - 1)] !== VAZIO) tochas.push({ x, y: sala.y + A - 1, dx: 0, dy: 1, rot: Math.PI });
  }
  for (let y = sala.y + 3; y < sala.y + A - 3; y += 4) {
    if (grade[em(sala.x, y)] !== VAZIO) tochas.push({ x: sala.x, y, dx: -1, dy: 0, rot: -Math.PI / 2 });
    if (grade[em(sala.x + W - 1, y)] !== VAZIO) tochas.push({ x: sala.x + W - 1, y, dx: 1, dy: 0, rot: Math.PI / 2 });
  }

  return {
    andar, semente, ehArena: true,
    grade, largura: L, altura: ALT,
    salas: [sala], arestas: [], portas: [], tochas, chaves: [], armadilhas: [],
    inicio, saida, ehChefe: true, em,
    tipoEm(x, y) {
      if (x < 0 || y < 0 || x >= L || y >= ALT) return VAZIO;
      return grade[x + y * L];
    },
    solido(x, y) { return this.tipoEm(x, y) === VAZIO; },
  };
}

export function gerarMasmorra(andar, semente, cfg) {
  const rng = criarRng(semente);
  const d = cfg.dungeon;

  const lado = Math.min(d.gradeMax, d.gradeMin + Math.floor(andar * 1.6));
  const L = lado, A = lado;
  const grade = new Uint8Array(L * A);
  const em = (x, y) => x + y * L;

  const alvoSalas = Math.min(
    d.salasMax,
    Math.round(d.salasMin + andar * d.salasPorAndarExtra)
  );

  // ---------- salas ----------
  const salas = [];
  let tentativas = 0;
  while (salas.length < alvoSalas && tentativas < 400) {
    tentativas++;
    const w = rng.int(d.tamanhoSalaMin, d.tamanhoSalaMax);
    const h = rng.int(d.tamanhoSalaMin, d.tamanhoSalaMax);
    const x = rng.int(2, L - w - 3);
    const y = rng.int(2, A - h - 3);
    const nova = { x, y, w, h, cx: (x + w / 2) | 0, cy: (y + h / 2) | 0 };
    // margem de 2 células entre salas, senão vira um salão só
    const colide = salas.some(s =>
      x - 2 < s.x + s.w && x + w + 2 > s.x && y - 2 < s.y + s.h && y + h + 2 > s.y);
    if (colide) continue;
    nova.id = salas.length;
    salas.push(nova);
  }

  if (salas.length < 2) {
    // Segurança: masmorra degenerada. Cria duas salas fixas.
    salas.length = 0;
    salas.push({ id: 0, x: 3, y: 3, w: 7, h: 7, cx: 6, cy: 6 });
    salas.push({ id: 1, x: L - 12, y: A - 12, w: 7, h: 7, cx: L - 9, cy: A - 9 });
  }

  for (const s of salas)
    for (let y = s.y; y < s.y + s.h; y++)
      for (let x = s.x; x < s.x + s.w; x++) grade[em(x, y)] = CHAO;

  // ---------- corredores ----------
  // Corredor largo (2 células) é o que separa uma gruta de uma cripta:
  // a mesma planta baixa vira caverna ou catacumba só pela largura.
  const largo = !!d.corredorLargo;
  const cavarCelula = (x, y) => {
    if (x < 1 || y < 1 || x >= L - 1 || y >= A - 1) return;
    if (grade[em(x, y)] === VAZIO) grade[em(x, y)] = CHAO;
  };
  const cavarH = (x1, x2, y) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      cavarCelula(x, y);
      if (largo) cavarCelula(x, y + 1);
    }
  };
  const cavarV = (y1, y2, x) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      cavarCelula(x, y);
      if (largo) cavarCelula(x + 1, y);
    }
  };
  const ligar = (a, b) => {
    if (rng.chance(0.5)) { cavarH(a.cx, b.cx, a.cy); cavarV(a.cy, b.cy, b.cx); }
    else { cavarV(a.cy, b.cy, a.cx); cavarH(a.cx, b.cx, b.cy); }
  };

  // vizinho mais próximo ainda não ligado
  const naoLigadas = salas.slice(1);
  let atual = salas[0];
  const ligadas = [atual];
  const arestas = [];
  while (naoLigadas.length) {
    let melhor = 0, melhorD = Infinity;
    naoLigadas.forEach((s, i) => {
      const dd = (s.cx - atual.cx) ** 2 + (s.cy - atual.cy) ** 2;
      if (dd < melhorD) { melhorD = dd; melhor = i; }
    });
    const prox = naoLigadas.splice(melhor, 1)[0];
    ligar(atual, prox);
    arestas.push([atual.id, prox.id]);
    ligadas.push(prox);
    atual = prox;
  }
  // voltas extras
  const extras = Math.max(1, Math.round(salas.length * 0.28));
  for (let i = 0; i < extras; i++) {
    const a = rng.escolher(salas), b = rng.escolher(salas);
    if (a !== b) { ligar(a, b); arestas.push([a.id, b.id]); }
  }

  // ---------- erosão (grutas) ----------
  // Só ADICIONA chão nas bordas: engorda o contorno de forma irregular
  // sem nunca cortar caminho, então a conectividade continua garantida.
  if (d.irregular > 0) {
    const passes = 2;
    for (let p = 0; p < passes; p++) {
      const adicionar = [];
      for (let y = 2; y < A - 2; y++) {
        for (let x = 2; x < L - 2; x++) {
          if (grade[em(x, y)] !== VAZIO) continue;
          let vizinhos = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (grade[em(x + dx, y + dy)] === CHAO) vizinhos++;
          if (vizinhos >= 1 && rng.chance(d.irregular * 0.45)) adicionar.push(em(x, y));
        }
      }
      for (const i of adicionar) grade[i] = CHAO;
    }
  }

  // ---------- pilares ----------
  // Blocos maciços DENTRO das salas, em xadrez. Nunca encostam na borda
  // nem no centro, então não fecham entrada nem cobrem pedestal/escada.
  if (d.pilares > 0) {
    for (const s of salas) {
      if (s.w < 6 || s.h < 6) continue;
      for (let y = s.y + 2; y < s.y + s.h - 2; y += 2) {
        for (let x = s.x + 2; x < s.x + s.w - 2; x += 2) {
          if (Math.abs(x - s.cx) <= 1 && Math.abs(y - s.cy) <= 1) continue;
          if (!rng.chance(d.pilares)) continue;
          grade[em(x, y)] = VAZIO;
        }
      }
    }
  }

  // ---------- tipos de sala ----------
  const inicio = salas[0];
  inicio.tipo = TIPOS_SALA.INICIO;

  let saida = salas[1], maisLonge = -1;
  for (const s of salas) {
    if (s === inicio) continue;
    const dd = (s.cx - inicio.cx) ** 2 + (s.cy - inicio.cy) ** 2;
    if (dd > maisLonge) { maisLonge = dd; saida = s; }
  }
  saida.tipo = TIPOS_SALA.SAIDA;
  grade[em(saida.cx, saida.cy)] = ESCADA;

  const ehChefe = andar > 0 && andar % cfg.dungeon.andarDoChefe === 0;
  const livres = rng.embaralhar(salas.filter(s => !s.tipo));

  if (ehChefe && livres.length) {
    // maior sala livre vira arena
    livres.sort((a, b) => b.w * b.h - a.w * a.h);
    livres[0].tipo = TIPOS_SALA.CHEFE;
    livres.shift();
  }

  // ---------- loja ----------
  // Ela é GARANTIDA nos andares certos, nunca sorteada: o jogador precisa
  // poder contar com ela para decidir se guarda ouro ou gasta agora. Loja
  // que às vezes não aparece transforma economia em loteria.
  if (cfg.loja && andar >= (cfg.loja.andarMin ?? 3)
      && andar % (cfg.loja.cadaAndares ?? 3) === 0 && livres.length) {
    livres.pop().tipo = TIPOS_SALA.LOJA;
  }

  // ---------- sala do portal ----------
  // A porta que leva para fora da masmorra. Não é garantida, mas
  // quando aparece é a coisa mais interessante do andar — por isso
  // ela nasce longe do início: você tem que atravessar o andar para
  // achar, e a essa altura já sabe se está com vida para arriscar.
  if (!cfg.semPortal && andar >= (d.portalAndarMin ?? 2)
      && rng.chance(d.chancePortal ?? 0.42) && livres.length) {
    const longe = livres
      .map(s => ({ s, d: (s.cx - inicio.cx) ** 2 + (s.cy - inicio.cy) ** 2 }))
      .sort((a, b) => b.d - a.d);
    const escolhida = longe[0].s;
    escolhida.tipo = TIPOS_SALA.PORTAL;
    livres.splice(livres.indexOf(escolhida), 1);
  }

  for (let i = 0; i < (d.salasDeItem ?? 2); i++) {
    if (livres.length && rng.chance(d.chanceSalaItem)) livres.pop().tipo = TIPOS_SALA.ITEM;
  }
  if (livres.length && rng.chance(d.chanceSalaTesouro)) livres.pop().tipo = TIPOS_SALA.TESOURO;
  for (const s of livres) s.tipo = TIPOS_SALA.COMBATE;

  // ---------- emboscada ----------
  // Uma sala de combate nasce VAZIA e só cospe a onda quando o jogador
  // entra. O vazio é a pista: numa masmorra em que toda sala tem gente,
  // uma sala grande e silenciosa é aviso suficiente para quem presta
  // atenção — e susto para quem não presta. Nunca na sala inicial nem
  // na do chefe, que já é um evento por si.
  if (andar >= (d.emboscadaAndarMin ?? 2) && rng.chance(d.chanceEmboscada ?? 0.3)) {
    const alvos = salas.filter(s => s.tipo === TIPOS_SALA.COMBATE && s.w * s.h >= 30);
    if (alvos.length) rng.escolher(alvos).emboscada = true;
  }

  // ---------- portas ----------
  // Uma porta precisa de uma GARGANTA: um ponto por onde todo mundo
  // tem de passar. Em corredor de 1 célula é a célula com chão nos dois
  // lados de um eixo e maciço nos outros dois. Em corredor largo isso
  // nunca acontece — por isso os temas de corredor largo ficavam sem
  // porta nenhuma. Aqui a garganta larga é detectada como PAR de
  // células, e o par inteiro vira uma porta dupla que abre junto.
  const portas = [];
  let proxGrupo = 0;
  const ehChao = (x, y) => x >= 0 && y >= 0 && x < L && y < A && grade[em(x, y)] !== VAZIO;
  const usada = new Set();

  for (let y = 1; y < A - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      if (grade[em(x, y)] !== CHAO) continue;
      if (dentroDeSala(salas, x, y)) continue;
      if (usada.has(em(x, y))) continue;

      const n = ehChao(x, y - 1), sul = ehChao(x, y + 1);
      const o = ehChao(x - 1, y), l = ehChao(x + 1, y);

      // garganta estreita
      const horizontal = o && l && !n && !sul;
      const vertical = n && sul && !o && !l;
      if (horizontal || vertical) {
        if (!rng.chance(d.chancePorta ?? 0.14)) continue;
        grade[em(x, y)] = PORTA;
        usada.add(em(x, y));
        portas.push({ x, y, horizontal, grupo: proxGrupo++ });
        continue;
      }

      // garganta larga na horizontal: (x,y) e (x,y+1) formam o vão
      const parH = o && l && !n && sul
        && !ehChao(x, y + 2) && ehChao(x - 1, y + 1) && ehChao(x + 1, y + 1)
        && !dentroDeSala(salas, x, y + 1) && !usada.has(em(x, y + 1));
      if (parH && rng.chance(d.chancePorta ?? 0.14)) {
        const g = proxGrupo++;
        grade[em(x, y)] = PORTA; grade[em(x, y + 1)] = PORTA;
        usada.add(em(x, y)); usada.add(em(x, y + 1));
        portas.push({ x, y, horizontal: true, grupo: g });
        portas.push({ x, y: y + 1, horizontal: true, grupo: g });
        continue;
      }

      // garganta larga na vertical: (x,y) e (x+1,y)
      const parV = n && sul && !o && l
        && !ehChao(x + 2, y) && ehChao(x + 1, y - 1) && ehChao(x + 1, y + 1)
        && !dentroDeSala(salas, x + 1, y) && !usada.has(em(x + 1, y));
      if (parV && rng.chance(d.chancePorta ?? 0.14)) {
        const g = proxGrupo++;
        grade[em(x, y)] = PORTA; grade[em(x + 1, y)] = PORTA;
        usada.add(em(x, y)); usada.add(em(x + 1, y));
        portas.push({ x, y, horizontal: false, grupo: g });
        portas.push({ x: x + 1, y, horizontal: false, grupo: g });
      }
    }
  }

  // ---------- portas trancadas e chaves ----------
  // Regra de ouro: uma porta só é trancada se a saída continuar
  // alcançável mesmo com ela fechada. Isso torna impossível travar a
  // run por falta de chave — no pior caso você perde um tesouro.
  // A chave sempre nasce do lado de cá da porta que ela abre.
  const trancadas = [];
  const chaves = [];
  // trancar age sobre o grupo (porta dupla abre e tranca junto)
  const grupos = [];
  for (const p of portas) {
    (grupos[p.grupo] ||= []).push(p);
  }
  const candidatas = rng.embaralhar(grupos.filter(Boolean));
  const maxTrancas = Math.min(d.maxPortasTrancadas ?? 2, CORES_CHAVE.length);

  for (const grupo of candidatas) {
    if (trancadas.length >= maxTrancas) break;
    const porta = grupo[0];

    // alcance a partir do início ignorando este grupo e os já trancados
    const bloqueios = trancadas.flat().map(t => ({ x: t.x, y: t.y }));
    for (const c of grupo) bloqueios.push({ x: c.x, y: c.y });
    const vis = alcancarDe(grade, L, A, em, inicio.cx, inicio.cy, bloqueios);

    // se a saída ficar inalcançável, esta porta é passagem obrigatória
    if (!vis[em(saida.cx, saida.cy)]) continue;

    // e uma tranca nova não pode prender a chave de uma tranca anterior
    if (chaves.some(c => !vis[em(c.x, c.y)])) continue;

    // só vale trancar se houver algo do OUTRO lado — senão é decoração.
    // Preciso inundar a partir de um vizinho que NÃO esteja no alcance
    // do início; inundar da própria porta vazaria para os dois lados.
    let atras = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = porta.x + dx, ny = porta.y + dy;
      if (nx < 0 || ny < 0 || nx >= L || ny >= A) continue;
      const i = em(nx, ny);
      if (grade[i] === VAZIO || vis[i]) continue;
      const visAtras = alcancarDe(grade, L, A, em, nx, ny, bloqueios);
      atras = visAtras.reduce((n, v) => n + v, 0);
      break;
    }
    if (atras < 8) continue;

    // a chave vai numa sala que esteja DO LADO DE CÁ da porta
    const salasDaqui = salas.filter(s =>
      s !== saida && vis[em(s.cx, s.cy)] && !(s.cx === inicio.cx && s.cy === inicio.cy));
    if (!salasDaqui.length) continue;

    const cor = CORES_CHAVE[trancadas.length];
    const sala = rng.escolher(salasDaqui);
    for (const c of grupo) c.trancada = cor.id;
    trancadas.push(grupo);
    chaves.push({ x: sala.cx, y: sala.cy, ...cor });
  }

  // ---------- armadilhas ----------
  // Nenhuma delas mexe na grade — só ferem quem pisa —, então a prova de
  // conectividade acima continua valendo sem precisar ser refeita.
  // O que importa aqui é o TERRENO: as cíclicas vão para corredor, onde
  // a graça é cronometrar a passagem; as contínuas vão para dentro de
  // sala, onde sempre há espaço para contornar. Nada nasce na sala
  // inicial, em cima de porta, escada, chave ou centro de sala especial.
  const armadilhas = [];
  const dens = cfg.armadilhas?.densidade;
  if (dens && cfg.armadilhas.tipos?.length) {
    const alvo = Math.min(dens.teto, Math.round(dens.base + andar * dens.porAndar));
    const disponiveis = cfg.armadilhas.tipos.filter(t => andar >= (t.andarMin ?? 1));

    const reservado = new Set();
    reservado.add(em(saida.cx, saida.cy));
    for (const c of chaves) reservado.add(em(c.x, c.y));
    for (const s of salas) if (s.tipo !== TIPOS_SALA.COMBATE) reservado.add(em(s.cx, s.cy));
    // duas células de folga ao redor de cada porta: armadilha escondida
    // atrás de uma folha que acabou de abrir não dá tempo de reação
    for (const p of portas)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) reservado.add(em(p.x + dx, p.y + dy));

    const emCorredor = [], emSala = [];
    for (let y = 1; y < A - 1; y++) {
      for (let x = 1; x < L - 1; x++) {
        const i = em(x, y);
        if (grade[i] !== CHAO || reservado.has(i)) continue;
        const sala = salaEm(salas, x, y);
        if (sala) {
          if (sala.tipo === TIPOS_SALA.INICIO) continue;
          // longe da borda, para nunca formar um tampão na entrada da sala
          if (x <= sala.x || x >= sala.x + sala.w - 1) continue;
          if (y <= sala.y || y >= sala.y + sala.h - 1) continue;
          emSala.push({ x, y });
        } else {
          emCorredor.push({ x, y });
        }
      }
    }

    const sacos = { corredor: rng.embaralhar(emCorredor), sala: rng.embaralhar(emSala) };
    const longeDasOutras = (x, y, dmin) =>
      !armadilhas.some(a => Math.abs(a.x - x) + Math.abs(a.y - y) < dmin);

    for (let n = 0; n < alvo; n++) {
      const tipo = rng.ponderado(disponiveis);
      if (!tipo) break;
      const saco = sacos[tipo.onde] || sacos.corredor;
      let posto = null;
      while (saco.length) {
        const c = saco.pop();
        if (longeDasOutras(c.x, c.y, tipo.onde === 'sala' ? 7 : 4)) { posto = c; break; }
      }
      if (!posto) continue;
      armadilhas.push({
        x: posto.x, y: posto.y,
        tipo: tipo.id,
        // cada uma entra no ciclo em momento próprio: um corredor cheio de
        // espinhos disparando em uníssono viraria um portão binário
        fase: rng.float(0, tipo.ciclo ?? 1),
      });
    }
  }

  // ---------- tochas ----------
  // Uma tocha a cada ~5 células de parede voltada para o chão.
  const tochas = [];
  const ocupado = new Set();
  for (let y = 1; y < A - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      if (grade[em(x, y)] === VAZIO) continue;
      const dirs = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]];
      for (const [dx, dy, rot] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (grade[em(nx, ny)] !== VAZIO) continue;
        const chave = `${nx},${ny},${dx},${dy}`;
        if (ocupado.has(chave)) continue;
        if (!rng.chance(d.densidadeTocha ?? 0.11)) continue;
        // evita aglomerado
        let perto = false;
        for (const t of tochas) {
          if (Math.abs(t.x - x) + Math.abs(t.y - y) < 4) { perto = true; break; }
        }
        if (perto) continue;
        ocupado.add(chave);
        tochas.push({ x, y, dx, dy, rot });
      }
    }
  }

  return {
    andar,
    semente,
    grade, largura: L, altura: A,
    salas, arestas, portas, tochas, chaves, armadilhas,
    inicio, saida,
    ehChefe,
    em,
    tipoEm(x, y) {
      if (x < 0 || y < 0 || x >= L || y >= A) return VAZIO;
      return grade[x + y * L];
    },
    solido(x, y) {
      const t = this.tipoEm(x, y);
      return t === VAZIO;
    },
  };
}

function dentroDeSala(salas, x, y) {
  return !!salaEm(salas, x, y);
}

function salaEm(salas, x, y) {
  return salas.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) || null;
}

export { TIPOS_SALA };
