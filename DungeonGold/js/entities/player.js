// ============================================================
// Jogador — estado, movimento e efeitos acumulados dos itens.
// ============================================================

import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Settings } from '../core/settings.js';
import { Audio } from '../core/audio.js';
import { clamp } from '../core/rng.js';

export class Jogador {
  constructor(cfg) {
    this.cfg = cfg.jogador;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.raio = 0.55;
    this.alturaOlho = 2.1;

    this.vidaMax = this.cfg.vidaMax;
    this.vida = this.vidaMax;
    this.armadura = 0;                // 0..1 (mostrado como % no HUD)
    this.estamina = this.cfg.estaminaMax;
    this.ouro = 0;
    this.pocoes = 2;

    this.inventario = [];
    this.chaves = new Set();     // chaves do andar atual, por cor
    this.arma = null;            // definição da arma escolhida no menu
    this.mods = {
      dano: 0, vidaMax: 0, velocidade: 0, armadura: 0,
      cadencia: 0, alcance: 0, roubo: 0, critico: 0,
      queimar: 0, ouroDobro: 1, reflexo: 0,
      danoMult: 1, dashCargasExtra: 0, dashRapidez: 0,
    };
    // buffs de fruta: { restante, partes } — revertidos quando o tempo acaba
    this.temporarios = [];
    this.especiais = [];        // habilidades ativas, disparadas no F
    this.recargaEspecial = 0;

    this.bloqueando = false;
    this.guardaQuebrada = false;
    this.bloqueouUltimo = false;
    this.tempoBloqueio = 0;
    this.balanco = 0;
    this.passoAcum = 0;
    this.invulneravel = 0;
    this.tremor = 0;
    this.lentidao = 0;      // 0..1, imposto pelas armadilhas contínuas

    // ---------- dash e slide ----------
    this.dashCargas = this.cfg.dashCargas ?? 3;
    this.dashMax = this.dashCargas;
    this.dashRecargaAtual = 0;
    this.dashTempo = 0;             // > 0 = está no meio de um dash
    this.dashDir = new THREE.Vector2(0, 0);
    this.deslizando = false;
    this.slideTempo = 0;
    this.slideEspera = 0;
    this.alturaOlhoAtual = this.alturaOlho;
  }

  // ---------- derivados ----------
  // Os números vêm da arma equipada; o balanceamento base só entra
  // como rede de segurança se a arma não declarar o campo.
  get dano() { return ((this.arma?.dano ?? this.cfg.danoEspada) + this.mods.dano) * this.mods.danoMult; }
  get alcance() { return (this.arma?.alcance ?? this.cfg.alcanceEspada) + this.mods.alcance; }
  get cadencia() { return (this.arma?.cadencia ?? this.cfg.cadenciaEspada) * (1 + this.mods.cadencia); }
  get custoAtaque() { return this.arma?.custoEstamina ?? this.cfg.custoGolpe; }
  get temEscudo() { return this.arma ? this.arma.escudo !== false : true; }
  get velocidade() { return this.cfg.velocidade * (1 + this.mods.velocidade); }
  get critico() { return this.cfg.critico + this.mods.critico; }
  get armaduraPct() { return Math.round(this.armadura * 100); }

  // ---------- itens ----------
  pegarItem(item) {
    this.aplicarEfeito(item.efeito, +1);
    if (!item.consumivel) this.inventario.push(item);
  }

  // Descartar precisa desfazer exatamente o que pegar aplicou —
  // por isso os efeitos passam todos por aqui, com sinal.
  descartarItem(item) {
    const i = this.inventario.indexOf(item);
    if (i < 0) return false;
    this.inventario.splice(i, 1);
    this.aplicarEfeito(item.efeito, -1);
    return true;
  }

  aplicarEfeito(ef, sinal = 1) {
    if (!ef) return;
    const v = (ef.valor ?? 0) * sinal;
    switch (ef.tipo) {
      // efeitos instantâneos: acontecem uma vez e não voltam atrás
      case 'cura':
        if (sinal > 0) this.vida = Math.min(this.vidaMax, this.vida + ef.valor);
        break;
      case 'ouro':
        if (sinal > 0) this.ouro += Math.round(ef.valor * this.mods.ouroDobro);
        break;

      case 'vidaMax':
        this.vidaMax += v;
        this.vida = Math.min(this.vida + Math.max(0, v), this.vidaMax);
        this.vida = Math.max(1, Math.min(this.vida, this.vidaMax));
        break;
      case 'dano': this.mods.dano += v; break;
      case 'velocidade': this.mods.velocidade += v; break;
      case 'armadura':
        this.mods.armadura += v;
        this.armadura = clamp(this.mods.armadura, 0, 0.85);
        break;
      case 'cadencia': this.mods.cadencia += v; break;
      case 'alcance': this.mods.alcance += v; break;
      case 'roubo': this.mods.roubo += v; break;
      case 'critico': this.mods.critico += v; break;
      case 'queimar': this.mods.queimar += v; break;
      case 'reflexo': this.mods.reflexo += v; break;
      case 'ouroDobro': this.mods.ouroDobro = sinal > 0 ? ef.valor : 1; break;
      case 'composto': ef.partes.forEach(p => this.aplicarEfeito(p, sinal)); break;

      // multiplicador de dano: soma sobre 1, para dois itens de ×2 não
      // virarem ×4 e estourarem o jogo
      case 'danoMult': this.mods.danoMult += (ef.valor - 1) * sinal; break;

      case 'dashCargas':
        this.mods.dashCargasExtra += v;
        this.dashMax = Math.max(1, (this.cfg.dashCargas ?? 3) + this.mods.dashCargasExtra);
        this.dashCargas = Math.min(this.dashMax, this.dashCargas + Math.max(0, v));
        break;
      case 'dashRecarga': this.mods.dashRapidez = clamp(this.mods.dashRapidez + v, 0, 0.8); break;

      // habilidade ativa: entra na lista do F. Pegar duas trocam de
      // lugar em vez de somar — duas habilidades numa tecla só seria
      // ruído; a última pega é a que vale.
      case 'especial':
        if (sinal > 0) {
          this.especiais = [ef.valor];
          this.recargaEspecial = 0;
        } else {
          this.especiais = this.especiais.filter(e => e !== ef.valor);
        }
        break;

      // fruta: aplica as partes e marca a hora de desfazer
      case 'temporario':
        if (sinal > 0) {
          ef.partes.forEach(p => this.aplicarEfeito(p, +1));
          this.temporarios.push({ restante: ef.duracao, partes: ef.partes, nome: ef.nome });
        }
        break;
    }
  }

  get recargaEspecialMax() { return 9; }
  get temEspecial() { return this.especiais.length > 0; }
  get especialPronto() { return this.temEspecial && this.recargaEspecial <= 0; }

  // ---------- dano ----------
  receberDano(valor, aparou = false) {
    // Intangível: durante o dash inteiro NADA passa — golpe, projétil,
    // espinho, fogo. É a promessa do boomer shooter: se você leu o
    // ataque e apertou no tempo certo, você atravessa. Sem isso o dash
    // vira só "andar rápido" e a leitura não é recompensada.
    if (this.intangivel) return 0;
    if (this.invulneravel > 0) return 0;
    let final = valor;
    if (aparou) return 0;

    this.bloqueouUltimo = false;
    if (this.bloqueando) {
      this.bloqueouUltimo = true;
      // quem apara com a própria arma cobre menos que quem tem escudo
      final *= (1 - (this.arma?.reducaoBloqueio ?? this.cfg.reducaoBloqueio));
      // aguentar o golpe é o que consome estamina de verdade
      this.estamina -= valor * this.cfg.custoAparar;
      if (this.estamina <= 0) {
        this.estamina = 0;
        this.guardaQuebrada = true;
        this.bloqueando = false;
      }
    }

    final *= (1 - this.armadura);
    final = Math.max(1, Math.round(final));
    this.vida -= final;
    this.invulneravel = 0.32;
    this.tremor = Math.min(1, this.tremor + final / 40);
    return final;
  }

  curar(v) { this.vida = Math.min(this.vidaMax, this.vida + v); }

  get morto() { return this.vida <= 0; }

  // ---------- laço ----------
  atualizar(dt, nivel) {
    const s = Settings.data;

    // frutas vencendo: desfaz exatamente o que aplicou, pelo mesmo
    // caminho de aplicarEfeito, para não sobrar bônus fantasma
    this.recargaEspecial = Math.max(0, this.recargaEspecial - dt);
    for (let i = this.temporarios.length - 1; i >= 0; i--) {
      const t = this.temporarios[i];
      t.restante -= dt;
      if (t.restante <= 0) {
        t.partes.forEach(p => this.aplicarEfeito(p, -1));
        this.temporarios.splice(i, 1);
        if (this.aoAcabarFruta) this.aoAcabarFruta();
      }
    }

    // olhar
    const sens = (s.sens / 100) * 0.0022;
    this.yaw -= Input.mouseDX * sens;
    this.pitch -= Input.mouseDY * sens;
    this.pitch = clamp(this.pitch, -0.7, 0.7);

    // bloqueio (botão direito ou Shift direito)
    // BUG CORRIGIDO (B-03): segurar o escudo drenava ~10 de estamina por
    // segundo sem regenerar, então em 10 s a guarda caía sozinha e sem
    // aviso — parecia que o escudo simplesmente não reduzia dano.
    // Agora segurar custa pouco; o que custa caro é APARAR o golpe.
    const querBloquear = Input.botao[2] || Input.pressionada('ShiftRight');
    this.bloqueando = querBloquear && !this.guardaQuebrada && this.temEscudo;

    if (this.bloqueando) {
      this.tempoBloqueio += dt;
      this.estamina -= this.cfg.custoGuardaSegundo * dt;
      if (this.estamina <= 0) {
        this.estamina = 0;
        this.guardaQuebrada = true;
        this.bloqueando = false;
        Audio.sfx('block');
      }
    } else {
      this.tempoBloqueio = 0;
      // a guarda só volta depois que a estamina se recompõe de verdade
      if (this.guardaQuebrada && this.estamina > this.cfg.estaminaMax * 0.35) {
        this.guardaQuebrada = false;
      }
    }

    // deslocamento
    let fx = 0, fz = 0;
    if (Input.pressionada('KeyW', 'ArrowUp')) fz += 1;
    if (Input.pressionada('KeyS', 'ArrowDown')) fz -= 1;
    if (Input.pressionada('KeyA', 'ArrowLeft')) fx -= 1;
    if (Input.pressionada('KeyD', 'ArrowRight')) fx += 1;

    this._movimentoRapido(dt, fx, fz, nivel);
    this.intangivel = this.dashTempo > 0;
    if (this.dashTempo > 0) {
      // durante o dash o controle é do dash: nada de corrigir a curva no
      // meio, senão vira "andar rápido" em vez de investida
      this.invulneravel = Math.max(this.invulneravel, this.cfg.dashInvuln ?? 0.13);
      this.balanco += dt * 16;
      this.tremor = Math.min(1, this.tremor + dt * 1.2);
      this.estamina = clamp(this.estamina + this.cfg.estaminaRegen * dt * 0.5, 0, this.cfg.estaminaMax);
      this.invulneravel = Math.max(0, this.invulneravel);
      this._ajustarOlho(dt);
      return;
    }

    const correndo = Input.pressionada('ShiftLeft') && this.estamina > 8 && (fx || fz) && !this.bloqueando;
    let vel = this.velocidade * (correndo ? this.cfg.velocidadeCorrida / this.cfg.velocidade : 1);
    if (this.bloqueando) vel *= 0.45;
    if (this.deslizando) vel = this.cfg.slideVelocidade ?? 12.5;
    vel *= (1 - clamp(this.lentidao, 0, 0.8));
    if (correndo) this.estamina -= 12 * dt;

    if (fx || fz) {
      const n = Math.hypot(fx, fz);
      fx /= n; fz /= n;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // frente = -Z no espaço da câmera
      // frente da câmera = (-sin, -cos); direita = (cos, -sin)
      const dx = (fx * cos - fz * sin) * vel * dt;
      const dz = -(fx * sin + fz * cos) * vel * dt;
      const antes = this.pos.x + this.pos.z;
      nivel.mover(this.pos, dx, dz, this.raio);
      const andou = Math.abs(this.pos.x + this.pos.z - antes) > 0.0001;

      if (andou) {
        this.balanco += dt * (correndo ? 13 : 9);
        this.passoAcum += dt * (correndo ? 2.4 : 1.7);
        if (this.passoAcum > 1) { this.passoAcum = 0; Audio.sfx('step'); }
      }
    } else {
      this.balanco += dt * 1.4;   // respiração parada
    }

    // estamina
    if (!correndo) {
      // com a guarda erguida a recuperação é parcial, mas existe —
      // antes era zero, e por isso a guarda caía sozinha
      this.estamina += this.cfg.estaminaRegen * dt * (this.bloqueando ? 0.35 : 1);
    }
    this.estamina = clamp(this.estamina, 0, this.cfg.estaminaMax);

    this.invulneravel = Math.max(0, this.invulneravel - dt);
    this.tremor = Math.max(0, this.tremor - dt * 2.2);
    this._ajustarOlho(dt);
  }

  // ---------- dash e slide ----------
  // O dash é o que tira o jogo do passo de caminhada. Ele NÃO custa
  // estamina: o limite são as cargas, que voltam uma a uma. Assim dá
  // para gastar duas seguidas para atravessar uma sala e aceitar ficar
  // a pé por um segundo — a decisão é essa, não uma barra a mais.
  //
  // O slide é o contrário: barato, contínuo enquanto você segura, mas
  // baixa a linha do olho e não deixa erguer o escudo. Serve para
  // atravessar por baixo de uma salva e sair do outro lado.
  get tempoRecargaDash() {
    return (this.cfg.dashRecarga ?? 1.15) * (1 - this.mods.dashRapidez);
  }

  _movimentoRapido(dt, fx, fz, nivel) {
    const cfg = this.cfg;

    // recarga das cargas, uma de cada vez
    if (this.dashCargas < this.dashMax) {
      this.dashRecargaAtual -= dt;
      if (this.dashRecargaAtual <= 0) {
        this.dashCargas += 1;
        this.dashRecargaAtual = this.tempoRecargaDash;
        Audio.sfx('dashPronto');
      }
    }
    this.slideEspera = Math.max(0, this.slideEspera - dt);

    // dash em andamento: move em linha reta na direção travada
    if (this.dashTempo > 0) {
      this.dashTempo -= dt;
      const v = (cfg.dashVelocidade ?? 26) * dt;
      nivel.mover(this.pos, this.dashDir.x * v, this.dashDir.y * v, this.raio);
      if (this.dashTempo <= 0) this.dashTempo = 0;
      return;
    }

    // dispara o dash
    if (Input.apertou('ShiftLeft', 'ShiftRight') && this.dashCargas > 0 && !this.bloqueando) {
      let dx = fx, dz = fz;
      if (!dx && !dz) { dx = 0; dz = 1; }            // parado: dash para frente
      const n = Math.hypot(dx, dz) || 1;
      dx /= n; dz /= n;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.dashDir.set(dx * cos - dz * sin, -(dx * sin + dz * cos));
      this.dashCargas -= 1;
      if (this.dashRecargaAtual <= 0) this.dashRecargaAtual = this.tempoRecargaDash;
      this.dashTempo = cfg.dashDuracao ?? 0.16;
      Audio.sfx('dash');
      return;
    }

    // slide: só com movimento, e não emenda um no outro sem respiro
    const quer = Input.pressionada('ControlLeft', 'ControlRight', 'KeyC');
    if (this.deslizando) {
      this.slideTempo -= dt;
      if (!quer || this.slideTempo <= 0 || (!fx && !fz)) {
        this.deslizando = false;
        this.slideEspera = cfg.slideRecarga ?? 0.45;
      }
    } else if (quer && (fx || fz) && this.slideEspera <= 0 && !this.bloqueando) {
      this.deslizando = true;
      this.slideTempo = cfg.slideDuracao ?? 0.85;
      Audio.sfx('slide');
    }
  }

  // A câmera desce no slide e volta suave. Trocar a altura de uma vez
  // dá um solavanco que parece bug.
  _ajustarOlho(dt) {
    const alvo = this.deslizando ? (this.cfg.slideAlturaOlho ?? 1.05) : this.alturaOlho;
    this.alturaOlhoAtual += (alvo - this.alturaOlhoAtual) * Math.min(1, dt * 14);
  }

  aplicarNaCamera(camera) {
    const s = Settings.data;
    const amp = s.bob ? 1 : 0;
    const balancoY = Math.sin(this.balanco * 2) * 0.055 * amp;
    const balancoX = Math.cos(this.balanco) * 0.035 * amp;
    const abaixa = this.bloqueando ? -0.12 : 0;

    camera.position.set(
      this.pos.x + balancoX * Math.cos(this.yaw),
      this.alturaOlhoAtual + balancoY + abaixa + (Math.random() - 0.5) * this.tremor * 0.14,
      this.pos.z + balancoX * Math.sin(this.yaw)
    );
    camera.rotation.set(0, 0, 0);
    camera.rotateY(this.yaw);
    camera.rotateX(this.pitch);
    camera.rotateZ(Math.cos(this.balanco) * 0.012 * amp + (Math.random() - 0.5) * this.tremor * 0.02);
  }
}
