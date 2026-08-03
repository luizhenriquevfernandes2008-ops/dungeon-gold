// ============================================================
// Meta-progressão — o que sobrevive à morte.
//
// Nada é comprado: os itens abrem por marcos. Assim o jogador
// nunca precisa parar numa loja e o desbloqueio sempre chega
// como notícia no fim da run.
// ============================================================

const CHAVE = 'dungeongold.progress.v1';

const INICIAL = {
  recorde: 0,        // andar mais fundo alcançado
  ouroTotal: 0,      // ouro acumulado em todas as runs
  abates: 0,
  runs: 0,
  chefes: 0,
  liberados: [],     // ids de desbloqueio já concedidos
};

export const Progresso = {
  data: { ...INICIAL },

  carregar() {
    try {
      const b = localStorage.getItem(CHAVE);
      if (b) Object.assign(this.data, JSON.parse(b));
    } catch (e) {
      console.warn('[progresso] leitura falhou:', e);
    }
    if (!Array.isArray(this.data.liberados)) this.data.liberados = [];
    return this.data;
  },

  salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(this.data)); }
    catch (e) { console.warn('[progresso] gravação falhou:', e); }
  },

  apagar() {
    this.data = { ...INICIAL, liberados: [] };
    this.salvar();
  },

  /** Registra o resultado de uma run e devolve os desbloqueios novos. */
  registrarRun(resumo, definicoes) {
    const d = this.data;
    d.runs += 1;
    d.abates += resumo.abates;
    d.ouroTotal += resumo.ouro;
    d.chefes += resumo.chefes;
    d.recorde = Math.max(d.recorde, resumo.andar);

    const novos = [];
    for (const u of definicoes.desbloqueios) {
      if (d.liberados.includes(u.id)) continue;
      if (this._cumpriu(u.condicao)) {
        d.liberados.push(u.id);
        novos.push(u);
      }
    }
    this.salvar();
    return novos;
  },

  _cumpriu(c) {
    const d = this.data;
    switch (c.tipo) {
      case 'andar': return d.recorde >= c.valor;
      case 'abates': return d.abates >= c.valor;
      case 'ouroTotal': return d.ouroTotal >= c.valor;
      case 'runs': return d.runs >= c.valor;
      case 'chefes': return d.chefes >= c.valor;
      default: return false;
    }
  },

  /** Itens disponíveis no sorteio: os básicos + os já liberados. */
  // Uma arma está liberada se não pede desbloqueio, ou se o
  // desbloqueio dela já foi concedido.
  armaLiberada(arma) {
    if (!arma.desbloqueio) return true;
    return this.data.liberados.includes(arma.desbloqueio);
  },

  poolDeItens(dadosItens, dadosDesbloqueios) {
    const liberadosItens = new Set(
      dadosDesbloqueios.desbloqueios
        .filter(u => this.data.liberados.includes(u.id))
        .map(u => u.item)
    );
    return dadosItens.itens.filter(it => it.base || liberadosItens.has(it.id));
  },
};
