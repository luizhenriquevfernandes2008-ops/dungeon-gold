// ============================================================
// Loja do mercador.
//
// A decisão que esta tela existe para criar: o ouro gasto aqui NÃO
// chega ao cofre no fim da run. Comprar é escolher sobreviver a esta
// descida em vez de ficar mais forte na próxima — e é por isso que
// `Jogo` desconta o preço do resumo da run também, não só da bolsa.
//
// A meta-progressão continua fora do dinheiro: desbloqueio só vem
// de marco, nunca de compra. A loja mexe no que dura uma run.
//
// Pausa o jogo pelo mesmo motivo do inventário (Q-05): a compra mexe
// em atributos, e decidir sob ataque viraria ruído.
// ============================================================

import { Audio } from '../core/audio.js';
import { gerarSpriteItem } from '../gfx/sprites.js';

const cacheIcone = new Map();

function icone(sprite) {
  if (cacheIcone.has(sprite)) return cacheIcone.get(sprite);
  const tex = gerarSpriteItem(sprite);
  const url = tex.image.toDataURL();
  tex.dispose();
  cacheIcone.set(sprite, url);
  return url;
}

export class Loja {
  constructor(dados) {
    this.dados = dados;
    this.cfg = dados.loja;
    this.raiz = document.getElementById('shop');
    this.grade = document.getElementById('shop-grid');
    this.bolsa = document.getElementById('shop-purse');
    this.fala = document.getElementById('shop-line');
    this.jogador = null;
    this.estoque = [];
    this.aoComprar = null;      // (entrada) => void, quem debita é o Jogo

    this.grade.addEventListener('click', ev => {
      const b = ev.target.closest('.loja-item');
      if (!b || b.classList.contains('esgotado')) return;
      this._comprar(parseInt(b.dataset.idx, 10));
    });
  }

  get aberta() { return !this.raiz.classList.contains('hidden'); }

  // O estoque é sorteado UMA vez por andar e guardado no Jogo: reabrir
  // a loja não pode reembaralhar a prateleira, senão o jogador sai e
  // volta até sair o item que ele quer.
  montarEstoque(rng, poolItens, andar) {
    const c = this.cfg;
    const mult = 1 + (andar - 1) * (c.precoPorAndar ?? 0.14);
    const preco = base => Math.round(base * mult);

    const estoque = c.servicos.map(s => ({
      id: s.id, nome: s.nome, descricao: s.descricao,
      sprite: s.sprite, raridade: s.raridade,
      preco: preco(s.preco), efeito: s.efeito,
      servico: true, repetivel: s.repetivel !== false, vendido: false,
    }));

    // relíquias: sem repetir, e só as que ficam na run
    const candidatas = poolItens.filter(i => !i.consumivel && i.efeito?.tipo !== 'ouro');
    const sorteadas = [];
    const saco = rng.embaralhar(candidatas);
    for (const it of saco) {
      if (sorteadas.length >= (c.vagas ?? 4)) break;
      sorteadas.push(it);
    }

    for (const it of sorteadas) {
      estoque.push({
        id: it.id, nome: it.nome, descricao: it.descricao,
        sprite: it.sprite, raridade: it.raridade,
        preco: preco(c.precoPorRaridade[it.raridade] ?? 80),
        item: it, servico: false, repetivel: false, vendido: false,
      });
    }

    this.estoque = estoque;
    return estoque;
  }

  abrir(jogador, estoque) {
    this.jogador = jogador;
    this.estoque = estoque;
    this.raiz.classList.remove('hidden');
    this.fala.textContent = this._fala();
    this.desenhar();
    Audio.sfx('mercador');
  }

  fechar() { this.raiz.classList.add('hidden'); }

  _fala() {
    const j = this.jogador;
    if (!j) return '';
    if (j.ouro < 50) return '"Volte quando tiver peso na bolsa."';
    if (j.vida < j.vidaMax * 0.4) return '"Você está sangrando na minha loja. Cure-se antes de escolher enfeite."';
    return '"O que você não levar, eu revendo lá embaixo. Para outro alguém."';
  }

  desenhar() {
    const j = this.jogador;
    if (!j) return;
    const rar = this.dados.itens.raridades;

    this.bolsa.innerHTML =
      `<span>bolsa <b>${j.ouro}</b></span>` +
      `<span>vida <b>${Math.max(0, Math.round(j.vida))}/${j.vidaMax}</b></span>` +
      `<span>armadura <b>${j.armaduraPct}%</b></span>`;

    this.grade.innerHTML = this.estoque.map((e, i) => {
      const cor = rar[e.raridade]?.cor ?? '#B6A894';
      const semOuro = j.ouro < e.preco;
      const fora = e.vendido || semOuro;
      const motivo = e.vendido ? 'vendido' : semOuro ? 'ouro insuficiente' : '';
      return (
        `<button class="loja-item${fora ? ' esgotado' : ''}" data-idx="${i}" style="--rar:${cor}"` +
        `${fora ? ' disabled' : ''}>` +
        `<img class="marca" src="${icone(e.sprite)}" alt="">` +
        `<span class="corpo">` +
        `<b class="nome">${e.nome}</b>` +
        `<span class="desc">${e.descricao}</span>` +
        `</span>` +
        `<span class="preco">${motivo || `${e.preco} ◈`}</span>` +
        `</button>`);
    }).join('');
  }

  _comprar(i) {
    const e = this.estoque[i];
    const j = this.jogador;
    if (!e || !j || e.vendido || j.ouro < e.preco) { Audio.sfx('uiBack'); return; }

    if (!e.repetivel) e.vendido = true;
    if (this.aoComprar) this.aoComprar(e);

    Audio.sfx('gold');
    this.fala.textContent = e.servico
      ? '"Bom proveito. Não volte pior do que saiu."'
      : '"Cuide dela. A anterior voltou sem dono."';
    this.desenhar();
  }
}
