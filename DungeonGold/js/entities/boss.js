// ============================================================
// Chefe final da run.
//
// Ele não usa a IA dos inimigos comuns, e isso é proposital: bicho
// normal só persegue e bate. O chefe final tem CICLO — escolhe um
// ataque, TELEGRAFA, executa e fica exposto na recuperação. É essa
// janela de recuperação que faz a luta ter ritmo em vez de virar
// troca de tapa.
//
// Três fases, por faixa de vida. A cada fase ele fica mais rápido,
// recarrega mais rápido, muda de cor e libera ataques que antes não
// usava — então a luta não é a mesma do começo ao fim.
//
// Os projéteis vivem aqui dentro em vez de num sistema global: só o
// chefe atira, e assim eles morrem junto com ele sem deixar sujeira.
// ============================================================

import * as THREE from 'three';
import { Audio } from '../core/audio.js';
import { gerarChefeFinal } from '../gfx/boss.js';
import { gerarProjetil } from '../gfx/sprites.js';

const VEL_PROJETIL = 9.5;
const VIDA_PROJETIL = 4.5;

export class ChefeFinal {
  constructor(def, posicao, nivel) {
    this.def = def;
    this.nivel = nivel;
    this.vida = def.vida;
    this.vidaMax = def.vida;
    this.raio = 0.62 * def.escala;
    this.pos = posicao.clone();
    this.morto = false;
    this.remover = false;
    this.flash = 0;
    this.anim = 0;
    this.fase = 1;
    this.estado = 'dormindo';     // dormindo | perseguindo | avisando | executando | recuperando | morrendo
    this.tempoEstado = 0;
    this.ataqueAtual = null;
    this.recargas = new Map();
    this.projeteis = [];
    this.acordou = false;
    this.tremorChao = 0;

    this.quadros = gerarChefeFinal(def.pecas, def.semente);

    // O corpo sorteado pede até 3,4 de escala — 8,7 de altura, mais que
    // o dobro do teto da masmorra comum. Aqui a silhueta é limitada a
    // uma fração do pé-direito da arena: ele continua enorme, mas cabe.
    // Sem isto, "colossal" engolia o teto e o jogador via um borrão.
    const teto = nivel?.H ?? 11;
    const alt = Math.min(2.55 * def.escala, teto * (def.alturaMaxima ?? 0.62));
    this.altura = alt;
    this.escalaReal = alt / 2.55;
    this.larguraBase = alt * (this.quadros.largura / this.quadros.altura);
    this.raio = 0.62 * this.escalaReal;

    this.mat = new THREE.SpriteMaterial({
      map: this.quadros.andar0, transparent: true, alphaTest: 0.3, depthWrite: true,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(this.larguraBase, alt, 1);
    this.sprite.position.set(this.pos.x, alt / 2, this.pos.z);

    this.luz = new THREE.PointLight(def.luz, 4.5, 16, 2);
    this.luz.position.copy(this.sprite.position);

    this.texProjetil = gerarProjetil(def.pecas.paleta.e);
    this._criarMarcadores();
  }

  // ---------- marcas de aviso no chão ----------
  // Sem isto o aviso era só o bicho pulsando, igual para os sete
  // ataques — dava para ver que vinha ALGUMA coisa e não dava para
  // saber o quê, então a única reação possível era correr. Cada
  // ataque agora desenha no chão a área que vai atingir: anel para a
  // onda, faixa para a investida, círculo no destino para o salto.
  // A cor vem da paleta do próprio chefe, então continua sendo dele.
  _criarMarcadores() {
    const cor = new THREE.Color(this.def.luz);
    const material = () => new THREE.MeshBasicMaterial({
      color: cor, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false,
    });

    // anel que cresce: onda de choque
    this.marcaAnel = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), material());
    // faixa reta à frente: investida
    this.marcaFaixa = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material());
    // disco no ponto de queda: salto
    this.marcaDisco = new THREE.Mesh(new THREE.CircleGeometry(1, 32), material());

    this.marcadores = [this.marcaAnel, this.marcaFaixa, this.marcaDisco];
    for (const m of this.marcadores) {
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 3;
    }
  }

  _esconderMarcadores() {
    for (const m of this.marcadores) m.visible = false;
  }

  // p = 0..1 do tempo de aviso. A marca aparece fraca e fecha forte:
  // o brilho é o relógio.
  _desenharAviso(a, p, alvo) {
    this._esconderMarcadores();
    const op = 0.18 + p * 0.55;
    const y = 0.06;

    if (a.id === 'onda' || a.id === 'rugido') {
      const r = a.raio ?? 8;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(r * p, r * p, 1);
      this.marcaAnel.position.set(this.pos.x, y, this.pos.z);
      this.marcaAnel.material.opacity = op;

    } else if (a.id === 'investida') {
      const dx = alvo.x - this.pos.x, dz = alvo.z - this.pos.z;
      const n = Math.hypot(dx, dz) || 1;
      const comp = 16;
      this.marcaFaixa.visible = true;
      this.marcaFaixa.scale.set(this.raio * 2.4, comp, 1);
      this.marcaFaixa.position.set(this.pos.x + (dx / n) * comp / 2, y, this.pos.z + (dz / n) * comp / 2);
      this.marcaFaixa.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
      this.marcaFaixa.material.opacity = op * 0.8;

    } else if (a.id === 'salto') {
      const t = this.alvoTravado ?? alvo;
      const r = a.raio ?? 5;
      this.marcaDisco.visible = true;
      this.marcaDisco.scale.set(r, r, 1);
      this.marcaDisco.position.set(t.x, y, t.z);
      this.marcaDisco.material.opacity = op * 0.55;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(r, r, 1);
      this.marcaAnel.position.set(t.x, y + 0.01, t.z);
      this.marcaAnel.material.opacity = op;

    } else if (a.id === 'salva' || a.id === 'espiral') {
      // não há área no chão: o tell é o bicho encolhendo e o clarão
      const r = 2.2 + p * 1.4;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(r, r, 1);
      this.marcaAnel.position.set(this.pos.x, y, this.pos.z);
      this.marcaAnel.material.opacity = op * 0.9;

    } else if (a.id === 'chuva') {
      // a área cai em volta de VOCÊ: a marca segue o jogador
      const r = a.raio ?? 7;
      this.marcaDisco.visible = true;
      this.marcaDisco.scale.set(r, r, 1);
      this.marcaDisco.position.set(alvo.x, y, alvo.z);
      this.marcaDisco.material.opacity = op * 0.4;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(r, r, 1);
      this.marcaAnel.position.set(alvo.x, y + 0.01, alvo.z);
      this.marcaAnel.material.opacity = op;

    } else if (a.id === 'cruz') {
      const r = 3.0 + p * 2.0;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(r, r, 1);
      this.marcaAnel.position.set(this.pos.x, y, this.pos.z);
      this.marcaAnel.material.opacity = op;

    } else if (a.id === 'caçador') {
      // faixa fina apontada para você: os caçadores saem daqui
      const dx = alvo.x - this.pos.x, dz = alvo.z - this.pos.z;
      const n = Math.hypot(dx, dz) || 1;
      const comp = Math.min(20, n + 4);
      this.marcaFaixa.visible = true;
      this.marcaFaixa.scale.set(1.1, comp, 1);
      this.marcaFaixa.position.set(this.pos.x + (dx / n) * comp / 2, y, this.pos.z + (dz / n) * comp / 2);
      this.marcaFaixa.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
      this.marcaFaixa.material.opacity = op;
    }
  }

  // Postura própria por ataque: o corpo dele também tem que dizer o que
  // vem, para quem estiver olhando o bicho e não o chão.
  _posturaAviso(a, p) {
    switch (a.id) {
      case 'investida':                       // recolhe e afunda: vai vir para cima
        this.escalaExtra = 1 - 0.10 * p;
        this.inclinacao = -0.16 * p;
        break;
      case 'salto':                           // agacha fundo
        this.escalaExtra = 1 - 0.22 * p;
        this.inclinacao = 0;
        break;
      case 'onda':                            // ergue e infla
      case 'rugido':
        this.escalaExtra = 1 + 0.20 * p;
        this.inclinacao = 0;
        break;
      case 'salva':                           // treme
      case 'espiral':
      case 'caçador':
        this.escalaExtra = 1 + 0.06 * p;
        this.inclinacao = Math.sin(p * 46) * 0.05;
        break;
      case 'cruz':                             // abre os braços
        this.escalaExtra = 1 + 0.14 * p;
        this.inclinacao = Math.sin(p * 8) * 0.04;
        break;
      case 'chuva':                            // estica para cima
        this.escalaExtra = 1 + 0.18 * p;
        this.inclinacao = 0;
        break;
      default:
        this.escalaExtra = 1 + Math.sin(p * Math.PI) * 0.12;
        this.inclinacao = 0;
    }
  }

  adicionarNaCena(cena) {
    this.cena = cena;
    cena.add(this.sprite);
    cena.add(this.luz);
    for (const m of this.marcadores) cena.add(m);
  }

  removerDaCena(cena) {
    cena.remove(this.sprite);
    cena.remove(this.luz);
    for (const m of this.marcadores) {
      cena.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const p of this.projeteis) cena.remove(p.spr);
    this.projeteis.length = 0;
    this.mat.dispose();
    this.texProjetil.dispose();
    ['andar0', 'andar1', 'atacar', 'raiva'].forEach(k => this.quadros[k]?.dispose());
  }

  get vidaPct() { return Math.max(0, this.vida / this.vidaMax); }

  receberDano(valor) {
    if (this.morto) return 0;
    const final = Math.max(1, Math.round(valor * (1 - this.def.armadura)));
    this.vida -= final;
    this.flash = 0.12;
    if (this.estado === 'dormindo') this.estado = 'perseguindo';

    // troca de fase: cura nada, mas muda a luta
    const pct = this.vidaPct;
    const fases = this.def.fases;
    let nova = 1;
    for (let i = 0; i < fases.length; i++) if (pct <= fases[i].limite) nova = i + 1;
    if (nova > this.fase) {
      this.fase = nova;
      this.tempoEstado = 0;
      this.estado = 'recuperando';   // respiro na virada, para o jogador ler a mudança
      this.recargas.clear();
      if (this.aoMudarFase) this.aoMudarFase(this.fase);
    }

    if (this.vida <= 0) {
      this.morto = true;
      this.estado = 'morrendo';
      this.tempoEstado = 0;
      Audio.sfx('chefeMorre');
    }
    return final;
  }

  // Escolhe entre os ataques liberados na fase atual, o que estiver pronto
  // há mais tempo. Sorteio puro faria ele repetir o mesmo três vezes.
  _escolherAtaque() {
    const prontos = this.def.ataques.filter(a =>
      (a.faseMin ?? 1) <= this.fase && (this.recargas.get(a.id) ?? 0) <= 0);
    if (!prontos.length) return null;
    return prontos[Math.floor(Math.random() * prontos.length)];
  }

  atualizar(dt, jogador, nivel, ganchos) {
    // durante a apresentação ele existe na cena, respira, mas não age:
    // a luta só começa quando o jogador fecha a tela
    if (this.congelado) { this.anim += dt * 0.4; this._desenhar(); return; }

    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.tempoEstado += dt;
    this.tremorChao = Math.max(0, this.tremorChao - dt * 2);
    for (const [k, v] of this.recargas) this.recargas.set(k, v - dt);

    this._atualizarProjeteis(dt, jogador, nivel, ganchos);

    if (this.estado === 'morrendo') {
      const t = Math.min(1, this.tempoEstado / 2.2);
      this.sprite.scale.set(this.larguraBase * (1 - t * 0.3), this.altura * (1 - t * 0.75), 1);
      this.sprite.position.y = this.sprite.scale.y / 2;
      this.mat.opacity = 1 - t * 0.9;
      this.mat.rotation = t * 0.35;
      this.luz.intensity = 4.5 * (1 - t);
      // estertor: pulsa branco enquanto desaba
      const f = 1 + Math.sin(this.tempoEstado * 22) * 0.5 * (1 - t);
      this.mat.color.setRGB(f, f, f);
      if (t >= 1) this.remover = true;
      return;
    }

    const alvo = new THREE.Vector3(jogador.pos.x, 0, jogador.pos.z);
    const meu = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    const dist = meu.distanceTo(alvo);

    if (this.estado === 'dormindo') {
      if (dist < 22) {
        this.estado = 'perseguindo';
        this.acordou = true;
        if (ganchos.aoAcordar) ganchos.aoAcordar();
      }
      this._desenhar();
      return;
    }

    const f = this.def.fases[this.fase - 1];

    if (this.estado === 'perseguindo') {
      // anda para o jogador; se estiver perto, procura ataque
      if (dist > this.def.alcance * 0.8) {
        const v = this.def.velocidade * f.velocidade * dt;
        const dx = (alvo.x - meu.x) / (dist || 1), dz = (alvo.z - meu.z) / (dist || 1);
        const ax = this.pos.x, az = this.pos.z;
        nivel.mover(this.pos, dx * v, dz * v, this.raio);
        if (Math.abs(this.pos.x - ax) < 1e-5 && Math.abs(this.pos.z - az) < 1e-5) {
          nivel.mover(this.pos, -dz * v, dx * v, this.raio);
        }
      }
      const a = this._escolherAtaque();
      if (a && this.tempoEstado > 0.5) {
        this.ataqueAtual = a;
        this.estado = 'avisando';
        this.tempoEstado = 0;
        this._guardarAlvo(alvo);
        Audio.sfx('chefeAviso');
        if (ganchos.aoAviso) ganchos.aoAviso(a.aviso);
      }
      this._desenhar();
      return;
    }

    if (this.estado === 'avisando') {
      const a = this.ataqueAtual;
      const p = Math.min(1, this.tempoEstado / a.tempoAviso);
      this._posturaAviso(a, p);
      this._desenharAviso(a, p, alvo);
      this.brilhoAviso = p;
      if (this.tempoEstado >= a.tempoAviso) {
        this.estado = 'executando';
        this.tempoEstado = 0;
        this._iniciarAtaque(a, alvo, jogador, ganchos);
      }
      this._desenhar();
      return;
    }

    if (this.estado === 'executando') {
      const a = this.ataqueAtual;
      this._executarAtaque(dt, a, jogador, nivel, ganchos, dist);
      if (this.tempoEstado >= a.duracao) {
        this.estado = 'recuperando';
        this.tempoEstado = 0;
        this.escalaExtra = 1;
        this.inclinacao = 0;
        this.brilhoAviso = 0;
        this._esconderMarcadores();
        this.alturaSalto = 0;      // volta ao chão, senão ele flutua o resto da luta
        this.recargas.set(a.id, a.recarga * f.recarga);
      }
      this._desenhar();
      return;
    }

    if (this.estado === 'recuperando') {
      // janela de punição: ele fica parado e aberto
      if (this.tempoEstado >= 0.85 / f.velocidade) {
        this.estado = 'perseguindo';
        this.tempoEstado = 0;
      }
      this._desenhar();
    }
  }

  _guardarAlvo(alvo) {
    this.alvoTravado = { x: alvo.x, z: alvo.z };
  }

  _iniciarAtaque(a, alvo, jogador, ganchos) {
    // sem isto o chefe acertaria o primeiro golpe da run e nunca mais:
    // cada ataque fere uma vez, mas o "uma vez" é por ataque
    this.jaBateu = false;
    this.alturaSalto = 0;

    if (a.id === 'investida') {
      const dx = alvo.x - this.pos.x, dz = alvo.z - this.pos.z;
      const n = Math.hypot(dx, dz) || 1;
      this.dirInvestida = { x: dx / n, z: dz / n };
      Audio.sfx('chefeInvestida');

    } else if (a.id === 'salva') {
      this._dispararLeque(a, alvo, a.projeteis, 1.5);
      Audio.sfx('chefeSalva');

    } else if (a.id === 'chuva') {
      this.acumChuva = 0;
      Audio.sfx('chefeSalva');

    } else if (a.id === 'cruz') {
      this.anguloCruz = Math.random() * 6.28;
      this.acumCruz = 0;
      this.voltasFeitas = 0;
      Audio.sfx('chefeSalva');

    } else if (a.id === 'caçador') {
      // travam no jogador no momento do disparo e curvam atrás dele
      for (let i = 0; i < a.projeteis; i++) {
        const ang = Math.atan2(alvo.z - this.pos.z, alvo.x - this.pos.x)
          + (i - (a.projeteis - 1) / 2) * 0.45;
        const p = this._criarProjetil(Math.cos(ang), Math.sin(ang), a.dano);
        p.perseguir = a.perseguidor ?? 0.9;
        p.vida = 6.5;
      }
      Audio.sfx('chefeSalva');

    } else if (a.id === 'salto') {
      this.origemSalto = { x: this.pos.x, z: this.pos.z };
      Audio.sfx('chefeInvestida');

    } else if (a.id === 'onda') {
      Audio.sfx('chefeOnda');
      this.tremorChao = 1;
      this.ondaRaio = 0;

    } else if (a.id === 'rugido') {
      Audio.sfx('chefeRugido');
      this.tremorChao = 1;

    } else if (a.id === 'espiral') {
      Audio.sfx('chefeSalva');
      this.anguloEspiral = 0;
    }
  }

  _executarAtaque(dt, a, jogador, nivel, ganchos, dist) {
    const bater = mult => {
      if (ganchos.aoAtacarJogador) ganchos.aoAtacarJogador(this.def.dano * (mult ?? a.dano));
    };

    if (a.id === 'investida') {
      const v = this.def.velocidade * 3.4 * dt;
      nivel.mover(this.pos, this.dirInvestida.x * v, this.dirInvestida.z * v, this.raio);
      if (dist < this.raio + 1.3 && !this.jaBateu) { this.jaBateu = true; bater(); }

    } else if (a.id === 'salto') {
      const p = Math.min(1, this.tempoEstado / a.duracao);
      const o = this.origemSalto, t = this.alvoTravado;
      this.pos.x = o.x + (t.x - o.x) * p;
      this.pos.z = o.z + (t.z - o.z) * p;
      this.alturaSalto = Math.sin(p * Math.PI) * 3.2;
      if (p >= 1 && !this.jaBateu) {
        this.jaBateu = true;
        this.tremorChao = 1;
        Audio.sfx('chefeOnda');
        const d = Math.hypot(jogador.pos.x - this.pos.x, jogador.pos.z - this.pos.z);
        if (d < a.raio) bater();
      }

    } else if (a.id === 'onda') {
      // anel que se abre: pega quem estiver na faixa quando ela passa.
      // O anel do aviso continua desenhado e agora VOA para fora — dá
      // para ver a parede de choque chegando e pular fora dela.
      const p = Math.min(1, this.tempoEstado / a.duracao);
      this.ondaRaio = p * a.raio;
      this.marcaAnel.visible = true;
      this.marcaAnel.scale.set(Math.max(0.2, this.ondaRaio), Math.max(0.2, this.ondaRaio), 1);
      this.marcaAnel.position.set(this.pos.x, 0.07, this.pos.z);
      this.marcaAnel.material.opacity = 0.9 * (1 - p * 0.5);
      const d = Math.hypot(jogador.pos.x - this.pos.x, jogador.pos.z - this.pos.z);
      if (!this.jaBateu && Math.abs(d - this.ondaRaio) < 1.6) { this.jaBateu = true; bater(); }

    } else if (a.id === 'rugido') {
      const d = Math.hypot(jogador.pos.x - this.pos.x, jogador.pos.z - this.pos.z);
      if (!this.jaBateu && d < a.raio) { this.jaBateu = true; bater(); }

    } else if (a.id === 'chuva') {
      // cai em volta do jogador, não em cima: obriga a andar, não a fugir
      this.acumChuva = (this.acumChuva ?? 0) + dt;
      const intervalo = a.duracao / a.projeteis;
      while (this.acumChuva >= intervalo) {
        this.acumChuva -= intervalo;
        const ang = Math.random() * 6.28;
        const r = (a.raio ?? 7) * (0.35 + Math.random() * 0.65);
        const ox = jogador.pos.x + Math.cos(ang) * r;
        const oz = jogador.pos.z + Math.sin(ang) * r;
        const dx = jogador.pos.x - ox, dz = jogador.pos.z - oz;
        const n = Math.hypot(dx, dz) || 1;
        const p = this._criarProjetil(dx / n, dz / n, a.dano, { x: ox, z: oz });
        p.vida = 2.6;
      }

    } else if (a.id === 'cruz') {
      // leque em cruz que gira: fecha as diagonais aos poucos
      this.acumCruz = (this.acumCruz ?? 0) + dt;
      const voltas = a.voltas ?? 3;
      const intervalo = a.duracao / voltas;
      while (this.acumCruz >= intervalo && this.voltasFeitas < voltas) {
        this.acumCruz -= intervalo;
        this.voltasFeitas++;
        this.anguloCruz += 0.42;
        for (let i = 0; i < a.projeteis; i++) {
          const ang = this.anguloCruz + (i / a.projeteis) * Math.PI * 2;
          this._criarProjetil(Math.cos(ang), Math.sin(ang), a.dano);
        }
      }

    } else if (a.id === 'espiral') {
      // cospe projéteis girando: obriga a circular em vez de recuar em linha
      this.acumEspiral = (this.acumEspiral ?? 0) + dt;
      const intervalo = a.duracao / a.projeteis;
      while (this.acumEspiral >= intervalo) {
        this.acumEspiral -= intervalo;
        this.anguloEspiral += 0.72;
        this._criarProjetil(Math.cos(this.anguloEspiral), Math.sin(this.anguloEspiral), a.dano);
      }
    }
  }

  _dispararLeque(a, alvo, qtd, abertura) {
    const base = Math.atan2(alvo.z - this.pos.z, alvo.x - this.pos.x);
    for (let i = 0; i < qtd; i++) {
      const ang = base + (i / (qtd - 1) - 0.5) * abertura;
      this._criarProjetil(Math.cos(ang), Math.sin(ang), a.dano);
    }
  }

  _criarProjetil(dx, dz, danoMult, origem = null) {
    const mat = new THREE.SpriteMaterial({
      map: this.texProjetil, transparent: true, depthWrite: false, fog: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.75, 0.75, 1);
    const o = origem ?? this.pos;
    spr.position.set(o.x, 1.5, o.z);
    if (this.cena) this.cena.add(spr);
    const p = {
      spr, mat, dx, dz, vida: VIDA_PROJETIL,
      dano: this.def.dano * (danoMult ?? 0.5),
      perseguir: 0,
    };
    this.projeteis.push(p);
    return p;
  }

  _atualizarProjeteis(dt, jogador, nivel, ganchos) {
    for (let i = this.projeteis.length - 1; i >= 0; i--) {
      const p = this.projeteis[i];
      p.vida -= dt;

      // caçador: curva atrás do jogador, mas com força limitada — quem
      // corre em linha reta é pego, quem faz curva fechada escapa
      if (p.perseguir > 0) {
        const ax = jogador.pos.x - p.spr.position.x;
        const az = jogador.pos.z - p.spr.position.z;
        const n = Math.hypot(ax, az) || 1;
        p.dx += (ax / n - p.dx) * p.perseguir * dt;
        p.dz += (az / n - p.dz) * p.perseguir * dt;
        const m = Math.hypot(p.dx, p.dz) || 1;
        p.dx /= m; p.dz /= m;
      }

      p.spr.position.x += p.dx * VEL_PROJETIL * dt;
      p.spr.position.z += p.dz * VEL_PROJETIL * dt;
      p.spr.position.y = 1.5 + Math.sin(p.vida * 12) * 0.08;
      p.mat.rotation += dt * 7;

      const cel = nivel.celulaDe(p.spr.position.x, p.spr.position.z);
      const bateuParede = nivel.solidoNaCelula(cel.cx, cel.cy);
      const d = Math.hypot(p.spr.position.x - jogador.pos.x, p.spr.position.z - jogador.pos.z);

      if (d < 0.95) {
        if (ganchos.aoAtacarJogador) ganchos.aoAtacarJogador(p.dano);
        this._matarProjetil(i);
      } else if (bateuParede || p.vida <= 0) {
        this._matarProjetil(i);
      }
    }
  }

  _matarProjetil(i) {
    const p = this.projeteis[i];
    if (this.cena) this.cena.remove(p.spr);
    p.mat.dispose();
    this.projeteis.splice(i, 1);
  }

  _desenhar() {
    const q = this.quadros;
    const quadro = this.fase >= 3 ? q.raiva
      : (this.estado === 'executando' || this.estado === 'avisando') ? q.atacar
        : (Math.floor(this.anim * 3.2) % 2 ? q.andar1 : q.andar0);
    if (this.mat.map !== quadro) { this.mat.map = quadro; this.mat.needsUpdate = true; }

    const e = this.escalaExtra ?? 1;
    const respira = 1 + Math.sin(this.anim * 1.9) * 0.02;
    // esmagar-e-esticar: o que encolhe na vertical engorda na horizontal.
    // É o que faz "agachar antes do salto" parecer peso, e não escala.
    this.sprite.scale.set(
      this.larguraBase * respira / Math.sqrt(e),
      this.altura * e * respira,
      1
    );
    this.mat.rotation = this.inclinacao ?? 0;
    this.sprite.position.set(
      this.pos.x,
      this.sprite.scale.y / 2 + (this.alturaSalto ?? 0),
      this.pos.z
    );

    // cor: clareia com a fase, pisca no aviso e no dano
    const f = this.def.fases[this.fase - 1];
    const aviso = (this.brilhoAviso ?? 0) * 0.9;
    const b = f.cor + this.flash * 4 + aviso;
    this.mat.color.setRGB(b, b * (1 - aviso * 0.25), b * (1 - aviso * 0.45));

    this.luz.position.copy(this.sprite.position);
    this.luz.intensity = 4.5 * f.cor + aviso * 7;
  }

  /** Chamado pelo Jogo ao começar cada ataque, para o "já bateu" reiniciar. */
  reiniciarGolpe() { this.jaBateu = false; }
}
