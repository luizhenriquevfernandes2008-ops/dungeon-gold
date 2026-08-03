// ============================================================
// HUD — barra de 320x32 desenhada pixel a pixel, com a mesma
// divisão de blocos do DOOM: recurso · vida · painel de relíquias
// · rosto · armadura · chaves · tabela.
//
// O rosto é desenhado por código e reage: a expressão fecha
// conforme a vida cai, aparece sangue, e ele olha para o lado de
// onde veio o último dano.
// ============================================================

import { escrever, larguraTexto } from '../gfx/pixelfont.js';

const W = 320, H = 32;

const COR = {
  numero: '#C81E1E',
  numeroTopo: '#FF5A3C',
  rotulo: '#C8B48A',
  rotuloApagado: '#5A5044',
  ouro: '#E3B23C',
  metal1: '#8A8478',
  metal2: '#5E594F',
  metal3: '#3A362F',
  metal4: '#22201B',
};

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tempo = 0;
    this.olhar = 0;          // -1 esquerda, 0 frente, 1 direita
    this.tempoOlhar = 0;
    this.piscar = 0;
    this.caretaDano = 0;     // careta momentânea ao apanhar
    this.vidaAnterior = null;
    this.fundo = this._montarFundo();
  }

  // O fundo de metal não muda: desenho uma vez e reaproveito.
  _montarFundo() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;

    // chapa base com granulado
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COR.metal1);
    g.addColorStop(0.18, COR.metal2);
    g.addColorStop(0.72, COR.metal3);
    g.addColorStop(1, COR.metal4);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);

    for (let i = 0; i < 2600; i++) {
      const px = (Math.random() * W) | 0, py = (Math.random() * H) | 0;
      const v = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.10)';
      x.fillStyle = v;
      x.fillRect(px, py, 1, 1);
    }

    // linha de luz no topo e sombra na base
    x.fillStyle = '#A9A297'; x.fillRect(0, 0, W, 1);
    x.fillStyle = '#15130F'; x.fillRect(0, H - 1, W, 1);

    // divisórias entre blocos + rebites
    const divisorias = [50, 104, 150, 182, 236, 252];
    for (const d of divisorias) {
      x.fillStyle = '#1B1915'; x.fillRect(d, 2, 1, H - 4);
      x.fillStyle = '#6E695E'; x.fillRect(d + 1, 2, 1, H - 4);
    }
    for (let rx = 4; rx < W; rx += 26) {
      x.fillStyle = '#9A9488'; x.fillRect(rx, 2, 2, 2);
      x.fillStyle = '#2A2721'; x.fillRect(rx, 4, 2, 1);
    }
    return c;
  }

  _numeroGrande(ctx, valor, direitaX, y, cor = COR.numero) {
    escrever(ctx, String(valor), direitaX, y, {
      escala: 2, espaco: 1, cor,
      contorno: '#1A0606',
      brilho: COR.numeroTopo,
      alinhar: 'direita',
    });
  }

  _rotulo(ctx, txt, x, y, aceso = true) {
    escrever(ctx, txt, x, y, { escala: 1, cor: aceso ? COR.rotulo : COR.rotuloApagado, sombra: true });
  }

  // ---------- rosto ----------
  _rosto(ctx, ox, oy, e) {
    const pctVida = Math.max(0, e.vida / e.vidaMax);
    const ferido = 1 - pctVida;

    // moldura afundada
    ctx.fillStyle = '#15130F'; ctx.fillRect(ox - 2, oy - 1, 28, 30);
    ctx.fillStyle = '#3A362F'; ctx.fillRect(ox - 1, oy, 26, 28);

    // cabelo
    ctx.fillStyle = '#6E4A22'; ctx.fillRect(ox + 2, oy + 1, 20, 6);
    ctx.fillStyle = '#8A5E2A'; ctx.fillRect(ox + 2, oy + 1, 20, 2);
    ctx.fillStyle = '#4A2E12'; ctx.fillRect(ox + 2, oy + 6, 20, 1);

    // rosto
    const pele = pctVida > 0.35 ? '#D8A070' : '#C08858';
    ctx.fillStyle = pele; ctx.fillRect(ox + 3, oy + 7, 18, 18);
    ctx.fillStyle = '#B07E50'; ctx.fillRect(ox + 3, oy + 22, 18, 3);   // queixo em sombra
    ctx.fillStyle = '#EAC090'; ctx.fillRect(ox + 5, oy + 8, 14, 2);    // testa iluminada

    // sobrancelhas — quanto mais ferido, mais fechadas
    const inclina = Math.round(ferido * 2);
    ctx.fillStyle = '#4A2E12';
    ctx.fillRect(ox + 5, oy + 10 + inclina, 5, 2);
    ctx.fillRect(ox + 14, oy + 10 + inclina, 5, 2);

    // olhos
    const piscando = this.piscar > 0;
    ctx.fillStyle = '#F0E8DC';
    if (!piscando) {
      ctx.fillRect(ox + 5, oy + 13, 5, 3);
      ctx.fillRect(ox + 14, oy + 13, 5, 3);
      ctx.fillStyle = '#20180F';
      const dx = this.olhar;
      ctx.fillRect(ox + 7 + dx, oy + 13, 2, 3);
      ctx.fillRect(ox + 16 + dx, oy + 13, 2, 3);
    } else {
      ctx.fillStyle = '#8A6038';
      ctx.fillRect(ox + 5, oy + 14, 5, 1);
      ctx.fillRect(ox + 14, oy + 14, 5, 1);
    }

    // nariz e boca
    ctx.fillStyle = '#B07E50'; ctx.fillRect(ox + 11, oy + 15, 2, 4);
    ctx.fillStyle = '#5A2A20';
    if (pctVida > 0.6) ctx.fillRect(ox + 8, oy + 21, 8, 1);
    else if (pctVida > 0.25) { ctx.fillRect(ox + 7, oy + 20, 10, 2); ctx.fillStyle = '#F0E8DC'; ctx.fillRect(ox + 8, oy + 20, 8, 1); }
    else { ctx.fillRect(ox + 6, oy + 19, 12, 4); ctx.fillStyle = '#F0E8DC'; ctx.fillRect(ox + 7, oy + 20, 10, 1); }

    // ---- estágios de ferimento ----
    // Cinco faixas, como no Doom. Cada faixa ADICIONA marcas às
    // anteriores, então o rosto vai apanhando de forma cumulativa:
    // corte → roxo no olho → sangue escorrendo → rosto inchado.
    const faixa = pctVida > 0.8 ? 0
                : pctVida > 0.6 ? 1
                : pctVida > 0.4 ? 2
                : pctVida > 0.2 ? 3 : 4;

    // 1) corte na sobrancelha direita
    if (faixa >= 1) {
      ctx.fillStyle = '#8E1010';
      ctx.fillRect(ox + 16, oy + 9, 3, 1);
      ctx.fillStyle = '#B41A1A';
      ctx.fillRect(ox + 17, oy + 10, 1, 3);
    }

    // 2) olho esquerdo roxo e inchado + lábio cortado
    if (faixa >= 2) {
      ctx.fillStyle = '#5E2A46';
      ctx.fillRect(ox + 4, oy + 12, 7, 5);
      ctx.fillStyle = '#7A3A55';
      ctx.fillRect(ox + 4, oy + 12, 7, 1);
      if (!piscando) {
        ctx.fillStyle = '#C8B8A8';                 // olho abafado pelo inchaço
        ctx.fillRect(ox + 5, oy + 14, 5, 2);
        ctx.fillStyle = '#20180F';
        ctx.fillRect(ox + 7 + this.olhar, oy + 14, 2, 2);
      }
      ctx.fillStyle = '#9E1414';
      ctx.fillRect(ox + 13, oy + 21, 4, 1);
    }

    // 3) sangue escorrendo da testa e do canto da boca
    if (faixa >= 3) {
      ctx.fillStyle = '#A81616';
      ctx.fillRect(ox + 8, oy + 7, 2, 6);
      ctx.fillRect(ox + 9, oy + 13, 1, 4);
      ctx.fillRect(ox + 17, oy + 13, 1, 6);
      ctx.fillStyle = '#7A0E0E';
      ctx.fillRect(ox + 15, oy + 22, 3, 4);        // escorre do queixo
      ctx.fillStyle = '#5E2A46';
      ctx.fillRect(ox + 18, oy + 16, 3, 4);        // hematoma na bochecha
    }

    // 4) quase morto: pele acinzentada, rosto tomado, olhos fundos
    if (faixa >= 4) {
      ctx.fillStyle = 'rgba(120,26,20,.34)';
      ctx.fillRect(ox + 3, oy + 7, 18, 18);
      ctx.fillStyle = '#C21C1C';
      ctx.fillRect(ox + 4, oy + 19, 3, 5);
      ctx.fillRect(ox + 11, oy + 24, 7, 2);
      ctx.fillRect(ox + 6, oy + 8, 3, 3);
      ctx.fillStyle = '#4A1A12';                   // olheiras
      ctx.fillRect(ox + 5, oy + 17, 5, 1);
      ctx.fillRect(ox + 14, oy + 17, 5, 1);
    }

    // careta ao levar dano agora: sobrancelhas travam e a boca abre
    if (this.caretaDano > 0) {
      ctx.fillStyle = '#3A2008';
      ctx.fillRect(ox + 5, oy + 11, 6, 2);
      ctx.fillRect(ox + 14, oy + 11, 6, 2);
      ctx.fillStyle = '#4A1810';
      ctx.fillRect(ox + 7, oy + 19, 10, 4);
      ctx.fillStyle = '#F0E8DC';
      ctx.fillRect(ox + 8, oy + 19, 8, 1);
    }
    if (e.morto) {
      ctx.fillStyle = 'rgba(140,10,10,.45)';
      ctx.fillRect(ox + 3, oy + 7, 18, 18);
    }
  }

  // ---------- painel de relíquias (o "ARMS" do Doom) ----------
  _reliquias(ctx, ox, oy, e) {
    const total = 6;
    for (let i = 0; i < total; i++) {
      const col = i % 3, lin = (i / 3) | 0;
      const x = ox + col * 14;
      const y = oy + lin * 12;
      const aceso = i < e.reliquias;
      escrever(ctx, String(i + 2), x, y, {
        escala: 1,
        cor: aceso ? COR.ouro : COR.rotuloApagado,
        sombra: true,
      });
    }
  }

  desenhar(e, dt = 0) {
    const ctx = this.ctx;
    this.tempo += dt;

    // olhar/piscar do rosto
    this.tempoOlhar -= dt;
    if (this.tempoOlhar <= 0) {
      this.tempoOlhar = 0.6 + Math.random() * 1.6;
      this.olhar = [-1, 0, 0, 1][(Math.random() * 4) | 0];
      if (Math.random() < 0.3) this.piscar = 0.12;
    }
    this.piscar = Math.max(0, this.piscar - dt);
    if (e.dirDano !== undefined && e.dirDano !== null) this.olhar = e.dirDano;

    // careta: dispara toda vez que a vida cai
    if (this.vidaAnterior !== null && e.vida < this.vidaAnterior) this.caretaDano = 0.5;
    this.vidaAnterior = e.vida;
    this.caretaDano = Math.max(0, this.caretaDano - dt);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.fundo, 0, 0);

    // barra fina de estamina no topo
    const est = Math.max(0, Math.min(1, e.estamina / e.estaminaMax));
    ctx.fillStyle = '#241F19'; ctx.fillRect(0, 1, W, 2);
    ctx.fillStyle = e.guardaQuebrada ? '#C22018' : (est > 0.25 ? COR.ouro : '#B0501C');
    ctx.fillRect(0, 1, Math.round(W * est), 2);

    // 1. poções (o "ammo" grande da esquerda)
    this._numeroGrande(ctx, e.pocoes, 46, 8);
    this._rotulo(ctx, 'POCOES', 46 - larguraTexto('POCOES', 1), 24);

    // 2. vida
    const corVida = e.vida / e.vidaMax < 0.3 ? '#FF3A2A' : COR.numero;
    this._numeroGrande(ctx, `${Math.max(0, Math.round(e.vida))}%`, 100, 8, corVida);
    this._rotulo(ctx, 'VIDA', 100 - larguraTexto('VIDA', 1), 24);

    // 3. relíquias
    this._reliquias(ctx, 110, 6, e);

    // 4. rosto
    this._rosto(ctx, 154, 2, e);

    // 5. armadura
    this._numeroGrande(ctx, `${e.armaduraPct}%`, 232, 8, COR.numero);
    this._rotulo(ctx, 'ARMAD', 232 - larguraTexto('ARMAD', 1), 24);

    // 6. chaves
    const chaves = [
      { cor: '#E3B23C', tem: e.chaves?.ouro },
      { cor: '#5A9AE0', tem: e.chaves?.safira },
      { cor: '#C4322A', tem: e.chaves?.rubi },
    ];
    chaves.forEach((k, i) => {
      const y = 4 + i * 9;
      ctx.fillStyle = '#15130F'; ctx.fillRect(239, y, 10, 7);
      ctx.fillStyle = k.tem ? k.cor : '#33302A';
      ctx.fillRect(240, y + 1, 8, 5);
      if (k.tem) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(240, y + 1, 8, 1); }
    });

    // 7. tabela
    const linhas = [
      ['OURO', e.ouro, e.ouroCofre],
      ['ABAT', e.abates, e.abatesTotal],
      ['ANDR', e.andar, e.recorde],
    ];
    linhas.forEach((l, i) => {
      const y = 4 + i * 9;
      this._rotulo(ctx, l[0], 256, y);
      escrever(ctx, String(l[1]), 296, y, { escala: 1, cor: COR.ouro, alinhar: 'direita', sombra: true });
      escrever(ctx, '/', 298, y, { escala: 1, cor: COR.rotuloApagado });
      escrever(ctx, String(l[2]), 318, y, { escala: 1, cor: COR.rotulo, alinhar: 'direita', sombra: true });
    });
  }
}
