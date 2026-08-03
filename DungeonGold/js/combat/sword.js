// ============================================================
// Arma em primeira pessoa.
//
// Fica numa cena ortográfica própria, desenhada DEPOIS do mundo
// no mesmo alvo de baixa resolução — então a espada recebe o
// mesmo pontilhado e o mesmo pixel do resto. Se ela fosse
// desenhada em DOM por cima, ficaria nítida demais e denunciaria
// que é um overlay.
//
// O golpe é um arco: a lâmina sobe pela esquerda, cruza a tela e
// volta. O quadro de acerto é no meio do arco, não no começo —
// é isso que dá peso.
// ============================================================

import * as THREE from 'three';
import {
  gerarEspadaJogador, gerarEscudoJogador, gerarRisco, gerarEscopetaJogador,
  gerarZweihander, gerarFogoDeBoca, gerarLanca, gerarMartelo, gerarArco,
  gerarFoice, gerarAdagas, gerarBesta, gerarChicote, gerarCanhao,
} from '../gfx/sprites.js';
import { Audio } from '../core/audio.js';

const DUR_GOLPE = 0.36;
const DUR_TIRO = 0.34;
const MOMENTO_ACERTO = 0.42;   // fração do golpe em que o dano sai

// Cada arma tem sua própria silhueta, tamanho e ponto de apoio na tela.
// `ancoraX` é medido a partir da borda direita e `ancoraY` a partir do
// topo da HUD — não do fundo do canvas. Sem isso a silhueta some atrás
// da barra inferior: a escopeta é desenhada deitada, com culatra e
// coronha na metade de baixo do sprite, e era justamente essa metade
// que ficava tapada. `boca` é onde nasce o clarão do disparo, em
// unidades da cena da arma a partir do centro do sprite.
const DESENHOS = {
  espada:     { fabricar: gerarEspadaJogador,   w: 96,  h: 72, altura: 1.50, ancoraX: -0.65, ancoraY: 0.10 },
  escopeta:   { fabricar: gerarEscopetaJogador, w: 128, h: 88, altura: 1.35, ancoraX: -1.06, ancoraY: 0.41, boca: [-0.29, 0.29] },
  zweihander: { fabricar: gerarZweihander,      w: 128, h: 96, altura: 2.10, ancoraX: -0.90, ancoraY: 0.30 },
  lanca:      { fabricar: gerarLanca,           w: 112, h: 96, altura: 1.90, ancoraX: -0.92, ancoraY: 0.32 },
  martelo:    { fabricar: gerarMartelo,         w: 118, h: 100, altura: 1.75, ancoraX: -0.80, ancoraY: 0.34 },
  // o arco não tem `boca`: sem clarão de disparo, porque nada queima
  arco:       { fabricar: gerarArco,            w: 112, h: 104, altura: 1.80, ancoraX: -0.78, ancoraY: 0.60 },
  // ---- armas achadas na run ----
  foice:      { fabricar: gerarFoice,           w: 120, h: 104, altura: 2.00, ancoraX: -0.92, ancoraY: 0.36 },
  adagas:     { fabricar: gerarAdagas,          w: 118, h: 90,  altura: 1.45, ancoraX: -0.84, ancoraY: 0.22 },
  besta:      { fabricar: gerarBesta,           w: 124, h: 92,  altura: 1.55, ancoraX: -1.00, ancoraY: 0.46, boca: [-0.62, 0.05] },
  chicote:    { fabricar: gerarChicote,         w: 126, h: 100, altura: 1.85, ancoraX: -1.00, ancoraY: 0.40 },
  canhao:     { fabricar: gerarCanhao,          w: 118, h: 92,  altura: 1.50, ancoraX: -0.96, ancoraY: 0.40, boca: [-0.55, 0.10] },
};

export class ArmaJogador {
  constructor(def) {
    this.def = def || { id: 'espada', tipo: 'corpo', sprite: 'espada', cadencia: 1.6, escudo: true };
    this.tipo = this.def.tipo;
    this.cena = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 5;

    const desenho = DESENHOS[this.def.sprite] || DESENHOS.espada;
    this.desenho = desenho;
    this.texEspada = desenho.fabricar();
    this.texEscudo = gerarEscudoJogador();
    this.texRisco = gerarRisco();

    this.espada = this._plano(this.texEspada, desenho.w, desenho.h, desenho.altura);
    this.escudo = this._plano(this.texEscudo, 96, 96, 1.5);
    this.risco = this._plano(this.texRisco, 128, 96, 2.2);
    this.risco.material.opacity = 0;
    this.risco.material.blending = THREE.AdditiveBlending;

    // brilho do escudo — mesma silhueta, somada por cima em modo aditivo.
    // Acende dourado no aparo e branco-frio no bloqueio comum, para o
    // jogador distinguir os dois sem precisar ler nada na tela.
    this.brilhoEscudo = this._plano(this.texEscudo, 96, 96, 1.72);
    this.brilhoEscudo.material.blending = THREE.AdditiveBlending;
    this.brilhoEscudo.material.opacity = 0;
    this.brilhoEscudo.material.alphaTest = 0;
    this.luzEscudo = 0;
    this.corLuzEscudo = new THREE.Color(0xFFD65A);

    // clarão do disparo: só para o que tem pólvora. O arco é `distancia`
    // e não acende nada, então quem manda é a `boca` do desenho.
    this.fogo = null;
    if (this.tipo === 'distancia' && desenho.boca) {
      this.texFogo = gerarFogoDeBoca();
      this.fogo = this._plano(this.texFogo, 96, 96, 1.7);
      this.fogo.material.blending = THREE.AdditiveBlending;
      this.fogo.material.opacity = 0;
      this.fogo.material.alphaTest = 0;
      this.cena.add(this.fogo);
    }
    this.brilhoFogo = 0;
    this.coice = 0;

    // arma de duas mãos não carrega escudo
    this.temEscudo = this.def.escudo !== false;
    // ...mas pode aparar com a própria arma, atravessando o cabo na
    // frente do corpo. Nesse caso não existe escudo na tela: quem
    // acende no bloqueio é a arma.
    this.guardaComArma = !!this.def.guardaComArma;
    this.escudo.visible = false;
    this.brilhoEscudo.visible = false;

    if (this.guardaComArma) {
      this.brilhoArma = this._plano(this.texEspada, desenho.w, desenho.h, desenho.altura * 1.06);
      this.brilhoArma.material.blending = THREE.AdditiveBlending;
      this.brilhoArma.material.opacity = 0;
      this.brilhoArma.material.alphaTest = 0;
      this.brilhoArma.visible = false;
      this.cena.add(this.brilhoArma);
    }

    this.cena.add(this.espada, this.escudo, this.brilhoEscudo, this.risco);

    this.t = 0;
    this.golpeando = false;
    this.tempoGolpe = 0;
    this.jaAcertou = false;
    this.recarga = 0;
    this.bloqueando = false;
    this.alturaEscudo = 0;
    this.recuoEscudo = 0;
    this.aoAcertar = null;
    this.aspect = 1;
    this.redimensionar(16 / 9);
  }

  _plano(tex, w, h, alturaMundo) {
    const razao = w / h;
    const g = new THREE.PlaneGeometry(alturaMundo * razao, alturaMundo);
    const m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.06, depthTest: false, depthWrite: false,
    });
    const malha = new THREE.Mesh(g, m);
    malha.userData.tam = new THREE.Vector2(alturaMundo * razao, alturaMundo);
    return malha;
  }

  redimensionar(aspect) {
    this.aspect = aspect;
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();
    // A HUD é um canvas 320×32 colado no rodapé em largura total: a
    // altura dela é sempre 1/10 da largura da janela, ou seja aspect/10
    // da tela. Nesta cena a tela tem 2 unidades de altura, então o topo
    // da barra fica aqui. É neste piso que a arma se apoia.
    this.piso = -1 + aspect / 5;
  }

  podeAtacar() { return !this.golpeando && this.recarga <= 0; }

  atacar(cadencia) {
    if (!this.podeAtacar()) return false;
    this.golpeando = true;
    this.tempoGolpe = 0;
    this.jaAcertou = false;
    this.recarga = 1 / Math.max(0.3, cadencia);
    if (this.tipo === 'distancia') {
      this.brilhoFogo = 1;
      this.coice = 1;
      Audio.sfx(this.def.somDisparo ?? 'tiro');
    } else {
      Audio.sfx(this.def.somDisparo ?? 'swing');
    }
    return true;
  }

  atualizar(dt, jogador) {
    this.t += dt;
    this.recarga = Math.max(0, this.recarga - dt);
    this.bloqueando = jogador.bloqueando;

    const a = this.aspect;
    const baseX = a + this.desenho.ancoraX;
    const baseY = this.piso + this.desenho.ancoraY;

    // respiração + balanço vinculados ao passo do jogador
    const bob = jogador.balanco;
    let x = baseX + Math.cos(bob) * 0.045;
    let y = baseY + Math.abs(Math.sin(bob)) * 0.05;
    let rot = -0.08 + Math.sin(bob * 0.5) * 0.02;

    if (this.golpeando && this.tipo === 'distancia') {
      // Disparo: coice para cima e para trás, e volta assentando.
      // O dano sai no primeiro quadro — arma de fogo não tem arco.
      this.tempoGolpe += dt;
      const p = Math.min(1, this.tempoGolpe / (DUR_TIRO / Math.max(0.4, this.def.cadencia)));
      const chute = Math.exp(-p * 5) * (1 - p);
      x = baseX + chute * 0.10;
      y = baseY - chute * 0.42;
      rot = -0.08 - chute * 0.38;

      if (!this.jaAcertou) {
        this.jaAcertou = true;
        if (this.aoAcertar) this.aoAcertar();
      }
      if (p >= 1) this.golpeando = false;
    } else if (this.golpeando) {
      this.tempoGolpe += dt;
      const p = Math.min(1, this.tempoGolpe / DUR_GOLPE);

      // arco: sobe rápido, cruza, volta devagar
      const subida = Math.sin(Math.min(1, p / 0.45) * Math.PI * 0.5);
      const retorno = p > 0.55 ? (p - 0.55) / 0.45 : 0;
      const arco = subida * (1 - retorno);

      x = baseX - arco * 1.35;
      y = baseY + arco * 0.95;
      rot = -0.08 - arco * 1.5;

      if (!this.jaAcertou && p >= MOMENTO_ACERTO) {
        this.jaAcertou = true;
        if (this.aoAcertar) this.aoAcertar();
      }

      // risco luminoso na passagem da lâmina
      const vis = p > 0.28 && p < 0.62;
      this.risco.material.opacity = vis ? 0.85 * (1 - Math.abs(p - 0.45) / 0.17) : 0;
      this.risco.position.set(0.12 * a, this.piso + 0.60, 0);
      this.risco.rotation.z = -0.3 + p * 0.9;

      if (p >= 1) { this.golpeando = false; this.risco.material.opacity = 0; }
    } else {
      this.risco.material.opacity = Math.max(0, this.risco.material.opacity - dt * 6);
    }

    // clarão do disparo, colado na boca do cano
    if (this.fogo) {
      this.brilhoFogo = Math.max(0, this.brilhoFogo - dt * 9);
      const b = this.brilhoFogo;
      this.fogo.visible = b > 0.02;
      if (this.fogo.visible) {
        this.fogo.material.opacity = Math.min(1, b * 1.4);
        const [bx, by] = this.desenho.boca ?? [-0.29, 0.29];
        this.fogo.position.set(x + bx, y + by, 0);
        this.fogo.rotation.z = (this.t * 9) % 6.28;
        const e = 0.7 + (1 - b) * 0.8;
        this.fogo.scale.set(e, e, 1);
      }
    }

    // ---------- guarda com a própria arma ----------
    // A arma atravessa na frente do corpo: sobe, centraliza e deita
    // quase na horizontal. É uma pose diferente da de ataque, senão o
    // jogador não sabe se está guardando ou prestes a bater.
    if (this.guardaComArma) {
      this.escudo.visible = false;
      this.brilhoEscudo.visible = false;

      const alvo = this.bloqueando ? 1 : 0;
      this.alturaEscudo += (alvo - this.alturaEscudo) * Math.min(1, dt * 13);
      const g = this.alturaEscudo;

      // impacto: a arma recua e volta
      this.recuoEscudo = Math.max(0, this.recuoEscudo - dt * 5.5);
      const r = this.recuoEscudo > 0 ? Math.sin(this.recuoEscudo * Math.PI) * 0.20 : 0;

      const gx = x + (0.10 - x) * g * 0.85 + r * 0.5;
      const gy = y + (0.16 - y) * g * 0.62 - r * 0.35;
      const grot = rot + g * (1.32 - rot) + r * 0.6;

      this.espada.position.set(gx, gy, 0);
      this.espada.rotation.z = grot;

      // o clarão do bloqueio acende sobre a própria arma
      this.luzEscudo = Math.max(0, this.luzEscudo - dt * 3.2);
      const b = this.brilhoArma;
      b.visible = this.luzEscudo > 0.01;
      if (b.visible) {
        b.position.copy(this.espada.position);
        b.rotation.z = this.espada.rotation.z;
        const p = this.luzEscudo;
        b.material.opacity = Math.min(1, p * p * 1.35);
        b.material.color.copy(this.corLuzEscudo);
      }
      return;
    }

    // arma de duas mãos sem guarda: o bloqueio nem sobe
    if (!this.temEscudo) {
      this.escudo.visible = false;
      this.brilhoEscudo.visible = false;
      this.espada.position.set(x, y, 0);
      this.espada.rotation.z = rot;
      return;
    }

    // escudo sobe ao bloquear
    const alvoEscudo = this.bloqueando ? 1 : 0;
    this.alturaEscudo += (alvoEscudo - this.alturaEscudo) * Math.min(1, dt * 12);
    this.escudo.position.set(
      -a + 0.78 - (1 - this.alturaEscudo) * 0.5,
      this.piso - 0.86 + this.alturaEscudo * 1.05 + Math.sin(this.t * 2) * 0.02,
      0
    );
    this.escudo.rotation.z = 0.12 - this.alturaEscudo * 0.1;
    this.escudo.visible = this.alturaEscudo > 0.02;

    // impacto: o escudo recua e volta
    this.recuoEscudo = Math.max(0, this.recuoEscudo - dt * 5.5);
    if (this.recuoEscudo > 0) {
      const r = Math.sin(this.recuoEscudo * Math.PI) * 0.22;
      this.escudo.position.x -= r;
      this.escudo.position.y -= r * 0.4;
      this.escudo.rotation.z += r * 0.8;
    }

    // brilho por cima da mesma silhueta
    this.luzEscudo = Math.max(0, this.luzEscudo - dt * 3.2);
    const b = this.brilhoEscudo;
    b.visible = this.luzEscudo > 0.01;
    if (b.visible) {
      b.position.copy(this.escudo.position);
      b.rotation.z = this.escudo.rotation.z;
      // pulso rápido no primeiro instante, depois some
      const p = this.luzEscudo;
      b.material.opacity = Math.min(1, p * p * 1.5);
      b.material.color.copy(this.corLuzEscudo);
      const escala = 1 + (1 - p) * 0.12;
      b.scale.set(escala, escala, 1);
    }

    // ao bloquear, a espada recolhe um pouco
    if (this.bloqueando && !this.golpeando) { x += 0.22; y -= 0.16; rot += 0.25; }

    this.espada.position.set(x, y, 0);
    this.espada.rotation.z = rot;
  }

  // bloqueio comum: faísca fria e curta
  flashBloqueio() {
    this.alturaEscudo = Math.min(1, this.alturaEscudo + 0.15);
    this.recuoEscudo = 1;
    this.luzEscudo = Math.max(this.luzEscudo, 0.55);
    this.corLuzEscudo.setHex(0xBFD4E8);
  }

  // aparo no tempo certo: clarão dourado, forte e mais demorado
  flashAparo() {
    this.alturaEscudo = 1;
    this.recuoEscudo = 1;
    this.luzEscudo = 1.35;
    this.corLuzEscudo.setHex(0xFFD65A);
  }

  descartar() {
    if (this.brilhoArma) {
      this.cena.remove(this.brilhoArma);
      this.brilhoArma.geometry.dispose();
      this.brilhoArma.material.dispose();
    }
    if (this.fogo) { this.cena.remove(this.fogo); this.fogo.geometry.dispose(); this.fogo.material.dispose(); this.texFogo.dispose(); }
    [this.espada, this.escudo, this.brilhoEscudo, this.risco].forEach(m => {
      m.geometry.dispose(); m.material.dispose();
    });
    this.texEspada.dispose(); this.texEscudo.dispose(); this.texRisco.dispose();
  }
}
