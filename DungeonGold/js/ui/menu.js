// ============================================================
// Menu principal.
//
// O elemento assinatura é o título: "DUNGEON GOLD" montado com
// cubos de ouro, um cubo por pixel da minha fonte de bitmap.
// Na abertura os blocos caem de posições aleatórias e se
// encaixam — a mesma fonte que desenha a HUD constrói o letreiro
// em 3D, então a identidade do jogo é literalmente a mesma peça
// em duas escalas.
// ============================================================

import * as THREE from 'three';
import { mascaraGlifo, LARGURA_GLIFO, ALTURA_GLIFO } from '../gfx/pixelfont.js';
import { Settings } from '../core/settings.js';
import { Audio } from '../core/audio.js';
import { quadrosTocha } from '../gfx/textures.js';

const facil = t => 1 - Math.pow(1 - t, 3);

export class Menu {
  constructor(aoEscolher) {
    this.retratos = {};
    this.condicoes = {};
    this.aoEscolher = aoEscolher;
    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color(0x080706);
    this.cena.fog = new THREE.Fog(0x080706, 18, 62);
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 200);
    this.t = 0;
    this.visivel = false;

    this._montarCena();
    this._montarTitulo();
    this._ligarDom();
  }

  // ---------- cena ----------
  _montarCena() {
    const chao = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshPhongMaterial({ color: 0x2A2621, shininess: 4 })
    );
    chao.rotation.x = -Math.PI / 2;
    chao.position.y = -9;
    this.cena.add(chao);

    // colunas ao fundo: dão profundidade sem custar nada
    const geoCol = new THREE.BoxGeometry(2.4, 26, 2.4);
    const matCol = new THREE.MeshPhongMaterial({ color: 0x3A342C, shininess: 6 });
    const colunas = new THREE.InstancedMesh(geoCol, matCol, 12);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      const lado = i % 2 ? 1 : -1;
      const fila = Math.floor(i / 2);
      m.makeTranslation(lado * (16 + fila * 1.2), 4, -8 - fila * 13);
      colunas.setMatrixAt(i, m);
    }
    colunas.instanceMatrix.needsUpdate = true;
    this.cena.add(colunas);

    // tochas
    this.quadrosTocha = quadrosTocha();
    this.tochas = [];
    for (let i = 0; i < 6; i++) {
      const lado = i % 2 ? 1 : -1;
      const fila = Math.floor(i / 2);
      const x = lado * (13.4 + fila * 1.2), z = -8 - fila * 13;
      const mat = new THREE.SpriteMaterial({ map: this.quadrosTocha[0], transparent: true, depthWrite: false, fog: false });
      const spr = new THREE.Sprite(mat);
      spr.position.set(x, 3.2, z);
      spr.scale.set(2.2, 3.3, 1);
      this.cena.add(spr);
      this.tochas.push({ spr, mat, fase: Math.random() * 9 });
    }

    // luzes principais
    this.luzA = new THREE.PointLight(0xFFB070, 90, 60, 2);
    this.luzA.position.set(-11, 6, 6);
    this.luzB = new THREE.PointLight(0xE3B23C, 70, 60, 2);
    this.luzB.position.set(13, 2, 10);
    this.cena.add(this.luzA, this.luzB);
    this.cena.add(new THREE.AmbientLight(0x40382C, 0.7));

    // poeira suspensa
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 24 - 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 6;
    }
    const geoP = new THREE.BufferGeometry();
    geoP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.poeira = new THREE.Points(geoP, new THREE.PointsMaterial({
      color: 0xE8C88A, size: 0.14, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.cena.add(this.poeira);
  }

  // ---------- título em voxels ----------
  _montarTitulo() {
    const linhas = [
      { texto: 'DUNGEON', escala: 1.0, y: 5.2 },
      { texto: 'GOLD', escala: 1.62, y: -1.6 },
    ];

    const alvos = [];
    for (const linha of linhas) {
      const passo = LARGURA_GLIFO + 1;
      const larguraTotal = linha.texto.length * passo - 1;
      const off = -larguraTotal / 2;
      for (let i = 0; i < linha.texto.length; i++) {
        const g = mascaraGlifo(linha.texto[i]);
        for (let ry = 0; ry < ALTURA_GLIFO; ry++) {
          for (let rx = 0; rx < LARGURA_GLIFO; rx++) {
            if (!g[ry][rx]) continue;
            alvos.push(new THREE.Vector3(
              (off + i * passo + rx) * linha.escala,
              linha.y - ry * linha.escala,
              0
            ));
          }
        }
      }
    }

    this.blocos = alvos.map((alvo, i) => ({
      alvo,
      inicio: new THREE.Vector3(
        alvo.x + (Math.random() - 0.5) * 46,
        alvo.y + Math.random() * 40 + 12,
        (Math.random() - 0.5) * 34
      ),
      atraso: (alvo.x + 30) * 0.012 + Math.random() * 0.25,
      fase: Math.random() * 6.28,
    }));

    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xE3B23C,
      specular: 0xFFF2C4,
      shininess: 70,
      emissive: 0x241804,
    });
    this.malhaTitulo = new THREE.InstancedMesh(geo, mat, this.blocos.length);
    this.malhaTitulo.frustumCulled = false;
    this.grupoTitulo = new THREE.Group();
    this.grupoTitulo.add(this.malhaTitulo);
    this.grupoTitulo.position.set(9, 1.5, 0);
    this.grupoTitulo.scale.setScalar(0.62);
    this.cena.add(this.grupoTitulo);

    this.tempoMontagem = 0;
  }

  reiniciarAnimacao() { this.tempoMontagem = 0; }

  // ---------- DOM ----------
  _ligarDom() {
    this.el = document.getElementById('menu');
    this.painelAjustes = document.getElementById('panel-settings');
    this.painelCreditos = document.getElementById('panel-credits');
    this.painelArmas = document.getElementById('panel-armas');
    this.raiz = document.getElementById('menu-root');
    this.meta = document.getElementById('menu-meta');

    this.el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      const acao = b.dataset.action;
      Audio.iniciar(); Audio.retomar();
      if (acao === 'back') { Audio.sfx('uiBack'); this._painel(null); return; }
      if (acao === 'settings') { Audio.sfx('uiPick'); this._painel('ajustes'); return; }
      if (acao === 'credits') { Audio.sfx('uiPick'); this._painel('creditos'); return; }
      if (acao === 'play') { Audio.sfx('uiPick'); this._painel('armas'); return; }
      Audio.sfx('uiPick');
      this.aoEscolher(acao);
    });

    this.el.querySelectorAll('.plaque').forEach(p => {
      p.addEventListener('mouseenter', () => Audio.sfx('uiMove'));
    });

    this._ligarAjustes();

    document.getElementById('btn-descer').addEventListener('click', () => {
      if (!this.armaEscolhida) return;
      Audio.sfx('uiPick');
      this._painel(null);
      this.aoEscolher('play', this.armaEscolhida);
    });
  }

  _painel(qual) {
    this.painelAjustes.classList.toggle('hidden', qual !== 'ajustes');
    this.painelCreditos.classList.toggle('hidden', qual !== 'creditos');
    this.painelArmas.classList.toggle('hidden', qual !== 'armas');
    this.raiz.classList.toggle('hidden', qual === 'armas');
  }

  // ---------- escolha de arma ----------
  // retratos: id do sprite -> data URL; condicoes: id do desbloqueio -> texto
  prepararArmas(retratos, condicoes) {
    this.retratos = retratos || {};
    this.condicoes = condicoes || {};
  }

  condicaoDe(arma) {
    return this.condicoes[arma.desbloqueio] || 'condição desconhecida';
  }

  montarArmas(armas, liberada) {
    // armas de run não entram aqui: elas se acham no chão, e mostrá-las
    // no menu entregaria a surpresa e daria a impressão de que estão
    // travadas para sempre
    armas = armas.filter(a => !a.apenasNaRun);
    this.armas = armas;
    this.armaEscolhida = null;
    const lista = document.getElementById('armas-lista');

    lista.innerHTML = armas.map(a => {
      const livre = liberada(a);
      const fichas = a.tipo === 'distancia'
        ? [`${a.chumbos} chumbos`, `${a.cadencia.toFixed(2)}/s`, 'dano cai com a distância', 'com escudo']
        : [`${a.dano} de dano`, `${a.cadencia.toFixed(2)}/s`, `alcance ${a.alcance}`,
           a.escudo === false ? 'sem escudo' : 'com escudo'];
      return `
        <button class="arma${livre ? '' : ' travada'}" data-arma="${a.id}" ${livre ? '' : 'disabled'}>
          <span class="retrato"><img src="${this.retratos[a.sprite] || ''}" alt=""></span>
          <span class="corpo">
            <h3>${a.nome}</h3>
            <p class="lema">${a.lema}</p>
            <p class="desc">${a.descricao}</p>
            <span class="fichas">${fichas.map(f => `<span class="ficha">${f}</span>`).join('')}</span>
            ${livre ? '' : `<span class="cadeado">Bloqueada — <b>${this.condicaoDe(a)}</b></span>`}
          </span>
        </button>`;
    }).join('');

    lista.querySelectorAll('.arma:not(.travada)').forEach(el => {
      el.addEventListener('click', () => {
        lista.querySelectorAll('.arma').forEach(o => o.classList.remove('escolhida'));
        el.classList.add('escolhida');
        this.armaEscolhida = armas.find(a => a.id === el.dataset.arma);
        document.getElementById('btn-descer').disabled = false;
        Audio.sfx('uiPick');
      });
      el.addEventListener('mouseenter', () => Audio.sfx('uiMove'));
    });

    document.getElementById('btn-descer').disabled = true;
  }

  _ligarAjustes() {
    const d = Settings.data;
    const par = [
      ['s-master', 'master', 'v-master'],
      ['s-music', 'music', 'v-music'],
      ['s-sfx', 'sfx', 'v-sfx'],
      ['s-fov', 'fov', 'v-fov'],
      ['s-sens', 'sens', 'v-sens'],
      ['s-brilho', 'brilho', 'v-brilho'],
    ];
    for (const [id, chave, idVal] of par) {
      const el = document.getElementById(id);
      const val = document.getElementById(idVal);
      el.value = d[chave];
      val.textContent = d[chave];
      el.addEventListener('input', () => {
        const v = parseInt(el.value, 10);
        val.textContent = v;
        Settings.set(chave, v);
      });
      el.addEventListener('change', () => Audio.sfx('uiMove'));
    }

    const caixas = [['s-dither', 'dither'], ['s-scan', 'scanlines'], ['s-flicker', 'flicker'], ['s-bob', 'bob']];
    for (const [id, chave] of caixas) {
      const el = document.getElementById(id);
      el.checked = !!d[chave];
      el.addEventListener('change', () => { Settings.set(chave, el.checked); Audio.sfx('uiMove'); });
    }

    const q = document.getElementById('s-quality');
    q.value = d.quality;
    q.addEventListener('change', () => { Settings.set('quality', q.value); Audio.sfx('uiMove'); });
  }

  atualizarMeta(progresso) {
    const p = progresso;
    this.meta.innerHTML = `
      Andar mais fundo <b>${p.recorde}</b><br>
      Ouro no cofre <b>${p.ouroTotal}</b><br>
      Criaturas abatidas <b>${p.abates}</b><br>
      Itens liberados <b>${p.liberados.length}</b>`;
  }

  mostrar() {
    this.visivel = true;
    this.el.classList.remove('hidden');
    this._painel(null);
    this.reiniciarAnimacao();
  }

  esconder() {
    this.visivel = false;
    this.el.classList.add('hidden');
  }

  redimensionar(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  atualizar(dt) {
    this.t += dt;
    this.tempoMontagem += dt;

    // montagem dos blocos
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const esc = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();

    for (let i = 0; i < this.blocos.length; i++) {
      const b = this.blocos[i];
      const t = Math.max(0, Math.min(1, (this.tempoMontagem - b.atraso) / 1.1));
      const f = facil(t);
      p.lerpVectors(b.inicio, b.alvo, f);
      if (t < 1) {
        p.y += Math.sin(t * Math.PI) * 1.6;
        e.set((1 - f) * 6, (1 - f) * 5, (1 - f) * 4);
      } else {
        // respiração sutil depois de montado
        p.z += Math.sin(this.t * 1.4 + b.fase) * 0.16;
        e.set(0, 0, 0);
      }
      q.setFromEuler(e);
      const s = t < 1 ? 0.4 + f * 0.6 : 1;
      esc.setScalar(s);
      m.compose(p, q, esc);
      this.malhaTitulo.setMatrixAt(i, m);
    }
    this.malhaTitulo.instanceMatrix.needsUpdate = true;

    this.grupoTitulo.rotation.y = Math.sin(this.t * 0.25) * 0.16;
    this.grupoTitulo.rotation.x = Math.sin(this.t * 0.19) * 0.05;

    // chamas
    for (const t of this.tochas) {
      const i = Math.floor((this.t * 12 + t.fase) % this.quadrosTocha.length);
      if (t.mat.map !== this.quadrosTocha[i]) { t.mat.map = this.quadrosTocha[i]; t.mat.needsUpdate = true; }
    }
    if (Settings.data.flicker) {
      this.luzA.intensity = 84 + Math.sin(this.t * 9) * 14 + Math.sin(this.t * 23) * 7;
      this.luzB.intensity = 64 + Math.sin(this.t * 7 + 2) * 12;
    } else {
      this.luzA.intensity = 88; this.luzB.intensity = 68;
    }

    // poeira subindo
    const pos = this.poeira.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * (0.25 + (i % 7) * 0.05);
      if (y > 16) y = -8;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;

    // câmera com deriva lenta
    this.camera.position.set(
      Math.sin(this.t * 0.16) * 1.6,
      2.2 + Math.sin(this.t * 0.21) * 0.5,
      26
    );
    this.camera.lookAt(4.5, 1.2, 0);
  }
}
