// ============================================================
// DUNGEON GOLD — ponto de entrada.
// Máquina de estados: boot → menu → jogando ⇄ pausado → morto
// ============================================================

import * as THREE from 'three';
import { Settings } from './core/settings.js';
import { Progresso } from './core/progress.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { carregarDados, Dados } from './core/loader.js';
import { RenderizadorPixel } from './gfx/renderer.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { Inventario } from './ui/inventory.js';
import { Loja } from './ui/shop.js';
import { Minimapa } from './ui/minimap.js';
import {
  definirAfixos, gerarEspadaJogador, gerarEscopetaJogador, gerarZweihander,
  gerarLanca, gerarMartelo, gerarArco,
} from './gfx/sprites.js';
import { Jogo } from './game.js';

const el = id => document.getElementById(id);

const App = {
  estado: 'boot',
  rend: null,
  menu: null,
  jogo: null,
  hud: null,
  inv: null,
  loja: null,
  mini: null,
  armaDaRun: null,
  chefeNaTela: null,
  pedirApresentacao: false,
  especialAtual: null,
  buffsNaTela: '',
  dashNos: 0,
  ultimo: 0,
  timerAviso: 0,
};

// ---------- aviso na tela ----------
function aviso(txt) {
  const t = el('toast');
  t.textContent = txt;
  t.classList.remove('hidden');
  App.timerAviso = 2.6;
}

function atualizarAviso(dt) {
  if (App.timerAviso <= 0) return;
  App.timerAviso -= dt;
  if (App.timerAviso <= 0) el('toast').classList.add('hidden');
}

// ---------- troca de estado ----------
function irPara(novo) {
  App.estado = novo;

  const emJogo = novo === 'jogando';
  const comHud = emJogo || novo === 'pausado' || novo === 'inventario' || novo === 'loja';
  el('hud').classList.toggle('hidden', !comHud);
  el('crosshair').classList.toggle('hidden', !emJogo);
  if (!emJogo) {
    el('dash').classList.add('hidden');
    el('especial').classList.add('hidden');
    el('buffs').classList.add('hidden');
  }
  el('minimap-wrap').classList.toggle('hidden', !comHud);
  el('pause').classList.toggle('hidden', novo !== 'pausado');
  if (novo !== 'inventario') App.inv?.fechar();
  if (novo !== 'loja') App.loja?.fechar();
  el('gameover').classList.toggle('hidden', novo !== 'morto');
  el('victory').classList.toggle('hidden', novo !== 'vitoria');
  el('bossintro').classList.toggle('hidden', novo !== 'apresentacao');
  if (novo !== 'jogando' && novo !== 'pausado' && novo !== 'inventario' && novo !== 'loja') {
    atualizarBarraChefe(null);
  }
  el('click-to-play').classList.add('hidden');

  if (novo === 'menu') {
    App.menu.mostrar();
    App.menu.atualizarMeta(Progresso.data);
    App.menu.montarArmas(Dados.armas.armas, a => Progresso.armaLiberada(a));
    Input.destravar();
    Audio.pararMusica();
  } else {
    App.menu.esconder();
  }

  if (emJogo) Input.travar();
  else Input.destravar();
}

// ---------- habilidade especial e frutas ----------
const NOME_ESPECIAL = {
  bolaFogo: 'F · bola de fogo', estilhaco: 'F · estilhaços',
  repulsa: 'F · repulsa', piscar: 'F · piscar',
  drenar: 'F · drenar', tempestade: 'F · tempestade',
};

function atualizarExtras(hud) {
  const cx = el('especial');
  if (hud.especial) {
    cx.classList.remove('hidden');
    if (App.especialAtual !== hud.especial.id) {
      App.especialAtual = hud.especial.id;
      el('esp-nome').textContent = NOME_ESPECIAL[hud.especial.id] ?? 'F · especial';
    }
    cx.classList.toggle('pronto', hud.especial.pronto);
    el('esp-carga').style.setProperty('--p', `${Math.round(hud.especial.parcial * 100)}%`);
  } else {
    cx.classList.add('hidden');
    App.especialAtual = null;
  }

  const cb = el('buffs');
  const f = hud.frutas ?? [];
  if (!f.length) { cb.classList.add('hidden'); cb.innerHTML = ''; App.buffsNaTela = ''; return; }
  cb.classList.remove('hidden');
  // redesenha só quando muda de conjunto; o relógio atualiza por texto
  const chave = f.map(x => x.nome).join('|');
  if (App.buffsNaTela !== chave) {
    App.buffsNaTela = chave;
    cb.innerHTML = f.map(() => '<span></span>').join('');
  }
  const nos = cb.children;
  for (let i = 0; i < f.length && i < nos.length; i++) {
    nos[i].textContent = `${f[i].nome ?? 'fruta'} ${Math.ceil(f[i].restante)}s`;
    nos[i].classList.toggle('acabando', f[i].restante <= 5);
  }
}

// ---------- apresentação do chefe ----------
// O jogo continua desenhando o mundo atrás; o chefe fica congelado.
// A luta só começa quando o jogador fecha esta tela — ele precisa de
// um instante para olhar o bicho antes de ele começar a atacar.
function abrirApresentacao() {
  const a = App.jogo.apresentacaoChefe();
  if (!a) return;
  el('intro-img').src = a.retrato;
  el('intro-nome').textContent = a.nome;
  el('intro-frase').textContent = a.frase;
  el('intro-tags').innerHTML =
    [`corpo ${a.corpo}`, ...a.ataques].map(t => `<span>${t}</span>`).join('');
  Audio.sfx('chefeRugido');
  irPara('apresentacao');
}

function fecharApresentacao() {
  if (App.estado !== 'apresentacao') return;
  App.jogo.comecarLutaFinal();
  irPara('jogando');
}

// ---------- cargas de dash ----------
// Só redesenha quando o número de cargas muda; a carga em recarga
// atualiza por estilo, sem recriar nós. Redesenhar isso todo quadro
// custaria mais que o resto da HUD junta.
function atualizarDash(d) {
  const caixa = el('dash');
  if (!d) { caixa.classList.add('hidden'); return; }
  caixa.classList.remove('hidden');
  if (App.dashNos !== d.max) {
    App.dashNos = d.max;
    caixa.innerHTML = Array.from({ length: d.max }, () => '<i><b></b></i>').join('');
  }
  const nos = caixa.children;
  for (let i = 0; i < nos.length; i++) {
    const cheia = i < d.cargas;
    nos[i].classList.toggle('cheia', cheia);
    const enchendo = i === d.cargas ? d.parcial : 0;
    nos[i].firstChild.style.width = cheia ? '0%' : `${Math.round(enchendo * 100)}%`;
  }
}

// ---------- barra do chefe ----------
// Duas camadas: a vermelha acompanha o dano na hora, a clara desce
// atrás com atraso. É o atraso que faz um golpe grande PARECER grande.
function atualizarBarraChefe(estado) {
  const caixa = el('bosshp');
  if (!estado) {
    if (!caixa.classList.contains('hidden')) {
      caixa.classList.add('hidden');
      caixa.classList.remove('enfurecido');
      App.chefeNaTela = null;
    }
    return;
  }

  if (App.chefeNaTela !== estado.nome) {
    App.chefeNaTela = estado.nome;
    el('boss-nome').textContent = estado.nome;
    caixa.classList.remove('hidden');
    // riscos nas viradas de fase, para o jogador ver que falta pouco
    el('boss-fases').innerHTML = estado.limites
      .filter(l => l < 1)
      .map(l => `<i style="left:${(l * 100).toFixed(1)}%"></i>`).join('');
  }

  const pct = `${(estado.pct * 100).toFixed(1)}%`;
  el('boss-fill').style.width = pct;
  el('boss-atraso').style.width = pct;
  caixa.classList.toggle('enfurecido', estado.fase >= 3);
}

// ---------- vitória ----------
function venceuRun(resumo) {
  const novos = Progresso.registrarRun(resumo, Dados.desbloqueios);

  el('vit-morto').textContent = resumo.chefeFinal
    ? `${resumo.chefeFinal} caiu.` : '';
  el('vit-stats').innerHTML = `
    <span>Andar</span><b>${resumo.andar}</b>
    <span>Abates</span><b>${resumo.abates}</b>
    <span>Ouro</span><b>${resumo.ouro}</b>
    <span>Guardiões</span><b>${resumo.chefes}</b>
    <span>Tempo</span><b>${formatarTempo(resumo.tempo)}</b>`;
  el('vit-unlocks').innerHTML = novos.length
    ? '✦ Liberado para as próximas runs:<br>' + novos.map(u => `${u.nome} — ${u.descricao}`).join('<br>')
    : '';

  App.menu.atualizarMeta(Progresso.data);
  irPara('vitoria');
}

// ---------- fim de run ----------
function fimDeRun(resumo) {
  const novos = Progresso.registrarRun(resumo, Dados.desbloqueios);

  el('go-title').textContent = 'Você tombou';
  el('go-stats').innerHTML = `
    <span>Andar</span><b>${resumo.andar}</b>
    <span>Abates</span><b>${resumo.abates}</b>
    <span>Ouro</span><b>${resumo.ouro}</b>
    <span>Guardiões</span><b>${resumo.chefes}</b>
    <span>Tempo</span><b>${formatarTempo(resumo.tempo)}</b>`;

  el('go-unlocks').innerHTML = novos.length
    ? '✦ Liberado para as próximas runs:<br>' + novos.map(u => `${u.nome} — ${u.descricao}`).join('<br>')
    : '';

  if (novos.length) Audio.sfx('unlock');
  App.menu.atualizarMeta(Progresso.data);
  irPara('morto');
}

function formatarTempo(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ---------- laço ----------
function laco(agora) {
  requestAnimationFrame(laco);
  const dt = Math.min(0.05, (agora - App.ultimo) / 1000 || 0);
  App.ultimo = agora;

  atualizarAviso(dt);

  if (App.estado === 'menu' || App.estado === 'boot') {
    App.menu.atualizar(dt);
    App.rend.renderizar(App.menu.cena, App.menu.camera, null, null, agora / 1000);
  } else if (App.estado === 'jogando' && App.pedirApresentacao) {
    // pedido levantado ao gerar o andar final; atendido aqui, fora do
    // meio da geração, para a cena já estar montada quando a tela abrir
    App.pedirApresentacao = false;
    abrirApresentacao();
  } else if (App.estado === 'jogando') {
    // ao voltar do inventário o navegador às vezes recusa retravar o
    // mouse na hora; nesse caso o aviso de clique precisa reaparecer
    el('click-to-play').classList.toggle('hidden', Input.travado);
    if (Input.apertou('Escape')) { pausar(); }
    else if (Input.apertou('Tab')) { abrirInventario(); }
    else if (Input.apertou('KeyE') && App.jogo.podeComprar) { abrirLoja(); }
    else if (Input.apertou('KeyE') && App.jogo.podeAtravessar) { App.jogo.atravessarPortal(); }
    App.jogo.atualizar(dt);
    App.jogo.renderizar();
    const hud = App.jogo.estadoHud();
    App.hud.desenhar(hud, dt);
    App.mini.desenhar(App.jogo.estadoMinimapa());
    atualizarBarraChefe(App.jogo.estadoChefe());
    atualizarDash(hud.dash);
    atualizarExtras(hud);
  } else if (App.estado === 'inventario') {
    // mundo congelado ao fundo: renderiza, mas não atualiza nada
    if (Input.apertou('Tab', 'Escape')) fecharInventario();
    App.jogo.renderizar();
    App.hud.desenhar(App.jogo.estadoHud(), 0);
  } else if (App.estado === 'loja') {
    if (Input.apertou('KeyE', 'Escape')) fecharLoja();
    App.jogo.renderizar();
    App.hud.desenhar(App.jogo.estadoHud(), 0);
  } else if (App.estado === 'apresentacao') {
    // o mundo continua vivo atrás da tela, mas o chefe está congelado
    App.jogo.atualizar(dt);
    App.jogo.renderizar();
  } else if (App.estado === 'pausado' || App.estado === 'morto' || App.estado === 'vitoria') {
    App.jogo.renderizar();
    if (App.estado === 'pausado') App.hud.desenhar(App.jogo.estadoHud(), 0);
  }

  Input.limparFrame();
}

function abrirInventario() {
  if (App.estado !== 'jogando') return;
  App.inv.abrir(App.jogo.jogador);
  irPara('inventario');
}

function fecharInventario() {
  if (App.estado !== 'inventario') return;
  App.inv.fechar();
  irPara('jogando');
}

function abrirLoja() {
  if (App.estado !== 'jogando' || !App.jogo.mercador) return;
  App.loja.abrir(App.jogo.jogador, App.jogo.mercador.estoque);
  irPara('loja');
}

function fecharLoja() {
  if (App.estado !== 'loja') return;
  App.loja.fechar();
  irPara('jogando');
}

function pausar() {
  if (App.estado !== 'jogando') return;
  irPara('pausado');
}

function retomar() {
  if (App.estado !== 'pausado') return;
  irPara('jogando');
  Audio.retomar();
}

// ---------- início ----------
async function iniciar() {
  Settings.carregar();
  Progresso.carregar();

  const canvas = el('view');
  Input.iniciar(canvas);
  App.rend = new RenderizadorPixel(canvas);
  App.hud = new Hud(el('hud-canvas'));

  el('boot-hint').textContent = 'carregando dados';
  try {
    await carregarDados((p, arq) => {
      el('boot-fill').style.width = `${Math.round(p * 100)}%`;
      el('boot-hint').textContent = arq.replace('data/', '');
    });
  } catch (erro) {
    el('boot-hint').innerHTML =
      `não consegui ler <b>${erro.message}</b><br><br>` +
      `abra o jogo por um servidor local:<br>` +
      `<code>python -m http.server</code> na pasta do jogo,<br>` +
      `depois acesse http://localhost:8000`;
    console.error(erro);
    return;
  }

  // os afixos de inimigo agora vêm de data/enemies.json
  definirAfixos(Dados.inimigos.afixos);

  App.menu = new Menu((acao, arma) => {
    if (acao === 'play') {
      Audio.iniciar(); Audio.retomar();
      App.armaDaRun = arma;
      App.jogo.iniciarRun(arma);
      irPara('jogando');
    } else if (acao === 'wipe') {
      Progresso.apagar();
      App.menu.atualizarMeta(Progresso.data);
      aviso('Progresso apagado');
    }
  });

  App.mini = new Minimapa();
  App.inv = new Inventario(Dados);
  App.inv.aoDescartar = item => aviso(`${item.nome} descartada`);

  App.loja = new Loja(Dados);
  App.loja.aoComprar = entrada => {
    App.jogo.comprar(entrada);
    if (!entrada.servico) aviso(`${entrada.nome} — ${entrada.descricao}`);
  };

  App.jogo = new Jogo(App.rend, Dados, {
    aoAviso: aviso,
    aoMorrer: fimDeRun,
    aoVencer: venceuRun,
    aoNovoAndar: (mapa, tema, ehFinal) => {
      App.mini.definirMapa(mapa);
      el('mm-andar').textContent = ehFinal
        ? `o fim · andar ${mapa.andar}`
        : tema.desvio
          ? `${tema.nome} · desvio`
          : `${tema.nome} · andar ${mapa.andar}`;
      // no andar final, a apresentação entra antes de qualquer coisa
      if (ehFinal) App.pedirApresentacao = true;
    },
  });
  // o Jogo precisa da Loja para sortear o estoque no momento em que a
  // sala do mercador é criada, não quando o jogador abre a tela
  App.jogo.loja = App.loja;

  // retratos das armas para o menu: gera o sprite uma vez e guarda o PNG
  const fabricas = {
    espada: gerarEspadaJogador,
    escopeta: gerarEscopetaJogador,
    zweihander: gerarZweihander,
    lanca: gerarLanca,
    martelo: gerarMartelo,
    arco: gerarArco,
  };
  const retratos = {};
  for (const [id, fab] of Object.entries(fabricas)) {
    const tex = fab();
    retratos[id] = tex.image.toDataURL();
    tex.dispose();
  }
  const condicoes = {};
  for (const u of Dados.desbloqueios.desbloqueios) condicoes[u.id] = u.descricao;
  App.menu.prepararArmas(retratos, condicoes);
  App.menu.montarArmas(Dados.armas.armas, a => Progresso.armaLiberada(a));

  App.rend.aoRedimensionar = a => {
    App.menu.redimensionar(a);
    App.jogo.redimensionar(a);
  };
  App.rend.redimensionar();

  // --- ações das telas de pausa e fim ---
  el('pause').addEventListener('click', ev => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    Audio.sfx('uiPick');
    if (b.dataset.action === 'resume') retomar();
    if (b.dataset.action === 'tomenu') { App.jogo.limpar(); irPara('menu'); }
  });

  for (const id of ['gameover', 'victory']) {
    el(id).addEventListener('click', ev => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      Audio.sfx('uiPick');
      if (b.dataset.action === 'again') { App.jogo.iniciarRun(App.armaDaRun); irPara('jogando'); }
      if (b.dataset.action === 'tomenu') { App.jogo.limpar(); irPara('menu'); }
    });
  }

  // --- pointer lock ---
  Input.aoDestravar = () => {
    if (App.estado === 'jogando') pausar();
  };
  canvas.addEventListener('click', () => {
    if (App.estado === 'jogando' && !Input.travado) Input.travar();
    if (App.estado === 'pausado') retomar();
  });

  addEventListener('keydown', e => {
    if (e.code === 'Escape' && App.estado === 'pausado') retomar();
    if (App.estado === 'apresentacao') fecharApresentacao();
  });
  el('bossintro').addEventListener('click', fecharApresentacao);

  el('boot').classList.add('hidden');
  irPara('menu');
  App.ultimo = performance.now();
  requestAnimationFrame(laco);

  console.log('%cDUNGEON GOLD', 'color:#E3B23C;font-weight:bold', '— pronto. three.js', THREE.REVISION);
}

iniciar();
