// ============================================================
// Inventário.
//
// Mostra o que o jogador está carregando e deixa descartar uma
// relíquia. Descartar precisa DESFAZER o efeito que o item aplicou
// quando foi pego — por isso o Jogador expõe aplicarEfeito(ef, sinal)
// em vez de somar direto dentro de pegarItem.
//
// O jogo pausa enquanto esta tela está aberta (decisão Q-05): as
// relíquias mudam atributos, e escolher sob ataque viraria ruído.
// ============================================================

import { Audio } from '../core/audio.js';
import { gerarSpriteItem, gerarSpriteChave } from '../gfx/sprites.js';

const MIN_SLOTS = 12;

// cache de imagens dos sprites, para não regerar a cada abertura
const cacheIcone = new Map();

function icone(chaveCache, fabricar) {
  if (cacheIcone.has(chaveCache)) return cacheIcone.get(chaveCache);
  const tex = fabricar();
  const url = tex.image.toDataURL();
  tex.dispose();
  cacheIcone.set(chaveCache, url);
  return url;
}

export class Inventario {
  constructor(dados) {
    this.dados = dados;
    this.raiz = document.getElementById('inventory');
    this.grade = document.getElementById('inv-grid');
    this.detalhe = document.getElementById('inv-detail');
    this.vitais = document.getElementById('inv-vitals');
    this.jogador = null;
    this.selecionado = -1;
    this.confirmando = false;
    this.aoDescartar = null;

    this.grade.addEventListener('click', ev => {
      const slot = ev.target.closest('.inv-slot.cheio');
      if (!slot) return;
      this.selecionar(parseInt(slot.dataset.idx, 10));
    });
  }

  get aberto() { return !this.raiz.classList.contains('hidden'); }

  abrir(jogador) {
    this.jogador = jogador;
    this.selecionado = -1;
    this.confirmando = false;
    this.raiz.classList.remove('hidden');
    this.desenhar();
    Audio.sfx('uiMove');
  }

  fechar() {
    this.raiz.classList.add('hidden');
    this.confirmando = false;
  }

  // ---------- montagem ----------
  desenhar() {
    const j = this.jogador;
    if (!j) return;

    this.vitais.innerHTML = `
      <span>vida <b>${Math.max(0, Math.round(j.vida))}/${j.vidaMax}</b></span>
      <span>armadura <b>${j.armaduraPct}%</b></span>
      <span>ouro <b>${j.ouro}</b></span>`;

    const entradas = this._entradas();
    const total = Math.max(MIN_SLOTS, Math.ceil(entradas.length / 4) * 4);
    const partes = [];

    for (let i = 0; i < total; i++) {
      const e = entradas[i];
      if (!e) { partes.push('<div class="inv-slot vazio"></div>'); continue; }
      const sel = i === this.selecionado ? ' sel' : '';
      partes.push(
        `<div class="inv-slot cheio${sel}" data-idx="${i}" tabindex="0" style="--rar:${e.cor}">` +
        `<span class="fita"></span>` +
        `<img class="marca" src="${e.icone}" alt="">` +
        `<span class="nome">${e.nome}</span>` +
        `</div>`);
    }
    this.grade.innerHTML = partes.join('');
    this._desenharDetalhe(entradas[this.selecionado]);
  }

  // Uma lista só, na ordem em que importa: relíquias, depois
  // consumíveis, depois chaves.
  _entradas() {
    const j = this.jogador;
    const rar = this.dados.itens.raridades;
    const lista = [];

    for (const it of j.inventario) {
      lista.push({
        tipo: 'reliquia', item: it, nome: it.nome,
        descricao: it.descricao,
        raridade: it.raridade,
        cor: rar[it.raridade]?.cor ?? '#B6A894',
        icone: icone(`item:${it.sprite}`, () => gerarSpriteItem(it.sprite)),
        podeDescartar: true,
      });
    }

    if (j.pocoes > 0) {
      lista.push({
        tipo: 'consumivel', nome: `Poção ×${j.pocoes}`,
        descricao: 'Restaura 30 de vida. Use com a tecla 1 durante a run.',
        raridade: 'comum', cor: rar.comum?.cor ?? '#B6A894',
        icone: icone('item:pocao', () => gerarSpriteItem('pocao')),
        podeDescartar: false,
      });
    }

    const CORES = { ouro: '#E3B23C', safira: '#5A9AE0', rubi: '#C4322A' };
    const NOMES = { ouro: 'dourada', safira: 'de safira', rubi: 'de rubi' };
    for (const id of j.chaves) {
      lista.push({
        tipo: 'chave', nome: `Chave ${NOMES[id] ?? id}`,
        descricao: 'Abre a porta da mesma cor neste andar. Não passa para o andar seguinte.',
        raridade: 'lendario', cor: CORES[id] ?? '#E3B23C',
        icone: icone(`chave:${id}`, () => gerarSpriteChave(CORES[id] ?? '#E3B23C')),
        podeDescartar: false,
      });
    }

    return lista;
  }

  _desenharDetalhe(e) {
    if (!e) {
      this.detalhe.innerHTML = '<p class="inv-vazio">Escolha um item para ver o que ele faz.</p>';
      return;
    }

    const efeito = e.item ? this._descreverEfeito(e.item.efeito) : '';
    const botao = e.podeDescartar
      ? `<button class="descartar${this.confirmando ? ' confirmar' : ''}" id="inv-descartar">` +
        `${this.confirmando ? 'Confirmar descarte' : 'Descartar'}</button>` +
        (this.confirmando
          ? '<p class="aviso">O bônus desta relíquia sai junto. Não dá para pegar de volta.</p>'
          : '')
      : '<p class="aviso">Este item não pode ser descartado.</p>';

    this.detalhe.innerHTML =
      `<span class="rar" style="--rar:${e.cor}">${e.raridade ?? ''}</span>` +
      `<h3>${e.nome}</h3>` +
      `<p>${e.descricao ?? ''}</p>` +
      (efeito ? `<p class="efeito">${efeito}</p>` : '') +
      botao;
    this.detalhe.style.setProperty('--rar', e.cor);

    const btn = document.getElementById('inv-descartar');
    if (btn) btn.addEventListener('click', () => this._descartar(e));
  }

  _descreverEfeito(ef) {
    if (!ef) return '';
    if (ef.tipo === 'composto') return ef.partes.map(p => this._descreverEfeito(p)).filter(Boolean).join(' · ');
    const N = {
      dano: v => `+${v} de dano`,
      vidaMax: v => `+${v} de vida máxima`,
      velocidade: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% de velocidade`,
      armadura: v => `+${Math.round(v * 100)}% de armadura`,
      cadencia: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}% de cadência`,
      alcance: v => `+${v} de alcance`,
      roubo: v => `${Math.round(v * 100)}% de roubo de vida`,
      critico: v => `+${Math.round(v * 100)}% de crítico`,
      queimar: v => `${v} de queimadura`,
      reflexo: v => `devolve ${Math.round(v * 100)}% do golpe aparado`,
      ouroDobro: v => `ouro ×${v}`,
      cura: v => `cura ${v}`,
      ouro: v => `${v} de ouro`,
    };
    return N[ef.tipo] ? N[ef.tipo](ef.valor) : '';
  }

  // ---------- ações ----------
  selecionar(i) {
    this.selecionado = i;
    this.confirmando = false;
    Audio.sfx('uiMove');
    this.desenhar();
  }

  _descartar(e) {
    if (!e.podeDescartar || !e.item) return;

    // dois toques: o primeiro arma, o segundo executa
    if (!this.confirmando) {
      this.confirmando = true;
      Audio.sfx('uiMove');
      this._desenharDetalhe(e);
      return;
    }

    this.jogador.descartarItem(e.item);
    this.confirmando = false;
    this.selecionado = -1;
    Audio.sfx('block');
    if (this.aoDescartar) this.aoDescartar(e.item);
    this.desenhar();
  }
}
