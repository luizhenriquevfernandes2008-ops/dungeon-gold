// ============================================================
// Armadilhas do andar.
//
// Duas famílias, e a diferença entre elas é de leitura, não de dano:
//
//  - CÍCLICAS (espinhos, jato de fogo) alternam dormente → aviso →
//    ativa em laço eterno. Ferem UMA vez por ativação, não por
//    quadro: quem entra no momento errado perde um bocado de vida,
//    mas não é triturado. A fase de aviso existe para o jogador
//    aprender o compasso e atravessar entre os disparos — sem ela a
//    armadilha vira imposto, não decisão.
//
//  - CONTÍNUAS (lodo) estão sempre ligadas: ferem por segundo e
//    atrasam o passo enquanto você estiver dentro. Por isso só
//    nascem dentro de sala, onde sempre dá para contornar.
//
// Nenhuma delas altera a grade, então a prova de conectividade do
// gerador continua valendo sem ser refeita.
// ============================================================

import * as THREE from 'three';
import { texturaPlacaEspinhos, texturaGrelhaFogo, texturaLodo, quadrosTocha } from '../gfx/textures.js';
import { Audio } from '../core/audio.js';
import { Settings } from '../core/settings.js';

// Luzes das chamas: pool fixo, como o das tochas. Criar PointLight em
// tempo de execução recompila o shader e engasga o quadro.
const MAX_LUZES_FOGO = 2;
const ALCANCE_SOM = 13;      // além disto o clique não toca: a masmorra inteira estalando vira ruído

export class Armadilhas {
  constructor(mapa, cfg, tema, catalogo, andar) {
    this.mapa = mapa;
    this.C = cfg.dungeon.celula;
    this.H = cfg.dungeon.alturaParede;
    this.andar = andar;
    this.tema = tema;
    this.grupo = new THREE.Group();
    this.itens = [];
    this.texturas = [];
    this.luzesFogo = [];
    this.tempo = 0;
    this.acumLodo = 0;

    const porId = {};
    for (const t of catalogo.armadilhas) porId[t.id] = t;
    this.tipos = porId;
  }

  // O dano cresce com a profundidade junto com o dos inimigos, senão a
  // armadilha do andar 1 vira cosmética no andar 12.
  _dano(tipo) {
    const base = tipo.dano ?? tipo.danoPorSegundo ?? 0;
    return base + (tipo.danoPorAndar ?? 0) * (this.andar - 1);
  }

  construir() {
    const C = this.C, H = this.H;
    const lista = this.mapa.armadilhas || [];
    if (!lista.length) return this.grupo;

    const usaEspinhos = lista.some(a => a.tipo === 'espinhos');
    const usaFogo = lista.some(a => a.tipo === 'jato_fogo');
    const usaLodo = lista.some(a => a.tipo === 'lodo');

    let matPlaca = null, geoEspinho = null, matEspinho = null;
    if (usaEspinhos) {
      const tex = texturaPlacaEspinhos();
      this.texturas.push(tex);
      matPlaca = new THREE.MeshLambertMaterial({ map: tex });
      // pirâmide de 4 lados: em silhueta e com pouca resolução isso lê
      // como espinho de ferro, e um cone liso leria como render vetorial
      geoEspinho = new THREE.ConeGeometry(0.16, 0.95, 4);
      matEspinho = new THREE.MeshLambertMaterial({ color: 0xB9C0C9 });
    }

    let matGrelha = null;
    if (usaFogo) {
      const tex = texturaGrelhaFogo();
      this.texturas.push(tex);
      matGrelha = new THREE.MeshLambertMaterial({ map: tex });
      this.quadrosChama = quadrosTocha();
      this.texturas.push(...this.quadrosChama);
      for (let i = 0; i < MAX_LUZES_FOGO; i++) {
        const l = new THREE.PointLight(0xFF8A3C, 0, C * 7, 1.8);
        l.position.set(-999, -999, -999);
        this.grupo.add(l);
        this.luzesFogo.push(l);
      }
    }

    let matLodo = null;
    if (usaLodo) {
      const tex = texturaLodo();
      this.texturas.push(tex);
      matLodo = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.88,
        depthWrite: false, side: THREE.DoubleSide,
      });
    }

    const geoPlaca = new THREE.BoxGeometry(C * 0.92, 0.1, C * 0.92);

    for (const a of lista) {
      const tipo = this.tipos[a.tipo];
      if (!tipo) continue;
      const p = new THREE.Vector3((a.x + 0.5) * C, 0, (a.y + 0.5) * C);
      const item = {
        tipo, def: a, pos: p, dano: this._dano(tipo),
        fase: a.fase ?? 0, feriu: false, dormia: true,
      };

      if (a.tipo === 'espinhos') {
        const placa = new THREE.Mesh(geoPlaca, matPlaca);
        placa.position.set(p.x, 0.05, p.z);
        this.grupo.add(placa);

        const ferros = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const e = new THREE.Mesh(geoEspinho, matEspinho);
          e.position.set(((i % 3) - 1) * C * 0.28, 0.48, ((i / 3 | 0) - 1) * C * 0.28);
          ferros.add(e);
        }
        ferros.position.set(p.x, -0.95, p.z);
        this.grupo.add(ferros);
        item.ferros = ferros;

      } else if (a.tipo === 'jato_fogo') {
        const grelha = new THREE.Mesh(geoPlaca, matGrelha);
        grelha.position.set(p.x, 0.05, p.z);
        this.grupo.add(grelha);

        const mat = new THREE.SpriteMaterial({
          map: this.quadrosChama[0], transparent: true,
          depthWrite: false, fog: false, opacity: 0,
        });
        const chama = new THREE.Sprite(mat);
        chama.position.set(p.x, H * 0.42, p.z);
        chama.scale.set(C * 0.75, H * 0.85, 1);
        chama.visible = false;
        this.grupo.add(chama);
        item.chama = chama;
        item.matChama = mat;

      } else if (a.tipo === 'lodo') {
        const r = (tipo.raio ?? 2) * C * 0.5;
        item.raioLodo = r;
        const poca = new THREE.Mesh(new THREE.CircleGeometry(r, 20), matLodo);
        poca.rotation.x = -Math.PI / 2;
        poca.position.set(p.x, 0.045, p.z);
        this.grupo.add(poca);
        item.poca = poca;
      }

      this.itens.push(item);
    }

    return this.grupo;
  }

  // Onde a armadilha está no ciclo: 0 dormente, 1 avisando, 2 ferindo.
  _faseDe(item) {
    const t = this.tipos[item.def.tipo];
    const ciclo = t.ciclo ?? 3;
    const q = (this.tempo + item.fase) % ciclo;
    const inicioAtivo = ciclo - (t.tempoAtivo ?? 0.8);
    const inicioAviso = inicioAtivo - (t.tempoAviso ?? 0.6);
    if (q >= inicioAtivo) return { estado: 2, p: (q - inicioAtivo) / (t.tempoAtivo ?? 0.8) };
    if (q >= inicioAviso) return { estado: 1, p: (q - inicioAviso) / (t.tempoAviso ?? 0.6) };
    return { estado: 0, p: 0 };
  }

  /**
   * Avança as animações e devolve o que o andar fez com o jogador
   * neste quadro. Quem aplica o dano é o Jogo — daqui não sai
   * alteração de estado do jogador.
   * @returns {{dano:number, tipo:object|null, lentidao:number}}
   */
  atualizar(dt, posJogador) {
    this.tempo += dt;
    let dano = 0, tipoQueFeriu = null, lentidao = 0;
    const tremer = Settings.data.flicker;
    const quadros = this.quadrosChama;
    const fogosAtivos = [];

    for (const item of this.itens) {
      const t = item.tipo;
      const dist = Math.hypot(posJogador.x - item.pos.x, posJogador.z - item.pos.z);

      if (t.modo === 'continua') {
        if (item.poca) {
          const pulso = 1 + Math.sin(this.tempo * 1.6 + item.fase) * 0.03;
          item.poca.scale.set(pulso, pulso, 1);
        }
        if (dist < item.raioLodo) {
          lentidao = Math.max(lentidao, t.lentidao ?? 0.4);
          this.acumLodo += dt;
          const passo = t.intervaloDano ?? 0.7;
          // dano em pulsos: aplicar por quadro seria comido pelos
          // quadros de invulnerabilidade e o lodo não machucaria nada
          if (this.acumLodo >= passo) {
            this.acumLodo -= passo;
            dano += item.dano * passo;
            tipoQueFeriu = t;
          }
        }
        continue;
      }

      const { estado, p } = this._faseDe(item);

      if (estado === 0) { item.feriu = false; item.avisou = false; }
      if (estado === 1 && !item.avisou) {
        item.avisou = true;
        if (dist < ALCANCE_SOM) Audio.sfx(item.def.tipo === 'espinhos' ? 'armadilhaArma' : 'armadilhaChama');
      }

      if (item.ferros) {
        // espiam no aviso, saltam na ativação e recolhem no fim
        const altura = estado === 2
          ? -0.95 + Math.min(1, p * 6) * 0.95
          : estado === 1 ? -0.95 + p * 0.22 : -0.95;
        item.ferros.position.y = altura;
      }

      if (item.chama) {
        const forca = estado === 2 ? 1 : estado === 1 ? p * 0.22 : 0;
        item.chama.visible = forca > 0.02;
        if (item.chama.visible) {
          item.matChama.opacity = Math.min(1, forca * 1.15);
          item.chama.scale.set(this.C * 0.75, this.H * 0.85 * (0.3 + forca * 0.7), 1);
          item.chama.position.y = this.H * 0.85 * (0.3 + forca * 0.7) * 0.5;
          const i = Math.floor((this.tempo * 16 + item.fase * 7) % quadros.length);
          if (item.matChama.map !== quadros[i]) {
            item.matChama.map = quadros[i];
            item.matChama.needsUpdate = true;
          }
          fogosAtivos.push({ item, forca, d: dist });
        }
      }

      if (estado === 2 && !item.feriu && dist < this.C * 0.52) {
        item.feriu = true;
        dano += item.dano;
        tipoQueFeriu = t;
      }
    }

    // as chamas mais próximas herdam as luzes do pool
    if (this.luzesFogo.length) {
      fogosAtivos.sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.luzesFogo.length; i++) {
        const l = this.luzesFogo[i];
        const f = fogosAtivos[i];
        if (!f) { l.intensity = 0; continue; }
        l.position.set(f.item.pos.x, this.H * 0.4, f.item.pos.z);
        l.intensity = 9 * f.forca * (tremer ? 0.85 + 0.15 * Math.sin(this.tempo * 19) : 1);
      }
    }

    return { dano: Math.round(dano), tipo: tipoQueFeriu, lentidao };
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
    this.itens.length = 0;
  }
}
