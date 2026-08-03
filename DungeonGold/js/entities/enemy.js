// ============================================================
// Inimigos.
//
// Procedural aqui significa: o arquétipo dá a forma, o andar dá
// a escala de poder, o RNG dá o desvio individual e o afixo dá
// a personalidade visual. Dois esqueletos do andar 7 nunca têm
// os mesmos números.
// ============================================================

import * as THREE from 'three';
import { gerarQuadrosInimigo, PALETAS, AFIXOS, aplicarAfixo, texturaBarra } from '../gfx/sprites.js';
import { Audio } from '../core/audio.js';

const cacheQuadros = new Map();

// Materiais da barra de vida, criados UMA vez e compartilhados por todos
// os inimigos. Só a escala do sprite muda por bicho — é o que permite ter
// barra em 26 inimigos sem custo de quadro.
let matsBarra = null;
function materiaisBarra() {
  if (matsBarra) return matsBarra;
  const tex = texturaBarra();
  const fazer = (cor, opacidade) => new THREE.SpriteMaterial({
    map: tex, color: cor, transparent: true, opacity: opacidade,
    depthTest: false, depthWrite: false, fog: false,
  });
  matsBarra = {
    fundo: fazer(0x0A0806, 0.72),
    vida: fazer(0xC4322A, 0.95),
  };
  return matsBarra;
}

function quadrosPara(arquetipoSprite, afixoId) {
  const chave = `${arquetipoSprite}|${afixoId}`;
  if (!cacheQuadros.has(chave)) {
    const afixo = AFIXOS.find(a => a.id === afixoId) || AFIXOS[0];
    const paleta = aplicarAfixo(PALETAS[arquetipoSprite] || PALETAS.esqueleto, afixo);
    cacheQuadros.set(chave, gerarQuadrosInimigo(arquetipoSprite, paleta));
  }
  return cacheQuadros.get(chave);
}

export function limparCacheSprites() {
  for (const q of cacheQuadros.values()) {
    ['andar0', 'andar1', 'atacar'].forEach(k => q[k]?.dispose());
  }
  cacheQuadros.clear();
}

/** Sorteia uma variante de inimigo para o andar atual. */
export function sortearDefinicao(dadosInimigos, andar, rng, cfg) {
  const dif = cfg.dificuldade;
  const posiveis = dadosInimigos.arquetipos.filter(a => a.andarMin <= andar);
  const base = rng.ponderado(posiveis.length ? posiveis : dadosInimigos.arquetipos);

  const escalaVida = 1 + (andar - 1) * dif.vidaPorAndar;
  const escalaDano = 1 + (andar - 1) * dif.danoPorAndar;
  const escalaVel = 1 + (andar - 1) * dif.velocidadePorAndar;
  const desvio = () => 1 + rng.float(-dif.desvioAtributo, dif.desvioAtributo);

  const chanceAfixo = Math.min(0.72, dif.chanceAfixoBase + (andar - 1) * dif.chanceAfixoPorAndar);
  let afixo = AFIXOS[0];
  if (rng.chance(chanceAfixo)) {
    const comAfixo = AFIXOS.filter(a => a.id !== 'nenhum');
    afixo = rng.ponderado(comAfixo);
  }

  return {
    base,
    afixo,
    nome: afixo.nome ? `${base.nome} ${afixo.nome}` : base.nome,
    vida: Math.round(base.vida * escalaVida * desvio() * (afixo.vida ?? 1)),
    dano: Math.round(base.dano * escalaDano * desvio() * (afixo.dano ?? 1)),
    velocidade: base.velocidade * escalaVel * desvio() * (afixo.velocidade ?? 1),
    alcance: base.alcance,
    cadencia: base.cadencia * (afixo.cadencia ?? 1),
    ouro: Math.round(base.ouro * (1 + (andar - 1) * 0.12)),
    animacao: base.animacao ?? 'marcha',
    escala: base.escala * (afixo.escala ?? 1),
    armadura: (base.armadura ?? 0) + (afixo.armadura ?? 0),
    voa: !!base.voa,
    erratico: base.erratico ?? 0,
    transparente: !!afixo.transparente,
    veneno: !!afixo.veneno,
    luz: afixo.luz ?? null,
    sprite: base.sprite,
  };
}

export function definicaoChefe(dadosInimigos, andar, rng) {
  const base = rng.escolher(dadosInimigos.chefes);
  const mult = 1 + Math.floor((andar - 1) / 5) * 0.55;
  return {
    base, afixo: AFIXOS[0], nome: base.nome,
    vida: Math.round(base.vida * mult),
    dano: Math.round(base.dano * mult),
    velocidade: base.velocidade,
    alcance: base.alcance,
    cadencia: base.cadencia,
    ouro: Math.round(base.ouro * mult),
    escala: base.escala,
    armadura: base.armadura ?? 0,
    voa: false, erratico: 0, transparente: false, veneno: false,
    animacao: base.animacao ?? 'pesado',
    luz: 0xE3B23C, sprite: base.sprite, chefe: true,
  };
}

// ============================================================
export class Inimigo {
  constructor(def, posicao, nivel) {
    this.def = def;
    this.nivel = nivel;
    this.vida = def.vida;
    this.vidaMax = def.vida;
    this.raio = 0.5 * def.escala;
    this.pos = posicao.clone();
    this.estado = 'dormindo';       // dormindo | perseguindo | preparando | recuando | morrendo
    this.tempoEstado = 0;
    this.recarga = 0;
    this.anim = Math.random() * 10;
    this.flash = 0;
    this.acordou = false;
    this.morto = false;
    this.remover = false;
    this.vagar = new THREE.Vector2(0, 0);
    this.tempoVagar = 0;
    this.balancoAtaque = 0;      // deslocamento na direção do jogador
    this.esticaAtaque = 1;       // alongamento vertical do sprite
    this.golpeSaiu = false;
    this.duracaoAtordoado = 1;

    const q = quadrosPara(def.sprite, def.afixo.id);
    this.quadros = q;
    const alturaMundo = 2.55 * def.escala;
    const larguraMundo = alturaMundo * (q.largura / q.altura);

    this.mat = new THREE.SpriteMaterial({
      map: q.andar0,
      transparent: true,
      alphaTest: 0.35,
      depthWrite: true,
      opacity: def.transparente ? 0.6 : 1,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(larguraMundo, alturaMundo, 1);
    this.altura = alturaMundo;
    this.larguraBase = larguraMundo;
    this.alturaVoo = def.voa ? 1.2 : 0;
    this.sprite.position.set(this.pos.x, alturaMundo / 2 + this.alturaVoo, this.pos.z);

    if (def.luz) {
      this.luz = new THREE.PointLight(def.luz, 2.2, 5.5, 2);
      this.luz.position.copy(this.sprite.position);
    }

    // Barra de vida. Só aparece depois que o bicho acorda: masmorra
    // cheia de barrinhas flutuando entregaria a posição de todo mundo
    // e mataria o susto de virar a esquina.
    const m = materiaisBarra();
    this.larguraBarra = Math.max(0.7, larguraMundo * 0.85);
    this.barraFundo = new THREE.Sprite(m.fundo);
    this.barraVida = new THREE.Sprite(m.vida);
    this.barraFundo.scale.set(this.larguraBarra, 0.13, 1);
    this.barraVida.scale.set(this.larguraBarra - 0.04, 0.09, 1);
    this.barraFundo.visible = false;
    this.barraVida.visible = false;
    this.barraFundo.renderOrder = 9;
    this.barraVida.renderOrder = 10;
  }

  adicionarNaCena(cena) {
    cena.add(this.sprite);
    cena.add(this.barraFundo);
    cena.add(this.barraVida);
    if (this.luz) cena.add(this.luz);
  }

  removerDaCena(cena) {
    cena.remove(this.sprite);
    cena.remove(this.barraFundo);
    cena.remove(this.barraVida);
    if (this.luz) cena.remove(this.luz);
    this.mat.dispose();
  }

  // A barra encolhe pela DIREITA, não pelo centro: sprite escala a
  // partir do meio, então preciso deslocar junto com a escala.
  _atualizarBarra() {
    const mostrar = this.acordou && !this.morto && this.vida < this.vidaMax;
    this.barraFundo.visible = mostrar;
    this.barraVida.visible = mostrar;
    if (!mostrar) return;

    const pct = Math.max(0, this.vida / this.vidaMax);
    const larg = (this.larguraBarra - 0.04) * pct;
    const alturaBarra = this.sprite.position.y + this.sprite.scale.y / 2 + 0.28;
    this.barraVida.scale.x = larg;
    this.barraFundo.position.set(this.sprite.position.x, alturaBarra, this.sprite.position.z);
    this.barraVida.position.set(
      this.sprite.position.x - (this.larguraBarra - 0.04 - larg) / 2,
      alturaBarra, this.sprite.position.z
    );
  }

  receberDano(valor) {
    if (this.morto) return 0;
    const final = Math.max(1, Math.round(valor * (1 - this.def.armadura)));
    this.vida -= final;
    this.flash = 0.14;
    this.acordou = true;
    if (this.estado === 'dormindo') this.estado = 'perseguindo';
    if (this.vida <= 0) {
      this.morto = true;
      this.estado = 'morrendo';
      this.tempoEstado = 0;
      Audio.sfx('enemyDie');
    }
    return final;
  }

  atualizar(dt, jogador, nivel, aoAtacar) {
    this.tempoEstado += dt;
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.recarga = Math.max(0, this.recarga - dt);

    if (this.estado === 'morrendo') {
      const t = Math.min(1, this.tempoEstado / 0.55);
      this.sprite.scale.y = this.altura * (1 - t * 0.85);
      this.sprite.position.y = (this.altura * (1 - t * 0.85)) / 2;
      this.mat.opacity = 1 - t;
      this.mat.rotation = t * 0.5;
      if (this.luz) this.luz.intensity = 2.2 * (1 - t);
      this.barraFundo.visible = false;
      this.barraVida.visible = false;
      if (t >= 1) this.remover = true;
      return;
    }

    const alvo = new THREE.Vector3(jogador.pos.x, 0, jogador.pos.z);
    const meu = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    const dist = meu.distanceTo(alvo);

    // acorda ao ver o jogador
    if (this.estado === 'dormindo') {
      if (dist < 15 && nivel.temVisao(meu, alvo)) {
        this.estado = 'perseguindo';
        if (!this.acordou) { this.acordou = true; Audio.sfx('enemyAlert'); }
      } else {
        this._animar(dt, false);
        return;
      }
    }

    // atordoado (aparado pelo jogador): cambaleia para trás e fica aberto
    if (this.estado === 'atordoado') {
      const t = Math.min(1, this.tempoEstado / this.duracaoAtordoado);
      this.mat.map = this.quadros.atacar;
      this.balancoAtaque = -0.35 * (1 - t);
      this.mat.rotation = Math.sin(this.tempoEstado * 26) * 0.09 * (1 - t);
      this._animarCor();
      this._posicionar(alvo);
      if (t >= 1) {
        this.mat.rotation = 0;
        this.balancoAtaque = 0;
        this.estado = 'perseguindo';
        this.tempoEstado = 0;
        this.recarga = 0.35;
      }
      return;
    }

    // ATAQUE em três tempos: recolhe, investe, recompõe.
    // Antes era só uma troca de quadro parada — não dava para ler que
    // o golpe estava vindo nem de onde.
    if (this.estado === 'preparando') {
      const RECOLHE = 0.26, INVESTE = 0.12, VOLTA = 0.20;
      const t = this.tempoEstado;
      this.mat.map = this.quadros.atacar;

      if (t < RECOLHE) {
        // recolhe para trás e se agacha — a antecipação do golpe
        const p = t / RECOLHE;
        this.balancoAtaque = -0.42 * Math.sin(p * Math.PI * 0.5);
        this.esticaAtaque = 1 - 0.12 * p;
        this.mat.rotation = -0.10 * p;
      } else if (t < RECOLHE + INVESTE) {
        // investe: salta para cima do jogador e se alonga
        const p = (t - RECOLHE) / INVESTE;
        this.balancoAtaque = -0.42 + 1.15 * p;
        this.esticaAtaque = 0.88 + 0.30 * p;
        this.mat.rotation = -0.10 + 0.24 * p;
        if (!this.golpeSaiu && p >= 0.75) {
          this.golpeSaiu = true;
          if (dist <= this.def.alcance + 0.9) aoAtacar(this);
        }
      } else if (t < RECOLHE + INVESTE + VOLTA) {
        // recompõe
        const p = (t - RECOLHE - INVESTE) / VOLTA;
        this.balancoAtaque = 0.73 * (1 - p);
        this.esticaAtaque = 1.18 - 0.18 * p;
        this.mat.rotation = 0.14 * (1 - p);
      } else {
        this.balancoAtaque = 0;
        this.esticaAtaque = 1;
        this.mat.rotation = 0;
        this.golpeSaiu = false;
        this.estado = 'perseguindo';
        this.tempoEstado = 0;
        this.recarga = 1 / this.def.cadencia;
      }

      this._animarCor();
      this._posicionar(alvo);
      return;
    }

    // perseguição
    if (dist > this.def.alcance) {
      let dirX = (alvo.x - meu.x) / (dist || 1);
      let dirZ = (alvo.z - meu.z) / (dist || 1);

      if (this.def.erratico > 0) {
        this.tempoVagar -= dt;
        if (this.tempoVagar <= 0) {
          this.tempoVagar = 0.4 + Math.random() * 0.5;
          this.vagar.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        }
        dirX += this.vagar.x * this.def.erratico;
        dirZ += this.vagar.y * this.def.erratico;
        const n = Math.hypot(dirX, dirZ) || 1;
        dirX /= n; dirZ /= n;
      }

      const v = this.def.velocidade * dt;
      const antesX = this.pos.x, antesZ = this.pos.z;
      nivel.mover(this.pos, dirX * v, dirZ * v, this.raio);

      // Se travou na quina, tenta contornar pela tangente.
      if (Math.abs(this.pos.x - antesX) < 1e-5 && Math.abs(this.pos.z - antesZ) < 1e-5) {
        nivel.mover(this.pos, -dirZ * v, dirX * v, this.raio);
      }
    } else if (this.recarga <= 0) {
      this.estado = 'preparando';
      this.tempoEstado = 0;
      this.golpeSaiu = false;
      Audio.sfx('enemyAlert');
    }

    this._animar(dt, true);
    this._posicionar(alvo);
  }

  // ---------- jeito de andar ----------
  // Antes todo mundo trocava os mesmos dois quadros na mesma cadência,
  // e por isso cinco arquétipos diferentes pareciam o mesmo bicho
  // repintado. Agora cada um tem ritmo, deformação e inclinação
  // próprios: o esqueleto marcha duro, o goblin pula, o morcego
  // oscila, o limo se achata e o cavaleiro gingam o corpo inteiro.
  // Dá para reconhecer quem vem só pelo movimento, antes de ler a cor.
  _animar(dt, andando) {
    const q = this.quadros;
    const estilo = this.def.base?.animacao ?? this.def.animacao ?? 'marcha';
    const t = this.anim;
    let ritmo = 5.5, estica = 1, incl = 0, salto = 0;

    switch (estilo) {
      case 'saltitante':                      // goblin: pula e cai
        ritmo = 8.0;
        salto = Math.abs(Math.sin(t * 7.2)) * 0.30;
        estica = 1 + Math.sin(t * 7.2) * 0.10;
        incl = Math.sin(t * 3.6) * 0.06;
        break;
      case 'esvoacante':                      // morcego: gira e oscila
        ritmo = 11.0;
        salto = Math.sin(t * 4.4) * 0.14;
        incl = Math.sin(t * 5.1) * 0.20;
        estica = 1 + Math.cos(t * 9.0) * 0.07;
        break;
      case 'gosmento':                        // limo: achata e estica
        ritmo = 2.4;
        estica = 1 + Math.sin(t * 2.9) * 0.17;
        salto = Math.max(0, Math.sin(t * 2.9)) * 0.10;
        break;
      case 'pesado':                          // cavaleiro: ginga devagar
        ritmo = 3.0;
        incl = Math.sin(t * 2.0) * 0.09;
        estica = 1 + Math.sin(t * 4.0) * 0.04;
        salto = Math.abs(Math.sin(t * 2.0)) * 0.06;
        break;
      default:                                // esqueleto: passo seco
        ritmo = 5.5;
        incl = (Math.floor(t * 5.5) % 2 ? 1 : -1) * 0.05;
        estica = 1 + (Math.floor(t * 5.5) % 2 ? 0.04 : -0.02);
    }

    const quadro = andando && Math.floor(t * ritmo) % 2 ? q.andar1 : q.andar0;
    if (this.mat.map !== quadro) { this.mat.map = quadro; }

    // parado o bicho respira, mas não desfila
    const p = andando ? 1 : 0.25;
    this.mat.rotation = incl * p;
    this.esticaAtaque = 1 + (estica - 1) * p;
    this.alturaAndar = salto * p;
    this.balancoAtaque = 0;
    this._animarCor();
  }

  _animarCor() {
    const f = 1 + this.flash * 5;
    this.mat.color.setRGB(f, f, f);
  }

  // Aparado pelo jogador: perde o golpe e fica exposto.
  atordoar(duracao = 1) {
    if (this.estado === 'morrendo') return;
    this.estado = 'atordoado';
    this.tempoEstado = 0;
    this.duracaoAtordoado = duracao;
    this.golpeSaiu = false;
  }

  _posicionar(alvo = null) {
    const flutuar = this.def.voa ? Math.sin(this.anim * 3.2) * 0.25 : 0;

    // alongamento do sprite durante a investida
    const alturaBase = this.altura;
    const larguraBase = this.larguraBase;
    // esmagar-e-esticar: o que estica na vertical afina na horizontal
    const e = this.esticaAtaque;
    this.sprite.scale.set(larguraBase / Math.sqrt(e), alturaBase * e, 1);

    // deslocamento na direção do jogador (recuo e bote)
    let ox = 0, oz = 0;
    if (alvo && this.balancoAtaque !== 0) {
      const dx = alvo.x - this.pos.x, dz = alvo.z - this.pos.z;
      const n = Math.hypot(dx, dz) || 1;
      ox = (dx / n) * this.balancoAtaque;
      oz = (dz / n) * this.balancoAtaque;
    }

    this.sprite.position.set(
      this.pos.x + ox,
      this.sprite.scale.y / 2 + this.alturaVoo + flutuar + (this.alturaAndar ?? 0),
      this.pos.z + oz
    );
    if (this.luz) this.luz.position.copy(this.sprite.position);
    this._atualizarBarra();
  }
}
