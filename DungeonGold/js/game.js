// ============================================================
// Estado de jogo — costura tudo: gera o andar, povoa, resolve o
// combate, entrega o estado para a HUD e decide quando a run
// acabou.
// ============================================================

import * as THREE from 'three';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Settings } from './core/settings.js';
import { criarRng, sementeAleatoria } from './core/rng.js';
import { Progresso } from './core/progress.js';
import { gerarMasmorra, gerarArenaChefe, TIPOS_SALA } from './world/generator.js';
import { Nivel } from './world/level.js';
import { Armadilhas } from './world/traps.js';
import {
  temaDoAndar, temaPorNome, montarSequenciaTemas, configDoTema,
  biomaPorNome, NOMES_BIOMAS,
} from './gfx/textures.js';
import {
  gerarSpriteChave, gerarSpriteItem, gerarMercador,
  gerarEspadaJogador, gerarEscopetaJogador, gerarZweihander,
  gerarLanca, gerarMartelo, gerarArco,
  gerarFoice, gerarAdagas, gerarBesta, gerarChicote, gerarCanhao,
} from './gfx/sprites.js';

// Retrato de cada arma para quando ela está largada no chão.
const FABRICA_ARMA = {
  espada: gerarEspadaJogador, escopeta: gerarEscopetaJogador,
  zweihander: gerarZweihander, lanca: gerarLanca,
  martelo: gerarMartelo, arco: gerarArco,
  foice: gerarFoice, adagas: gerarAdagas, besta: gerarBesta,
  chicote: gerarChicote, canhao: gerarCanhao,
};
import { Jogador } from './entities/player.js';
import { Inimigo, sortearDefinicao, definicaoChefe } from './entities/enemy.js';
import { ChefeFinal } from './entities/boss.js';
import { sortearChefeFinal } from './gfx/boss.js';
import { ArmaJogador } from './combat/sword.js';

export class Jogo {
  constructor(renderizador, dados, ganchos) {
    this.rend = renderizador;
    this.dados = dados;
    this.ganchos = ganchos;          // { aoAviso, aoMorrer, aoVencerAndar }

    this.cena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(Settings.data.fov, 16 / 9, 0.05, 120);
    this.arma = new ArmaJogador();
    this.arma.aoAcertar = () => this._resolverAtaque();

    this.jogador = new Jogador(dados.balanceamento);
    this.inimigos = [];
    this.coletaveis = [];
    this.nivel = null;
    this.armadilhas = null;
    this.mercador = null;
    this.loja = null;          // injetada pelo main, para o estoque nascer com a sala
    this.andar = 0;
    this.ativo = false;
    this.tempo = 0;
    this.transicao = 0;

    this.resumo = { abates: 0, ouro: 0, chefes: 0, andar: 0, tempo: 0 };

    Settings.aoMudar((chave) => {
      if (chave === 'fov' || chave === '*') {
        this.camera.fov = Settings.data.fov;
        this.camera.updateProjectionMatrix();
      }
    });
  }

  redimensionar(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.arma.redimensionar(aspect);
  }

  // ---------- ciclo de run ----------
  iniciarRun(armaDef) {
    this.limpar();

    // a arma escolhida no menu define silhueta, animação e atributos
    const arma = armaDef || this.dados.armas.armas[0];
    if (this.arma) this.arma.descartar();
    this.arma = new ArmaJogador(arma);
    this.arma.aoAcertar = () => this._resolverAtaque();
    this.arma.redimensionar(this.aspect || 16 / 9);

    this.jogador = new Jogador(this.dados.balanceamento);
    this.jogador.arma = arma;
    this.jogador.aoAcabarFruta = () => {
      Audio.sfx('frutaAcabou');
      this.ganchos.aoAviso('O efeito passou');
    };
    this.resumo = { abates: 0, ouro: 0, chefes: 0, andar: 0, tempo: 0 };
    this.andar = 0;
    // ordem dos temas sorteada AGORA, uma vez por run: duas runs seguidas
    // nunca descem pela mesma sequência de cenários
    this.temasDaRun = montarSequenciaTemas(sementeAleatoria(), this.andarFinal);
    this.poolItens = Progresso.poolDeItens(this.dados.itens, this.dados.desbloqueios);
    this.proximoAndar();
    this.ativo = true;
    Audio.iniciarMusica(0);
  }

  get andarFinal() { return this.dados.chefeFinal?.andarFinal ?? 20; }

  /**
   * @param {string|null} bioma id de um bioma de desvio, ou null para
   *   seguir a masmorra normal. O desvio NÃO adianta o contador de
   *   andar: ele é um lugar a mais, não um andar a menos.
   */
  proximoAndar(bioma = null) {
    this.noDesvio = !!bioma;
    this.biomaAtual = bioma;
    if (!bioma) {
      this.andar += 1;
      this.resumo.andar = this.andar;
    }
    this.ehAndarFinal = !bioma && this.andar >= this.andarFinal;
    this._descartarNivel();

    const semente = sementeAleatoria();
    this.rng = criarRng(semente);
    // o tema sobrescreve os parâmetros de geração — é o que faz cada
    // faixa de dois andares ter arquitetura própria, não só outra cor
    const nomeTema = this.temasDaRun?.[this.andar - 1];
    const tema = bioma
      ? biomaPorNome(bioma)
      : (nomeTema ? temaPorNome(nomeTema) : temaDoAndar(this.andar));
    const cfg = configDoTema(this.dados.balanceamento, tema);
    // no desvio não nasce outro portal: dois seguidos viraria um túnel
    // de biomas e a masmorra sumiria da run
    if (bioma) cfg.semPortal = true;
    cfg.armadilhas = {
      tipos: this.dados.armadilhas.armadilhas,
      densidade: this.dados.armadilhas.densidade,
    };
    cfg.loja = this.dados.loja;

    // A arena do chefe tem pé-direito muito maior que a masmorra: ele
    // tem quase 3× a altura de um inimigo comum e atravessava o teto.
    if (this.ehAndarFinal) {
      const a = this.dados.chefeFinal.arena ?? {};
      cfg.dungeon = {
        ...cfg.dungeon,
        alturaParede: a.alturaParede ?? 11,
        arenaLargura: a.largura ?? 26,
        arenaAltura: a.altura ?? 26,
        densidadeTocha: 0,
        semTeto: !!a.semTeto,
      };
    }

    const mapa = this.ehAndarFinal
      ? gerarArenaChefe(this.andar, semente, cfg)
      : gerarMasmorra(this.andar, semente, cfg);

    this.mapa = mapa;
    this.nivel = new Nivel(mapa, cfg, tema);
    // a escada do penúltimo andar vira a boca do andar final
    this.nivel.portalFinal = this.andar === this.andarFinal - 1;
    this.nivel.chavesDoJogador = this.jogador.chaves;
    this.nivel.aoTentarTrancada = (abriu, cor) => {
      const nome = cor ? cor.nome : '';
      if (abriu) { Audio.sfx('pickup'); this.ganchos.aoAviso(`Porta ${nome} destrancada`); }
      else { Audio.sfx('block'); this.ganchos.aoAviso(`Trancada — precisa da chave ${nome}`); }
    };
    this.nivel.aoAbrirPorta = () => Audio.sfx('door');
    this.cena.add(this.nivel.construir());

    this.armadilhas = new Armadilhas(mapa, cfg, tema, this.dados.armadilhas, this.andar);
    this.cena.add(this.armadilhas.construir());
    // A névoa começava a 3,5 m e fechava em 30 — a masmorra virava breu a
    // dois passos. Agora ela só entra a partir de 11 m e fecha bem longe.
    this.cena.fog = new THREE.Fog(tema.nevoa, 11, 46 + this.andar * 0.3);
    this.jogador.chaves.clear();          // chaves não passam de andar para andar
    this.cena.background = new THREE.Color(tema.nevoa);

    // posiciona o jogador no centro da sala inicial
    const p = this.nivel.mundoDaCelula(mapa.inicio.cx, mapa.inicio.cy);
    this.jogador.pos.set(p.x, 0, p.z);
    // olha na direção da saída, para o jogador não começar de cara para a parede
    const s = this.nivel.posSaida;
    this.jogador.yaw = Math.atan2(-(s.x - p.x), -(s.z - p.z));
    this.jogador.pitch = 0;

    this._povoar(mapa, cfg);

    this.transicao = 1;
    if (!this.ehAndarFinal) {
      this.ganchos.aoAviso(`Andar ${this.andar} — ${tema.nome}: ${tema.lema}`);
    }
    if (this.ganchos.aoNovoAndar) this.ganchos.aoNovoAndar(mapa, tema, this.ehAndarFinal);
  }

  // ---------- arena do chefe final ----------
  // O último andar não é povoado como os outros: nada de inimigos
  // soltos, item ou loja. Só você, o corredor até a arena e ele.
  // Encher isso de esqueleto diluiria a única luta que importa.
  _montarArenaFinal(mapa) {
    const sala = mapa.saida;
    const p = this.nivel.mundoDaCelula(sala.cx, sala.cy);

    const def = sortearChefeFinal(this.dados.chefeFinal, this.andar, sementeAleatoria());
    this.defChefeFinal = def;

    const chefe = new ChefeFinal(def, p, this.nivel);
    chefe.aoMudarFase = fase => {
      Audio.sfx('chefeFase');
      Audio.intensificarMusicaChefe(fase);
      this.ganchos.aoAviso(fase >= 3 ? `${def.nome} está enfurecido` : `${def.nome} mudou`);
      this.rend.flashDano = Math.min(0.6, this.rend.flashDano + 0.3);
    };
    chefe.adicionarNaCena(this.cena);
    chefe.congelado = true;          // solto pela tela de apresentação
    this.chefeFinal = chefe;

    // O jogador entra pela outra ponta do salão, de frente para ele.
    const entrada = this.nivel.mundoDaCelula(mapa.inicio.cx, mapa.inicio.cy);
    this.jogador.pos.set(entrada.x, 0, entrada.z);
    this.jogador.yaw = Math.atan2(-(p.x - entrada.x), -(p.z - entrada.z));
    this.jogador.pitch = 0;
  }

  /** Dados da tela de apresentação do chefe. */
  apresentacaoChefe() {
    const d = this.defChefeFinal;
    const c = this.chefeFinal;
    if (!d || !c) return null;
    return {
      nome: d.nome,
      frase: d.frase,
      retrato: c.quadros.andar0.image.toDataURL(),
      corpo: d.pecas.corpo.nome,
      ataques: d.ataques.map(a => a.nome),
      luz: '#' + d.luz.toString(16).padStart(6, '0'),
    };
  }

  /** Fecha a apresentação e começa a luta de verdade. */
  comecarLutaFinal() {
    if (!this.chefeFinal) return;
    this.chefeFinal.congelado = false;
    Audio.iniciarMusicaChefe(this.defChefeFinal.semente, this.defChefeFinal.nome);
    this.ganchos.aoAviso(`${this.defChefeFinal.nome}`);
  }

  _povoar(mapa, cfg) {
    const dif = cfg.dificuldade;
    this.emboscada = null;
    this.mercador = null;
    this.portal = null;
    this.cfgAndar = cfg;

    if (this.ehAndarFinal) { this._montarArenaFinal(mapa); return; }
    const multQtd = 1 + (this.andar - 1) * dif.quantidadePorAndar;
    let total = 0;

    for (const sala of mapa.salas) {
      if (sala.tipo === TIPOS_SALA.INICIO) continue;

      if (sala.tipo === TIPOS_SALA.CHEFE) {
        const def = definicaoChefe(this.dados.inimigos, this.andar, this.rng);
        this._criarInimigo(def, sala.cx, sala.cy);
        this.ganchos.aoAviso(`Algo grande respira neste andar`);
        continue;
      }

      if (sala.tipo === TIPOS_SALA.ITEM) {
        this._criarColetavel(this._sortearItem(), sala.cx, sala.cy, true);
        continue;
      }

      // A sala do mercador fica limpa: ele é o único lugar seguro da
      // masmorra, e brigar dentro da loja tiraria o ponto de respiro
      // que justifica a loja existir.
      if (sala.tipo === TIPOS_SALA.LOJA) {
        this._criarMercador(sala);
        continue;
      }

      if (sala.tipo === TIPOS_SALA.PORTAL) {
        this._criarPortal(sala);
        continue;
      }

      if (sala.tipo === TIPOS_SALA.TESOURO) {
        const qtd = this.rng.int(3, 6);
        for (let i = 0; i < qtd; i++) {
          const cx = this.rng.int(sala.x, sala.x + sala.w - 1);
          const cy = this.rng.int(sala.y, sala.y + sala.h - 1);
          this._criarColetavel(this.dados.itens.itens.find(i2 => i2.id === 'bolsa_ouro'), cx, cy, false);
        }
      }

      const area = sala.w * sala.h;
      // o desvio é mais perigoso: é o preço de o lugar ser melhor
      const multDesvio = this.noDesvio ? (cfg.dungeon.desvioMultInimigo ?? 1.35) : 1;
      let qtd = Math.round(dif.inimigosPorSalaBase * multQtd * multDesvio * (area / 55));
      qtd = Math.max(1, Math.min(9, qtd));

      // sala de emboscada não é povoada agora: guarda a conta para
      // soltar tudo de uma vez quando o jogador pisar nela
      if (sala.emboscada) {
        this.emboscada = {
          sala,
          qtd: Math.min(cfg.dungeon.emboscadaMax ?? 8,
            Math.max(3, Math.round(qtd * (cfg.dungeon.emboscadaMultiplicador ?? 1.8)))),
          disparada: false,
        };
        continue;
      }

      for (let i = 0; i < qtd && total < dif.tetoInimigos; i++) {
        const cx = this.rng.int(sala.x, sala.x + sala.w - 1);
        const cy = this.rng.int(sala.y, sala.y + sala.h - 1);
        const def = sortearDefinicao(this.dados.inimigos, this.andar, this.rng, cfg);
        this._criarInimigo(def, cx, cy);
        total++;
      }
    }

    // ---------- espalhados pelo chão ----------
    // Relíquias fora de sala de item e frutas: são o que faz explorar
    // valer a pena. Sem isto, tudo de bom estava em duas salas e o
    // resto do andar era só caminho.
    const salasBoas = mapa.salas.filter(s =>
      s.tipo === TIPOS_SALA.COMBATE || s.tipo === TIPOS_SALA.TESOURO);
    const largar = (item, comPedestal = false) => {
      const sala = this.rng.escolher(salasBoas);
      if (!sala || !item) return;
      this._criarColetavel(item,
        this.rng.int(sala.x, sala.x + sala.w - 1),
        this.rng.int(sala.y, sala.y + sala.h - 1), comPedestal);
    };

    // ...e mais rico: é isso que paga o risco de atravessar o portal
    const multItem = this.noDesvio ? (cfg.dungeon.desvioMultItem ?? 2.2) : 1;
    const soltos = Math.round((cfg.dungeon.itensSoltosPorAndar ?? 2) * multItem);
    for (let i = 0; i < soltos; i++) {
      largar(this._sortearItem(), this.noDesvio && i < 2);
    }

    // uma arma largada no chão de vez em quando: é o que faz o próximo
    // corredor valer a pena, porque a arma do chefe pode ser uma que
    // você ainda não viu
    const armasDeRun = this.dados.armas.armas.filter(a => a.apenasNaRun);
    const chanceArma = (cfg.dungeon.chanceArmaNoChao ?? 0.5) * (this.noDesvio ? 1.6 : 1);
    if (armasDeRun.length && this.rng.chance(Math.min(0.95, chanceArma))) {
      const sala = this.rng.escolher(salasBoas);
      if (sala) {
        this._criarArmaNoChao(this.rng.ponderado(armasDeRun),
          this.rng.int(sala.x, sala.x + sala.w - 1),
          this.rng.int(sala.y, sala.y + sala.h - 1));
      }
    }

    let frutas = Math.round((cfg.dungeon.frutasPorAndar ?? 2) * multItem);
    if (this.rng.chance(cfg.dungeon.chanceFrutaExtra ?? 0.45)) frutas++;
    const poolFrutas = this.dados.itens.itens.filter(i => i.fruta);
    for (let i = 0; i < frutas && poolFrutas.length; i++) {
      largar(this.rng.escolher(poolFrutas));
    }

    // uma poção de consolo espalhada pelo andar
    if (this.rng.chance(0.7)) {
      const sala = this.rng.escolher(mapa.salas.filter(s => s.tipo === TIPOS_SALA.COMBATE)) || mapa.salas[1];
      if (sala) this._criarColetavel(
        this.dados.itens.itens.find(i => i.id === 'pocao_menor'),
        this.rng.int(sala.x, sala.x + sala.w - 1),
        this.rng.int(sala.y, sala.y + sala.h - 1), false);
    }

    // chaves das portas trancadas — o gerador já garantiu que cada uma
    // está do lado de cá da fechadura que ela abre
    for (const c of mapa.chaves || []) {
      this._criarChave(c);
    }
  }

  // ---------- portal para os biomas ----------
  // Um anel de pé no chão, girando, com a cor do lugar para onde leva
  // — azul de luar para a Superfície, laranja de brasa para a
  // Escadaria. A cor É a informação: você sabe para onde vai antes de
  // atravessar, e decide.
  _criarPortal(sala) {
    const bioma = this.rng.escolher(NOMES_BIOMAS);
    const def = biomaPorNome(bioma);
    const p = this.nivel.mundoDaCelula(sala.cx, sala.cy);
    const cor = def.luz;

    const anel = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.20, 8, 24),
      new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9 })
    );
    anel.position.set(p.x, 1.7, p.z);
    this.cena.add(anel);

    const veu = new THREE.Mesh(
      new THREE.CircleGeometry(1.42, 24),
      new THREE.MeshBasicMaterial({
        color: cor, transparent: true, opacity: 0.34,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    veu.position.copy(anel.position);
    this.cena.add(veu);

    const luz = new THREE.PointLight(cor, 7, this.nivel.C * 7, 2);
    luz.position.set(p.x, 2.2, p.z);
    this.cena.add(luz);

    this.portal = { bioma, def, anel, veu, luz, pos: p, avisou: false };
    this.ganchos.aoAviso(`Há um portal neste andar — ${def.nome}`);
  }

  get podeAtravessar() {
    const p = this.portal;
    if (!p) return false;
    return Math.hypot(p.pos.x - this.jogador.pos.x, p.pos.z - this.jogador.pos.z) < 1.9;
  }

  atravessarPortal() {
    if (!this.portal) return false;
    const bioma = this.portal.bioma;
    Audio.sfx('portal');
    this.proximoAndar(bioma);
    return true;
  }

  _descartarPortal() {
    const p = this.portal;
    if (!p) return;
    for (const o of [p.anel, p.veu]) {
      this.cena.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.cena.remove(p.luz);
    this.portal = null;
  }

  _criarMercador(sala) {
    const p = this.nivel.mundoDaCelula(sala.cx, sala.cy);
    const tex = gerarMercador();
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(2.0, 2.6, 1);
    spr.position.set(p.x, 1.3, p.z);
    this.cena.add(spr);

    // luz dourada própria: é o que faz o jogador andar até lá antes
    // mesmo de saber o que tem ali
    const luz = new THREE.PointLight(0xE3B23C, 5.5, this.nivel.C * 6, 2);
    luz.position.set(p.x, 2.4, p.z);
    this.cena.add(luz);

    this.mercador = {
      spr, mat, tex, luz, pos: p,
      estoque: this.loja ? this.loja.montarEstoque(this.rng, this.poolItens, this.andar) : [],
    };
  }

  // Arma largada no chão. Fica num pedestal com luz própria, porque
  // trocar de arma é a decisão mais pesada da run e não pode passar
  // despercebida no meio de bolsa de ouro e poção.
  _criarArmaNoChao(arma, cx, cy) {
    if (!arma) return;
    const p = this.nivel.mundoDaCelula(cx, cy);
    const tex = FABRICA_ARMA[arma.sprite]?.();
    if (!tex) return;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const razao = tex.image.width / tex.image.height;
    spr.scale.set(1.6 * razao, 1.6, 1);
    spr.position.set(p.x, 1.35, p.z);
    this.cena.add(spr);

    const luz = new THREE.PointLight(0xBFD8FF, 4, this.nivel.C * 5, 2);
    luz.position.set(p.x, 1.9, p.z);
    this.cena.add(luz);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 0.8, 6),
      new THREE.MeshLambertMaterial({ color: 0x3A4048 })
    );
    pedestal.position.set(p.x, 0.4, p.z);
    this.cena.add(pedestal);

    this.coletaveis.push({
      arma, item: { id: `arma_${arma.id}`, nome: arma.nome, descricao: arma.lema },
      spr, mat, tex, luz, pedestal, fase: Math.random() * 6.28,
    });
  }

  /** Troca a arma da run. A anterior some — é escolha, não mochila. */
  trocarArma(arma) {
    const j = this.jogador;
    const antiga = j.arma?.nome ?? '';
    if (this.arma) this.arma.descartar();
    this.arma = new ArmaJogador(arma);
    this.arma.aoAcertar = () => this._resolverAtaque();
    this.arma.redimensionar(this.aspect || 16 / 9);
    j.arma = arma;
    this.armaDaRun = arma;
    Audio.sfx('trocarArma');
    this.ganchos.aoAviso(`${arma.nome} — ${arma.descricao}`);
    return antiga;
  }

  _criarChave(c) {
    const p = this.nivel.mundoDaCelula(c.x, c.y);
    const tex = gerarSpriteChave(c.corHex);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.8, 0.8, 1);
    spr.position.set(p.x, 1.0, p.z);
    this.cena.add(spr);

    const luz = new THREE.PointLight(c.cor, 3.2, 6.5, 2);
    luz.position.copy(spr.position);
    this.cena.add(luz);

    this.coletaveis.push({
      chave: c,
      item: { id: `chave_${c.id}`, nome: `Chave ${c.nome}`, descricao: 'Abre a porta da mesma cor.' },
      spr, mat, tex, luz, pedestal: null, fase: Math.random() * 6.28,
    });
  }

  _sortearItem() {
    // frutas têm peso 0 e são distribuídas à parte; deixá-las no
    // sorteio ponderado faria elas nunca saírem e ainda sujaria o pool
    const pool = this.poolItens.filter(i =>
      !i.fruta && (!i.consumivel || this.rng.chance(0.35)));
    return this.rng.ponderado(pool.length ? pool : this.poolItens);
  }

  _criarInimigo(def, cx, cy) {
    const p = this.nivel.mundoDaCelula(cx, cy);
    const ini = new Inimigo(def, p, this.nivel);
    ini.adicionarNaCena(this.cena);
    this.inimigos.push(ini);
  }

  _criarColetavel(item, cx, cy, comPedestal) {
    if (!item) return;
    const p = this.nivel.mundoDaCelula(cx, cy);
    const tex = gerarSpriteItem(item.sprite);
    const cor = this.dados.itens.raridades[item.raridade]?.cor ?? '#FFFFFF';
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.85, 0.85, 1);
    spr.position.set(p.x, 1.0, p.z);
    this.cena.add(spr);

    let luz = null;
    const brilho = this.dados.itens.raridades[item.raridade]?.brilho ?? 0;
    if (brilho > 0.3) {
      luz = new THREE.PointLight(new THREE.Color(cor).getHex(), 3 * brilho, 6, 2);
      luz.position.copy(spr.position);
      this.cena.add(luz);
    }

    let pedestal = null;
    if (comPedestal) {
      pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.75, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: 0x4A443A })
      );
      pedestal.position.set(p.x, 0.45, p.z);
      this.cena.add(pedestal);
    }

    this.coletaveis.push({ item, spr, mat, tex, luz, pedestal, fase: Math.random() * 6.28 });
  }

  // ---------- combate ----------
  // TUDO que pode levar dano do jogador. O chefe final não mora em
  // `inimigos` — ele tem estado e ciclo próprios —, e por isso ficou
  // fora dos resolvedores de golpe e de tiro: a barra dele nunca
  // descia e ele era imortal. Quem atira precisa enxergar os dois.
  _alvosAtacaveis() {
    return this.chefeFinal ? [...this.inimigos, this.chefeFinal] : this.inimigos;
  }

  // Dispara o resolvedor certo para a arma equipada.
  _resolverAtaque() {
    if (this.arma.tipo === 'distancia') this._resolverTiro();
    else this._resolverGolpe();
  }

  // ---------- tiro de escopeta ----------
  // Cada chumbo é resolvido separadamente: sorteia um desvio dentro do
  // cone e procura o inimigo mais próximo naquela linha. É isso que faz
  // a arma ser devastadora colada e quase inútil longe — de perto o cone
  // ainda é estreito e todos os chumbos entram no mesmo alvo; a 10 m ele
  // já abriu, e cada chumbo que acerta chega enfraquecido.
  _resolverTiro() {
    const j = this.jogador;
    const w = this.arma.def;
    const dir = new THREE.Vector3(-Math.sin(j.yaw), 0, -Math.cos(j.yaw));
    const origem = new THREE.Vector3(j.pos.x, 0, j.pos.z);

    const alvos = this._alvosAtacaveis().filter(i => !i.morto).map(ini => {
      const d = new THREE.Vector3(ini.pos.x - origem.x, 0, ini.pos.z - origem.z);
      const dist = d.length();
      return { ini, dist, dir: d.normalize() };
    }).filter(a => a.dist <= w.alcanceMaximo && a.dir.dot(dir) > 0.2)
      .sort((a, b) => a.dist - b.dist);

    const danoPorAlvo = new Map();
    let chumbosNoAlvo = 0;

    for (let c = 0; c < w.chumbos; c++) {
      const desvio = (Math.random() - 0.5) * w.abertura;
      const ang = j.yaw + desvio;
      const linha = new THREE.Vector3(-Math.sin(ang), 0, -Math.cos(ang));

      for (const a of alvos) {
        // largura angular do inimigo àquela distância
        const meio = Math.atan2(a.ini.raio + 0.25, Math.max(0.5, a.dist));
        const cos = a.dir.dot(linha);
        if (cos < Math.cos(meio)) continue;
        if (!this.nivel.temVisao(origem, new THREE.Vector3(a.ini.pos.x, 0, a.ini.pos.z))) break;

        // queda de dano: cheio até distanciaCheia, despencando até o máximo
        const t = Math.max(0, Math.min(1,
          (a.dist - w.distanciaCheia) / (w.alcanceMaximo - w.distanciaCheia)));
        const fator = 1 - t * (1 - w.quedaMinima);
        danoPorAlvo.set(a.ini, (danoPorAlvo.get(a.ini) ?? 0) + w.dano * fator);
        chumbosNoAlvo++;
        break;   // o chumbo para no primeiro que atinge
      }
    }

    let matou = false;
    for (const [ini, bruto] of danoPorAlvo) {
      const critico = Math.random() < j.critico;
      let dano = bruto * (1 + j.mods.dano / 22) * (critico ? this.dados.balanceamento.jogador.multCritico : 1);
      if (j.mods.queimar > 0) dano *= 1.15;
      const aplicado = ini.receberDano(dano);
      if (j.mods.roubo > 0) j.curar(Math.round(aplicado * j.mods.roubo));
      // o chefe final contabiliza a própria morte em _atualizarChefe,
      // junto com a vitória; contar aqui pagaria o ouro duas vezes
      if (ini.morto && !ini.def.chefeFinal) { matou = true; this._registrarAbate(ini); }
    }

    if (chumbosNoAlvo === 0) Audio.sfx('hitWall');
    else Audio.sfx('hit');
    // "em cheio" só faz sentido para arma de vários projéteis: com o
    // arco, todo acerto seria "em cheio" e o aviso viraria ruído
    if (!matou && w.chumbos > 1 && chumbosNoAlvo >= w.chumbos * 0.8) {
      this.ganchos.aoAviso('Acertou em cheio');
    }
    this.rend.flashDano = Math.min(0.35, this.rend.flashDano + (w.coice ?? 4) * 0.033);
    if (w.somRecarga) setTimeout(() => Audio.sfx(w.somRecarga), w.atrasoRecarga ?? 260);
  }

  // Contabiliza o abate uma vez só, venha de golpe ou de tiro.
  _registrarAbate(ini) {
    const j = this.jogador;
    this.resumo.abates += 1;
    const ouro = Math.round(ini.def.ouro * j.mods.ouroDobro);
    j.ouro += ouro;
    this.resumo.ouro += ouro;
    if (ini.def.chefe) {
      this.resumo.chefes += 1;
      this.ganchos.aoAviso(`${ini.def.nome} tombou`);
    }
  }

  _resolverGolpe() {
    const j = this.jogador;
    const dir = new THREE.Vector3(-Math.sin(j.yaw), 0, -Math.cos(j.yaw));
    const origem = new THREE.Vector3(j.pos.x, 0, j.pos.z);
    let acertou = false;

    for (const ini of this._alvosAtacaveis()) {
      if (ini.morto) continue;
      const d = new THREE.Vector3(ini.pos.x - origem.x, 0, ini.pos.z - origem.z);
      const dist = d.length();
      if (dist > j.alcance + ini.raio) continue;
      d.normalize();
      const arco = this.arma.def.arco ?? 0.35;   // 0 = varre tudo à frente
      if (d.dot(dir) < arco) continue;

      const critico = Math.random() < j.critico;
      let dano = j.dano * (critico ? this.dados.balanceamento.jogador.multCritico : 1);
      if (j.mods.queimar > 0) dano *= 1.15;
      const aplicado = ini.receberDano(dano);
      acertou = true;

      if (j.mods.roubo > 0) j.curar(Math.round(aplicado * j.mods.roubo));
      if (critico) this.ganchos.aoAviso('Golpe crítico!');

      if (ini.morto && !ini.def.chefeFinal) this._registrarAbate(ini);
    }

    Audio.sfx(acertou ? 'hit' : 'hitWall');
  }

  // ---------- loja ----------
  /** Está perto o bastante do mercador para o E valer? */
  get podeComprar() {
    const m = this.mercador;
    if (!m) return false;
    return Math.hypot(m.pos.x - this.jogador.pos.x, m.pos.z - this.jogador.pos.z) < this.nivel.C * 1.3;
  }

  // O desconto sai da bolsa E do resumo da run. É esse segundo desconto
  // que dá peso à compra: o ouro gasto aqui nunca chega ao cofre, então
  // comprar é trocar força na próxima run por sobrevivência nesta.
  comprar(entrada) {
    const j = this.jogador;
    if (!entrada || j.ouro < entrada.preco) return false;

    j.ouro -= entrada.preco;
    this.resumo.ouro = Math.max(0, this.resumo.ouro - entrada.preco);

    if (entrada.servico) {
      if (entrada.efeito.tipo === 'pocao') j.pocoes += entrada.efeito.valor;
      else j.aplicarEfeito(entrada.efeito, +1);
    } else {
      j.pegarItem(entrada.item);
    }
    return true;
  }

  // ---------- habilidades especiais (tecla F) ----------
  // São o oposto da relíquia passiva: você decide QUANDO usar. Cada
  // uma resolve um problema diferente — cercado, longe demais, sem
  // vida — e todas compartilham a mesma recarga, para pegar duas não
  // virar dois botões.
  _usarEspecial() {
    const j = this.jogador;
    if (!j.especialPronto) return false;
    const id = j.especiais[0];
    const dir = new THREE.Vector3(-Math.sin(j.yaw), 0, -Math.cos(j.yaw));
    const alvos = this._alvosAtacaveis().filter(i => !i.morto);
    const base = j.dano;
    let usou = true;

    const ferir = (ini, dano) => {
      const aplicado = ini.receberDano(dano);
      if (j.mods.roubo > 0) j.curar(Math.round(aplicado * j.mods.roubo));
      if (ini.morto && !ini.def.chefeFinal) this._registrarAbate(ini);
    };
    const emVolta = (raio, dano, aoAtingir) => {
      for (const ini of alvos) {
        const d = Math.hypot(ini.pos.x - j.pos.x, ini.pos.z - j.pos.z);
        if (d > raio) continue;
        ferir(ini, dano);
        if (aoAtingir) aoAtingir(ini);
      }
    };
    const noCone = (alcance, cosMin, dano) => {
      for (const ini of alvos) {
        const dx = ini.pos.x - j.pos.x, dz = ini.pos.z - j.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > alcance) continue;
        if ((dx / (d || 1)) * dir.x + (dz / (d || 1)) * dir.z < cosMin) continue;
        ferir(ini, dano);
      }
    };

    if (id === 'bolaFogo') {
      // linha reta que NÃO para no primeiro: atravessa a fila inteira
      noCone(20, 0.94, base * 2.6);
      this.ganchos.aoAviso('Bola de fogo');
      Audio.sfx('especialFogo');

    } else if (id === 'estilhaco') {
      noCone(7.5, 0.35, base * 1.5);
      this.ganchos.aoAviso('Estilhaços');
      Audio.sfx('especialEstilhaco');

    } else if (id === 'repulsa') {
      emVolta(8.5, base * 1.8, ini => ini.atordoar?.(1.6));
      this.ganchos.aoAviso('Repulsa');
      Audio.sfx('especialSino');

    } else if (id === 'piscar') {
      // arremessa para frente atravessando tudo, queimando o caminho
      const destino = new THREE.Vector3(j.pos.x + dir.x * 9, 0, j.pos.z + dir.z * 9);
      noCone(9.5, 0.80, base * 1.9);
      for (let p = 1; p <= 12; p++) {
        const t = p / 12;
        const x = j.pos.x + (destino.x - j.pos.x) * t;
        const z = j.pos.z + (destino.z - j.pos.z) * t;
        const c = this.nivel.celulaDe(x, z);
        if (this.nivel.solidoNaCelula(c.cx, c.cy)) break;
        j.pos.set(x, 0, z);
      }
      j.invulneravel = Math.max(j.invulneravel, 0.35);
      this.ganchos.aoAviso('Piscar');
      Audio.sfx('especialPiscar');

    } else if (id === 'drenar') {
      let melhor = null, melhorD = 99;
      for (const ini of alvos) {
        const d = Math.hypot(ini.pos.x - j.pos.x, ini.pos.z - j.pos.z);
        if (d < melhorD) { melhorD = d; melhor = ini; }
      }
      if (melhor && melhorD < 14) {
        const dano = base * 2.2;
        ferir(melhor, dano);
        j.curar(Math.round(dano * 0.55));
        this.ganchos.aoAviso('Drenado');
        Audio.sfx('especialDrenar');
      } else { usou = false; }

    } else if (id === 'tempestade') {
      this.tempestade = { restante: 3.0, acum: 0, dano: base * 0.75 };
      this.ganchos.aoAviso('Tempestade');
      Audio.sfx('especialTempestade');

    } else { usou = false; }

    if (usou) {
      j.recargaEspecial = j.recargaEspecialMax;
      this.rend.flashDano = Math.min(0.4, this.rend.flashDano + 0.18);
    }
    return usou;
  }

  // A tempestade castiga a sala por alguns segundos depois de acionada.
  _atualizarTempestade(dt) {
    const t = this.tempestade;
    if (!t) return;
    t.restante -= dt;
    t.acum += dt;
    while (t.acum >= 0.28) {
      t.acum -= 0.28;
      const j = this.jogador;
      for (const ini of this._alvosAtacaveis()) {
        if (ini.morto) continue;
        if (Math.hypot(ini.pos.x - j.pos.x, ini.pos.z - j.pos.z) > 15) continue;
        const aplicado = ini.receberDano(t.dano);
        if (j.mods.roubo > 0) j.curar(Math.round(aplicado * j.mods.roubo));
        if (ini.morto && !ini.def.chefeFinal) this._registrarAbate(ini);
      }
      Audio.sfx('especialTrovao');
      this.rend.flashDano = Math.min(0.3, this.rend.flashDano + 0.1);
    }
    if (t.restante <= 0) this.tempestade = null;
  }

  // ---------- chefe final ----------
  _atualizarChefe(dt, j) {
    const c = this.chefeFinal;

    c.atualizar(dt, j, this.nivel, {
      aoAtacarJogador: dano => this._danoNoJogador(dano),
      aoAviso: txt => this.ganchos.aoAviso(txt),
      aoAcordar: () => this.ganchos.aoAviso('Ele viu você'),
    });

    if (c.remover) {
      // ele caiu: a run acabou e você saiu vivo
      c.removerDaCena(this.cena);
      this.chefeFinal = null;
      this.resumo.chefes += 1;
      this.resumo.chefeFinal = this.defChefeFinal?.nome ?? '';
      const ouro = this.defChefeFinal?.ouro ?? 600;
      j.ouro += ouro;
      this.resumo.ouro += ouro;
      this.ativo = false;
      Audio.pararMusica();
      Audio.sfx('vitoria');
      this.ganchos.aoVencer(this.resumo);
    }
  }

  // Dano vindo do chefe. Passa pelo escudo (dá para bloquear e aparar
  // uma investida) mas não pelo aparo automático: aparar coisa grande
  // exige o tempo certo, como com qualquer inimigo.
  _danoNoJogador(dano) {
    const j = this.jogador;
    const bloqueando = j.bloqueando;
    const sofrido = j.receberDano(dano);
    if (sofrido <= 0) return;
    Audio.sfx(bloqueando ? 'block' : 'hurt');
    if (bloqueando) {
      this.arma.flashBloqueio();
      if (j.guardaQuebrada) this.ganchos.aoAviso('Guarda quebrada!');
    }
    this.rend.flashDano = Math.min(1, this.rend.flashDano + sofrido / 45);
    this.dirDano = 0;
  }

  /** Estado da barra do chefe, ou null se não há chefe na tela. */
  estadoChefe() {
    const c = this.chefeFinal;
    if (!c || c.morto) return null;
    return {
      nome: this.defChefeFinal.nome,
      pct: c.vidaPct,
      fase: c.fase,
      limites: this.defChefeFinal.fases.map(f => f.limite),
    };
  }

  // ---------- emboscada ----------
  // Os inimigos nascem NA BORDA da sala, nunca em cima do jogador: um
  // bicho aparecendo dentro do seu raio de colisão seria dano grátis, e
  // dano grátis não é susto, é injustiça. Nascendo na parede, você tem o
  // tempo de atravessar a sala para reagir.
  _checarEmboscada(j) {
    const e = this.emboscada;
    if (!e || e.disparada) return;
    const c = this.nivel.celulaDe(j.pos.x, j.pos.z);
    const s = e.sala;
    if (c.cx < s.x || c.cx >= s.x + s.w || c.cy < s.y || c.cy >= s.y + s.h) return;

    e.disparada = true;
    const borda = [];
    for (let x = s.x; x < s.x + s.w; x++) { borda.push([x, s.y], [x, s.y + s.h - 1]); }
    for (let y = s.y + 1; y < s.y + s.h - 1; y++) { borda.push([s.x, y], [s.x + s.w - 1, y]); }

    const longe = borda.filter(([x, y]) => {
      if (this.nivel.solidoNaCelula(x, y)) return false;
      const p = this.nivel.mundoDaCelula(x, y);
      return Math.hypot(p.x - j.pos.x, p.z - j.pos.z) > this.nivel.C * 2;
    });
    const vagas = this.rng.embaralhar(longe.length >= e.qtd ? longe : borda);

    for (let i = 0; i < e.qtd && i < vagas.length; i++) {
      const def = sortearDefinicao(this.dados.inimigos, this.andar, this.rng, this.cfgAndar);
      this._criarInimigo(def, vagas[i][0], vagas[i][1]);
    }

    Audio.sfx('emboscada');
    this.rend.flashDano = Math.min(0.5, this.rend.flashDano + 0.22);
    this.ganchos.aoAviso('Emboscada! A sala estava vazia por um motivo');
  }

  // ---------- armadilhas ----------
  // Armadilha ignora o escudo de propósito: bloquear uma lâmina é
  // perícia, "bloquear" o chão que se abre seria só ruído. O que ela
  // respeita são os quadros de invulnerabilidade, para dois espinhos
  // colados não somarem num quadro só.
  _resolverArmadilhas(dt, j) {
    if (!this.armadilhas) return;
    const r = this.armadilhas.atualizar(dt, j.pos);
    j.lentidao = r.lentidao;
    if (r.dano <= 0) return;

    const antes = j.vida;
    const bloqueava = j.bloqueando;
    j.bloqueando = false;
    const sofrido = j.receberDano(r.dano);
    j.bloqueando = bloqueava;
    if (sofrido <= 0) return;

    const id = r.tipo.id;
    Audio.sfx(id === 'espinhos' ? 'espinhos' : id === 'jato_fogo' ? 'jatoFogo' : 'lodo');
    this.rend.flashDano = Math.min(1, this.rend.flashDano + sofrido / 45);
    this.dirDano = 0;
    // o lodo dói o tempo todo; avisar a cada pulso encheria a tela
    if (id !== 'lodo' || antes - j.vida > 6) this.ganchos.aoAviso(r.tipo.aviso);
  }

  _inimigoAtaca(ini) {
    const j = this.jogador;
    const aparou = j.bloqueando && j.tempoBloqueio <= this.dados.balanceamento.jogador.janelaAparo;

    if (aparou) {
      Audio.sfx('parry');
      this.arma.flashAparo();              // clarão dourado no escudo
      ini.atordoar(1.1);                   // o inimigo cambaleia e fica aberto
      j.estamina = Math.min(j.cfg.estaminaMax, j.estamina + 18);
      this.ganchos.aoAviso('APARADO!');
      if (j.mods.reflexo > 0) ini.receberDano(ini.def.dano * j.mods.reflexo);
      return;
    }

    const bloqueando = j.bloqueando;
    const sofrido = j.receberDano(ini.def.dano);
    if (sofrido > 0) {
      Audio.sfx(bloqueando ? 'block' : 'hurt');
      if (bloqueando) {
        this.arma.flashBloqueio();
        if (j.guardaQuebrada) this.ganchos.aoAviso('Guarda quebrada!');
      }
      // de que lado veio o golpe (só para o rosto da HUD olhar)
      const dir = new THREE.Vector3(-Math.sin(j.yaw), 0, -Math.cos(j.yaw));
      const para = new THREE.Vector3(ini.pos.x - j.pos.x, 0, ini.pos.z - j.pos.z).normalize();
      const cruz = dir.x * para.z - dir.z * para.x;
      this.dirDano = cruz > 0.2 ? 1 : cruz < -0.2 ? -1 : 0;
      this.rend.flashDano = Math.min(1, this.rend.flashDano + sofrido / 55);
    }
  }

  // ---------- laço ----------
  atualizar(dt) {
    if (!this.ativo) return;
    this.tempo += dt;
    this.resumo.tempo += dt;
    const j = this.jogador;

    // antes do jogador, porque a lentidão do lodo precisa valer já
    // no deslocamento deste quadro
    this._resolverArmadilhas(dt, j);
    this._checarEmboscada(j);

    j.atualizar(dt, this.nivel);

    // ataque
    if ((Input.botaoAgora[0] || Input.apertou('Space')) && !j.bloqueando) {
      if (j.estamina >= j.custoAtaque) {
        if (this.arma.atacar(j.cadencia)) {
          j.estamina -= j.custoAtaque;
        }
      }
    }

    // habilidade especial
    if (Input.apertou('KeyF')) {
      if (!j.temEspecial) this.ganchos.aoAviso('Você não tem habilidade especial');
      else if (!j.especialPronto) Audio.sfx('uiBack');
      else this._usarEspecial();
    }
    this._atualizarTempestade(dt);

    // poção
    if (Input.apertou('KeyQ') && j.pocoes > 0 && j.vida < j.vidaMax) {
      j.pocoes -= 1;
      j.curar(30);
      Audio.sfx('pickup');
      this.ganchos.aoAviso('Poção bebida');
    }

    this.arma.atualizar(dt, j);
    this.nivel.atualizar(dt, j.pos);

    // chefe final
    if (this.chefeFinal) this._atualizarChefe(dt, j);

    // inimigos
    for (const ini of this.inimigos) {
      ini.atualizar(dt, j, this.nivel, alvo => this._inimigoAtaca(alvo));
    }
    for (let i = this.inimigos.length - 1; i >= 0; i--) {
      if (this.inimigos[i].remover) {
        this.inimigos[i].removerDaCena(this.cena);
        this.inimigos.splice(i, 1);
      }
    }

    // portal: gira e avisa quando dá para atravessar
    if (this.portal) {
      const p = this.portal;
      p.anel.rotation.z += dt * 0.9;
      p.anel.rotation.x = Math.PI / 2 + Math.sin(this.tempo * 1.3) * 0.10;
      p.veu.rotation.z -= dt * 1.4;
      p.veu.material.opacity = 0.26 + 0.12 * Math.sin(this.tempo * 3.1);
      p.luz.intensity = 6 + 2.2 * Math.sin(this.tempo * 2.7);
      const perto = this.podeAtravessar;
      if (perto && !p.avisou) {
        p.avisou = true;
        this.ganchos.aoAviso(`E para atravessar — ${p.def.nome}`);
      }
      if (!perto) p.avisou = false;
    }

    // mercador: flutua e avisa quando dá para negociar
    if (this.mercador) {
      const m = this.mercador;
      m.spr.position.y = 1.3 + Math.sin(this.tempo * 1.5) * 0.08;
      m.luz.intensity = 5.0 + Math.sin(this.tempo * 2.2) * 1.2;
      const perto = this.podeComprar;
      if (perto && !m.avisou) { m.avisou = true; this.ganchos.aoAviso('E para negociar'); }
      if (!perto) m.avisou = false;
    }

    // coletáveis
    for (let i = this.coletaveis.length - 1; i >= 0; i--) {
      const c = this.coletaveis[i];
      c.spr.position.y = 1.0 + Math.sin(this.tempo * 2.2 + c.fase) * 0.14;
      c.mat.rotation = Math.sin(this.tempo * 1.4 + c.fase) * 0.12;
      if (c.luz) c.luz.position.copy(c.spr.position);

      const d = Math.hypot(c.spr.position.x - j.pos.x, c.spr.position.z - j.pos.z);
      if (d < 1.25) {
        this._coletar(c);
        this.coletaveis.splice(i, 1);
      }
    }

    // saída — no andar final não há escada: a saída é matar o chefe
    if (!this.ehAndarFinal) {
      const dSaida = Math.hypot(this.nivel.posSaida.x - j.pos.x, this.nivel.posSaida.z - j.pos.z);
      if (dSaida < 1.6) {
        Audio.sfx('stairs');
        this.proximoAndar();
        return;
      }
    }

    // câmera e pós
    j.aplicarNaCamera(this.camera);
    this.rend.flashDano = Math.max(0, this.rend.flashDano - dt * 1.6);
    this.transicao = Math.max(0, this.transicao - dt * 1.4);

    if (j.morto) {
      this.ativo = false;
      Audio.sfx('die');
      Audio.pararMusica();
      this.ganchos.aoMorrer(this.resumo);
    }
  }

  _coletar(c) {
    const j = this.jogador;
    const item = c.item;

    if (c.arma) {
      this.trocarArma(c.arma);
    } else if (c.chave) {
      j.chaves.add(c.chave.id);
      this.nivel.chavesDoJogador = j.chaves;
      Audio.sfx('gold');
      this.ganchos.aoAviso(`Chave ${c.chave.nome} — procure a porta da mesma cor`);
    } else if (item.id === 'pocao_menor') {
      j.pocoes += 1;
      Audio.sfx('pickup');
      this.ganchos.aoAviso('Poção guardada');
    } else if (item.fruta) {
      j.aplicarEfeito({ ...item.efeito, nome: item.nome }, +1);
      Audio.sfx('fruta');
      this.ganchos.aoAviso(`${item.nome} — ${item.descricao}`);
    } else if (item.efeito.tipo === 'ouro') {
      const v = Math.round(item.efeito.valor * j.mods.ouroDobro);
      j.ouro += v;
      this.resumo.ouro += v;
      Audio.sfx('gold');
      this.ganchos.aoAviso(`+${v} de ouro`);
    } else {
      j.pegarItem(item);
      Audio.sfx('pickup');
      this.ganchos.aoAviso(`${item.nome} — ${item.descricao}`);
    }

    this.cena.remove(c.spr);
    if (c.luz) this.cena.remove(c.luz);
    if (c.pedestal) { this.cena.remove(c.pedestal); c.pedestal.geometry.dispose(); c.pedestal.material.dispose(); }
    c.mat.dispose(); c.tex.dispose();
  }

  estadoHud() {
    const j = this.jogador;
    const p = Progresso.data;
    return {
      vida: j.vida, vidaMax: j.vidaMax,
      armaduraPct: j.armaduraPct,
      estamina: j.estamina, estaminaMax: j.cfg.estaminaMax,
      guardaQuebrada: !!j.guardaQuebrada,
      pocoes: j.pocoes,
      reliquias: Math.min(6, j.inventario.length),
      ouro: j.ouro, ouroCofre: p.ouroTotal,
      abates: this.resumo.abates, abatesTotal: p.abates,
      andar: this.andar, recorde: p.recorde,
      chaves: { ouro: j.chaves.has('ouro'), safira: j.chaves.has('safira'), rubi: j.chaves.has('rubi') },
      morto: j.morto,
      dirDano: this.dirDano,
      dash: {
        cargas: j.dashCargas, max: j.dashMax,
        // fração da próxima carga, para a barrinha encher aos poucos
        parcial: j.dashCargas >= j.dashMax ? 0
          : 1 - Math.max(0, j.dashRecargaAtual) / (j.cfg.dashRecarga ?? 1.15),
      },
      deslizando: j.deslizando,
      especial: j.temEspecial
        ? { id: j.especiais[0], pronto: j.especialPronto,
            parcial: 1 - j.recargaEspecial / j.recargaEspecialMax }
        : null,
      frutas: j.temporarios.map(t => ({ nome: t.nome, restante: t.restante })),
    };
  }

  // Dados que o minimapa precisa. Recalculado por frame porque
  // itens somem ao serem pegos e portas mudam de cor ao destrancar.
  estadoMinimapa() {
    const m = this.mapa;
    if (!m) return null;
    const j = this.jogador;
    const c0 = this.nivel.celulaDe(j.pos.x, j.pos.z);
    const cel = { x: c0.cx, y: c0.cy };

    const CORES = { ouro: '#E3B23C', safira: '#5A9AE0', rubi: '#C4322A' };
    const portas = m.portas.map(p => ({
      x: p.x, y: p.y,
      trancada: p.trancada && !this.nivel.portasDestrancadas.has(`${p.x},${p.y}`),
      cor: p.trancada ? CORES[p.trancada] : '#8A8070',
    }));

    const coletaveis = this.coletaveis.map(c => {
      const cc = this.nivel.celulaDe(c.spr.position.x, c.spr.position.z);
      return { x: cc.cx, y: cc.cy, cor: c.chave ? (CORES[c.chave.id] || '#E3B23C') : '#6AA8E0' };
    });

    return {
      cel, yaw: j.yaw, portas, coletaveis,
      saida: { x: m.saida.cx, y: m.saida.cy },
      andar: this.andar,
    };
  }

  renderizar() {
    this.rend.renderizar(this.cena, this.camera, this.arma.cena, this.arma.camera, this.tempo);
  }

  // ---------- limpeza ----------
  _descartarNivel() {
    if (this.chefeFinal) {
      this.chefeFinal.removerDaCena(this.cena);
      this.chefeFinal = null;
    }
    for (const ini of this.inimigos) ini.removerDaCena(this.cena);
    this.inimigos.length = 0;
    for (const c of this.coletaveis) {
      this.cena.remove(c.spr);
      if (c.luz) this.cena.remove(c.luz);
      if (c.pedestal) { this.cena.remove(c.pedestal); c.pedestal.geometry.dispose(); c.pedestal.material.dispose(); }
      c.mat.dispose(); c.tex.dispose();
    }
    this.coletaveis.length = 0;
    this._descartarPortal();
    if (this.mercador) {
      const m = this.mercador;
      this.cena.remove(m.spr);
      this.cena.remove(m.luz);
      m.mat.dispose(); m.tex.dispose();
      this.mercador = null;
    }
    if (this.armadilhas) {
      this.cena.remove(this.armadilhas.grupo);
      this.armadilhas.descartar();
      this.armadilhas = null;
    }
    if (this.nivel) {
      this.cena.remove(this.nivel.grupo);
      this.nivel.descartar();
      this.nivel = null;
    }
  }

  limpar() {
    this._descartarNivel();
    this.ativo = false;
    Audio.pararMusica();
  }
}
