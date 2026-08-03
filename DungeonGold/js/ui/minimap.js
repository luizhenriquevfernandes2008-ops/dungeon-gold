// ============================================================
// Minimapa.
//
// Fica no topo da tela e revela a masmorra conforme você anda: o
// que nunca foi visto não aparece. Entrar numa sala revela a sala
// inteira; num corredor, revela um raio ao redor.
//
// Marca portas (na cor da fechadura), escada de saída, itens no
// chão e chaves. Não marca inimigos — saber onde eles estão sem
// olhar tiraria a tensão de virar a esquina.
//
// Desenhado em canvas de baixa resolução com pixels inteiros, para
// combinar com o resto da imagem em vez de parecer um overlay de
// outro jogo.
// ============================================================

const CEL = 3;              // pixels por célula da masmorra
const RAIO_CORREDOR = 5;    // alcance da revelação fora de sala

const COR = {
  fundo: '#0C0A08',
  moldura: '#15130F',
  borda: '#4A423A',
  chao: '#544C40',
  chaoPerto: '#7E7360',
  parede: '#221F1A',
  saida: '#E3B23C',
  item: '#6AA8E0',
  jogador: '#F2E4D8',
  cone: 'rgba(242,228,216,.20)',
};

export class Minimapa {
  constructor() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.mapa = null;
    this.descoberto = null;
    this.salasVistas = new Set();
  }

  // Chamado a cada andar novo.
  definirMapa(mapa) {
    this.mapa = mapa;
    this.descoberto = new Uint8Array(mapa.largura * mapa.altura);
    this.salasVistas.clear();
    this.canvas.width = mapa.largura * CEL;
    this.canvas.height = mapa.altura * CEL;
    // encolhe o mapa grande para caber sem virar um painel gigante
    const larguraCss = Math.min(200, mapa.largura * CEL);
    this.canvas.style.width = `${larguraCss}px`;
    this.canvas.style.height = `${Math.round(larguraCss * mapa.altura / mapa.largura)}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  // ---------- revelação ----------
  revelar(cx, cy) {
    const m = this.mapa;
    if (!m) return;

    // dentro de uma sala? revela a sala toda de uma vez
    const sala = m.salas.find(s => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h);
    if (sala && !this.salasVistas.has(sala.id)) {
      this.salasVistas.add(sala.id);
      for (let y = sala.y - 1; y <= sala.y + sala.h; y++)
        for (let x = sala.x - 1; x <= sala.x + sala.w; x++)
          this._marcar(x, y);
    }

    // e sempre um raio ao redor, para os corredores irem aparecendo
    for (let y = cy - RAIO_CORREDOR; y <= cy + RAIO_CORREDOR; y++)
      for (let x = cx - RAIO_CORREDOR; x <= cx + RAIO_CORREDOR; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= RAIO_CORREDOR ** 2) this._marcar(x, y);
  }

  _marcar(x, y) {
    const m = this.mapa;
    if (x < 0 || y < 0 || x >= m.largura || y >= m.altura) return;
    this.descoberto[m.em(x, y)] = 1;
  }

  visto(x, y) {
    const m = this.mapa;
    if (!m || x < 0 || y < 0 || x >= m.largura || y >= m.altura) return false;
    return !!this.descoberto[m.em(x, y)];
  }

  // ---------- desenho ----------
  desenhar(e) {
    const m = this.mapa;
    if (!m || !e) return;
    const ctx = this.ctx;
    const cx = Math.floor(e.cel.x), cy = Math.floor(e.cel.y);

    this.revelar(cx, cy);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = COR.fundo;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // chão descoberto — mais claro perto do jogador, para dar noção
    // de onde você está sem precisar caçar o marcador
    for (let y = 0; y < m.altura; y++) {
      for (let x = 0; x < m.largura; x++) {
        if (!this.descoberto[m.em(x, y)]) continue;
        const t = m.tipoEm(x, y);
        if (t === 0) { ctx.fillStyle = COR.parede; }
        else {
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          ctx.fillStyle = d <= 6 ? COR.chaoPerto : COR.chao;
        }
        ctx.fillRect(x * CEL, y * CEL, CEL, CEL);
      }
    }

    // portas — trancadas na cor da chave, destrancadas em pedra clara
    for (const p of e.portas) {
      if (!this.descoberto[m.em(p.x, p.y)]) continue;
      ctx.fillStyle = p.cor || '#8A8070';
      ctx.fillRect(p.x * CEL, p.y * CEL, CEL, CEL);
      if (p.trancada) {
        // contorno piscando, para tranca não passar batido
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillRect(p.x * CEL, p.y * CEL, CEL, 1);
      }
    }

    // itens e chaves no chão
    for (const c of e.coletaveis) {
      if (!this.descoberto[m.em(c.x, c.y)]) continue;
      ctx.fillStyle = c.cor || COR.item;
      ctx.fillRect(c.x * CEL, c.y * CEL + 1, CEL - 1, CEL - 1);
    }

    // escada de saída
    if (this.descoberto[m.em(e.saida.x, e.saida.y)]) {
      ctx.fillStyle = COR.saida;
      ctx.fillRect(e.saida.x * CEL - 1, e.saida.y * CEL - 1, CEL + 2, CEL + 2);
      ctx.fillStyle = '#FFF0B0';
      ctx.fillRect(e.saida.x * CEL, e.saida.y * CEL, CEL, CEL);
    }

    // cone de visão + jogador
    const px = cx * CEL + CEL / 2, py = cy * CEL + CEL / 2;
    const ang = -e.yaw;   // no mapa o norte é para cima
    ctx.fillStyle = COR.cone;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 13, ang - Math.PI / 2 - 0.5, ang - Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COR.jogador;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(ang - Math.PI / 2) * 4, py + Math.sin(ang - Math.PI / 2) * 4);
    ctx.lineTo(px + Math.cos(ang + Math.PI / 2 - 0.9) * 3.4, py + Math.sin(ang + Math.PI / 2 - 0.9) * 3.4);
    ctx.lineTo(px + Math.cos(ang + Math.PI / 2 + 0.9) * 3.4, py + Math.sin(ang + Math.PI / 2 + 0.9) * 3.4);
    ctx.closePath();
    ctx.fill();
  }
}
