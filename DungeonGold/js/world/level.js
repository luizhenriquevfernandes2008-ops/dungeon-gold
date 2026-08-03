// ============================================================
// Monta o nível em 3D a partir da grade do gerador.
//
// Decisões de desempenho que importam:
//  - paredes viram UMA InstancedMesh (uma chamada de desenho
//    para a masmorra inteira);
//  - chão e teto são dois planos grandes com repetição de
//    textura, não um plano por célula;
//  - as luzes são um POOL FIXO de 8 point lights que só mudam
//    de posição. Criar/remover luz recompila o shader e trava
//    o jogo; reposicionar não custa nada.
// ============================================================

import * as THREE from 'three';
import { VAZIO, CHAO, PORTA, ESCADA, CORES_CHAVE } from './generator.js';
import { texturaParede, texturaParedeOrnada, texturaChao, texturaTeto, texturaPorta, texturaEscada, quadrosTocha } from '../gfx/textures.js';
import { Settings } from '../core/settings.js';

const MAX_LUZES = 8;

export class Nivel {
  constructor(mapa, cfg, tema) {
    this.mapa = mapa;
    this.cfg = cfg;
    this.tema = tema;
    this.C = cfg.dungeon.celula;
    this.H = cfg.dungeon.alturaParede;
    this.semTeto = !!cfg.dungeon.semTeto;
    this.grupo = new THREE.Group();
    this.portasAbertas = new Set();
    this.portas = [];
    this.materiaisTrancadas = [];
    this.chavesDoJogador = new Set();   // preenchido pelo Jogo
    this.portasDestrancadas = new Set();
    this.aoTentarTrancada = null;       // aviso na tela
    this.tochas = [];
    this.luzes = [];
    this.texturas = [];
    this.tempo = 0;
  }

  // ---------- conversões ----------
  mundoDaCelula(cx, cy) {
    return new THREE.Vector3((cx + 0.5) * this.C, 0, (cy + 0.5) * this.C);
  }
  celulaDe(x, z) {
    return { cx: Math.floor(x / this.C), cy: Math.floor(z / this.C) };
  }

  solidoNaCelula(cx, cy) {
    const t = this.mapa.tipoEm(cx, cy);
    if (t === VAZIO) return true;
    if (t === PORTA) return !this.portasAbertas.has(`${cx},${cy}`);
    return false;
  }

  // ---------- construção ----------
  construir() {
    const { mapa, C, H, tema } = this;
    const L = mapa.largura, A = mapa.altura;

    const texParede = texturaParede(tema, mapa.semente);
    const texOrnada = texturaParedeOrnada(tema, mapa.semente + 5);
    const texChao = texturaChao(tema, mapa.semente + 9);
    const texTeto = texturaTeto(tema, mapa.semente + 13);
    const texPorta = texturaPorta(tema, mapa.semente + 17);
    const texEscada = texturaEscada(tema, mapa.semente + 21);
    this.texturas.push(texParede, texOrnada, texChao, texTeto, texPorta, texEscada);

    texChao.repeat.set(L, A);
    texTeto.repeat.set(L, A);

    // --- chão e teto ---
    const planoChao = new THREE.Mesh(
      new THREE.PlaneGeometry(L * C, A * C),
      new THREE.MeshLambertMaterial({ map: texChao })
    );
    planoChao.rotation.x = -Math.PI / 2;
    planoChao.position.set(L * C / 2, 0, A * C / 2);
    this.grupo.add(planoChao);

    // Santuário e Abismo perderam o teto: acima é o vazio. Sem o plano,
    // o fundo da cena aparece e o andar fica imediatamente reconhecível.
    if (!this.semTeto) {
      const planoTeto = new THREE.Mesh(
        new THREE.PlaneGeometry(L * C, A * C),
        new THREE.MeshLambertMaterial({ map: texTeto })
      );
      planoTeto.rotation.x = Math.PI / 2;
      planoTeto.position.set(L * C / 2, H, A * C / 2);
      this.grupo.add(planoTeto);
    }

    // --- paredes ---
    const blocos = [];
    for (let y = 0; y < A; y++) {
      for (let x = 0; x < L; x++) {
        if (mapa.tipoEm(x, y) !== VAZIO) continue;
        let vizinhoAberto = false;
        for (let dy = -1; dy <= 1 && !vizinhoAberto; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (mapa.tipoEm(x + dx, y + dy) !== VAZIO) { vizinhoAberto = true; break; }
          }
        if (vizinhoAberto) blocos.push([x, y]);
      }
    }

    const geoBloco = new THREE.BoxGeometry(C, H, C);
    const matParede = new THREE.MeshLambertMaterial({ map: texParede });
    const matOrnada = new THREE.MeshLambertMaterial({ map: texOrnada });

    const ornados = blocos.filter((_, i) => i % 9 === 0);
    const comuns = blocos.filter((_, i) => i % 9 !== 0);

    this.malhaParede = this._instanciar(geoBloco, matParede, comuns, H / 2);
    this.malhaOrnada = this._instanciar(geoBloco, matOrnada, ornados, H / 2);

    // --- portas ---
    const geoPorta = new THREE.BoxGeometry(C * 0.98, H * 0.96, C * 0.34);
    const matPorta = new THREE.MeshLambertMaterial({ map: texPorta });
    for (const p of mapa.portas) {
      const trancada = p.trancada || null;
      const cor = trancada ? (CORES_CHAVE.find(c => c.id === trancada) || null) : null;
      // porta trancada ganha material próprio para receber a tinta da chave
      const mat = cor
        ? new THREE.MeshLambertMaterial({ map: texPorta, color: cor.cor, emissive: cor.cor, emissiveIntensity: 0.22 })
        : matPorta;
      const m = new THREE.Mesh(geoPorta, mat);
      const pos = this.mundoDaCelula(p.x, p.y);
      m.position.set(pos.x, H * 0.48, pos.z);
      if (!p.horizontal) m.rotation.y = Math.PI / 2;
      m.userData.chave = `${p.x},${p.y}`;
      m.userData.baseY = H * 0.48;
      m.userData.aberta = 0;
      m.userData.trancada = trancada;
      m.userData.destrancada = false;
      if (cor) this.materiaisTrancadas.push(mat);
      this.grupo.add(m);
      this.portas.push(m);
    }

    // --- escada de saída ---
    const saida = mapa.saida;
    const posSaida = this.mundoDaCelula(saida.cx, saida.cy);
    const escada = new THREE.Mesh(
      new THREE.BoxGeometry(C * 1.6, 0.6, C * 1.6),
      new THREE.MeshLambertMaterial({ map: texEscada })
    );
    escada.position.set(posSaida.x, 0.3, posSaida.z);
    this.grupo.add(escada);
    this.posSaida = posSaida.clone();

    // A escada do último andar comum não é uma escada: é a boca do
    // andar final. Cor de sangue em vez de ouro, luz mais forte e um
    // pilar subindo — o jogador tem que saber que aquilo é diferente
    // ANTES de pisar, e decidir se está pronto.
    const corSaida = this.portalFinal ? 0xC4322A : 0xE3B23C;
    const luzSaida = new THREE.PointLight(corSaida, this.portalFinal ? 11 : 6, C * (this.portalFinal ? 12 : 7), 2);
    luzSaida.position.set(posSaida.x, 2.4, posSaida.z);
    this.grupo.add(luzSaida);
    this.luzSaida = luzSaida;

    if (this.portalFinal) {
      const pilar = new THREE.Mesh(
        new THREE.CylinderGeometry(C * 0.42, C * 0.52, H * 0.95, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: corSaida, transparent: true, opacity: 0.30,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      pilar.position.set(posSaida.x, H * 0.48, posSaida.z);
      this.grupo.add(pilar);
      this.pilarPortal = pilar;
    }

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(C * 0.5, C * 0.8, 16),
      new THREE.MeshBasicMaterial({ color: corSaida, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(posSaida.x, 0.65, posSaida.z);
    this.grupo.add(halo);
    this.halo = halo;

    // --- tochas ---
    this.quadrosTocha = quadrosTocha();
    this.texturas.push(...this.quadrosTocha);
    for (const t of mapa.tochas) {
      const base = this.mundoDaCelula(t.x, t.y);
      const px = base.x + t.dx * C * 0.42;
      const pz = base.z + t.dy * C * 0.42;
      const mat = new THREE.SpriteMaterial({
        map: this.quadrosTocha[0],
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const spr = new THREE.Sprite(mat);
      spr.position.set(px, H * 0.58, pz);
      spr.scale.set(0.9, 1.35, 1);
      this.grupo.add(spr);
      this.tochas.push({ sprite: spr, mat, pos: new THREE.Vector3(px, H * 0.58, pz), fase: Math.random() * 10 });
    }

    // --- pool de luzes ---
    for (let i = 0; i < MAX_LUZES; i++) {
      const l = new THREE.PointLight(tema.luz, 0, C * 10, 1.6);
      l.position.set(-999, -999, -999);
      this.grupo.add(l);
      this.luzes.push(l);
    }

    // --- ambiente ---
    // Antes estava escuro demais para jogar: só 8 tochas iluminavam, e
    // corredor sem tocha virava breu total. Agora há um piso de luz
    // ambiente e uma lanterna presa ao jogador, para que o entorno
    // imediato nunca fique invisível.
    this.grupo.add(new THREE.AmbientLight(0xFFFFFF, 0.38));
    const hemi = new THREE.HemisphereLight(0x6A5A48, 0x241C16, 0.5);
    this.grupo.add(hemi);

    // lanterna do jogador — segue a câmera, cai rápido com a distância
    this.lanterna = new THREE.PointLight(0xFFD9A0, 3.4, C * 6, 1.7);
    this.grupo.add(this.lanterna);

    return this.grupo;
  }

  _instanciar(geo, mat, lista, alturaY) {
    const malha = new THREE.InstancedMesh(geo, mat, Math.max(1, lista.length));
    const m = new THREE.Matrix4();
    lista.forEach(([x, y], i) => {
      const p = this.mundoDaCelula(x, y);
      m.makeTranslation(p.x, alturaY, p.z);
      malha.setMatrixAt(i, m);
    });
    if (!lista.length) malha.setMatrixAt(0, m.makeTranslation(-9999, -9999, -9999));
    malha.instanceMatrix.needsUpdate = true;
    malha.frustumCulled = false;
    this.grupo.add(malha);
    return malha;
  }

  // ---------- atualização ----------
  atualizar(dt, posJogador) {
    this.tempo += dt;
    const tremer = Settings.data.flicker;

    // lanterna acompanha o jogador, um pouco acima da linha do olho
    if (this.lanterna) {
      this.lanterna.position.set(posJogador.x, this.H * 0.62, posJogador.z);
      this.lanterna.intensity = tremer
        ? 3.4 * (0.9 + 0.1 * Math.sin(this.tempo * 9.3))
        : 3.4;
    }

    // animação das chamas
    const q = this.quadrosTocha;
    for (const t of this.tochas) {
      const i = Math.floor((this.tempo * 12 + t.fase) % q.length);
      if (t.mat.map !== q[i]) { t.mat.map = q[i]; t.mat.needsUpdate = true; }
    }

    // as 8 tochas mais próximas recebem as luzes do pool
    const perto = this.tochas
      .map(t => ({ t, d: t.pos.distanceToSquared(posJogador) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_LUZES);

    for (let i = 0; i < MAX_LUZES; i++) {
      const l = this.luzes[i];
      if (i < perto.length) {
        const t = perto[i].t;
        l.position.copy(t.pos);
        const base = 8.4;
        l.intensity = tremer
          ? base * (0.78 + 0.22 * Math.sin(this.tempo * 11 + t.fase) + 0.12 * Math.sin(this.tempo * 27 + t.fase * 3))
          : base;
      } else {
        l.intensity = 0;
      }
    }

    // pulso do halo da saída
    if (this.halo) {
      this.halo.material.opacity = 0.22 + 0.16 * Math.sin(this.tempo * 2.4);
      this.halo.rotation.z += dt * 0.35;
    }
    if (this.luzSaida) {
      const base = this.portalFinal ? 9 : 5;
      const amp = this.portalFinal ? 3.4 : 1.6;
      const vel = this.portalFinal ? 4.6 : 2.4;   // pulsa mais rápido: é aviso, não convite
      this.luzSaida.intensity = base + amp * Math.sin(this.tempo * vel);
    }
    if (this.pilarPortal) {
      this.pilarPortal.material.opacity = 0.22 + 0.14 * Math.sin(this.tempo * 4.6);
      this.pilarPortal.rotation.y += dt * 0.5;
    }

    // pulso nas portas trancadas — precisa saltar aos olhos de longe
    for (const mat of this.materiaisTrancadas) {
      mat.emissiveIntensity = 0.18 + 0.14 * Math.sin(this.tempo * 3.1);
    }

    // portas abrem quando o jogador chega perto
    for (const porta of this.portas) {
      const dist = porta.position.distanceTo(posJogador);
      const u = porta.userData;

      // trancada: só cede com a chave da cor certa, e aí destranca de vez
      if (u.trancada && !u.destrancada) {
        if (dist < this.C * 1.5) {
          if (this.chavesDoJogador.has(u.trancada)) {
            u.destrancada = true;
            this.portasDestrancadas.add(u.chave);
            const cor = CORES_CHAVE.find(c => c.id === u.trancada);
            if (porta.material.emissive) porta.material.emissiveIntensity = 0;
            const i = this.materiaisTrancadas.indexOf(porta.material);
            if (i >= 0) this.materiaisTrancadas.splice(i, 1);
            if (this.aoTentarTrancada) this.aoTentarTrancada(true, cor);
          } else if (!u.avisou) {
            u.avisou = true;
            const cor = CORES_CHAVE.find(c => c.id === u.trancada);
            if (this.aoTentarTrancada) this.aoTentarTrancada(false, cor);
          }
        } else {
          u.avisou = false;
        }
        if (!u.destrancada) continue;   // fica fechada e sólida
      }

      const querAberta = dist < this.C * 1.5;
      const alvo = querAberta ? 1 : 0;
      if (querAberta && !porta.userData.tocou) {
        porta.userData.tocou = true;
        this.portasAbertas.add(porta.userData.chave);
        if (this.aoAbrirPorta) this.aoAbrirPorta();
      }
      if (!querAberta && porta.userData.aberta > 0.98) {
        // só fecha se ninguém estiver na célula
        porta.userData.tocou = false;
        this.portasAbertas.delete(porta.userData.chave);
      }
      const a = porta.userData.aberta;
      porta.userData.aberta = a + (alvo - a) * Math.min(1, dt * 4);
      porta.position.y = porta.userData.baseY + porta.userData.aberta * this.H * 0.95;
    }
  }

  // ---------- colisão ----------
  /** Move um círculo de raio r, resolvendo eixo por eixo. */
  mover(pos, dx, dz, raio) {
    let nx = pos.x + dx;
    if (!this.colideEm(nx, pos.z, raio)) pos.x = nx;
    let nz = pos.z + dz;
    if (!this.colideEm(pos.x, nz, raio)) pos.z = nz;
    return pos;
  }

  colideEm(x, z, raio) {
    const C = this.C;
    const c0x = Math.floor((x - raio) / C), c1x = Math.floor((x + raio) / C);
    const c0y = Math.floor((z - raio) / C), c1y = Math.floor((z + raio) / C);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.solidoNaCelula(cx, cy)) continue;
        const minX = cx * C, maxX = minX + C;
        const minZ = cy * C, maxZ = minZ + C;
        const px = Math.max(minX, Math.min(x, maxX));
        const pz = Math.max(minZ, Math.min(z, maxZ));
        const ddx = x - px, ddz = z - pz;
        if (ddx * ddx + ddz * ddz < raio * raio) return true;
      }
    }
    return false;
  }

  /** Linha de visão simples por amostragem — barato e suficiente. */
  temVisao(a, b) {
    const passos = Math.ceil(a.distanceTo(b) / (this.C * 0.4));
    for (let i = 1; i < passos; i++) {
      const t = i / passos;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const { cx, cy } = this.celulaDe(x, z);
      if (this.solidoNaCelula(cx, cy)) return false;
    }
    return true;
  }

  descartar() {
    this.grupo.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
    this.texturas.forEach(t => t.dispose());
    this.texturas.length = 0;
  }
}
