// ============================================================
// Áudio — tudo é sintetizado na hora com a Web Audio API.
// Nenhum arquivo de som no projeto: zero assets faltando.
// ============================================================

import { Settings } from './settings.js';

export const Audio = {
  ctx: null,
  gMaster: null,
  gMusic: null,
  gSfx: null,
  ruidoBuffer: null,
  musicaAtiva: false,
  _timerMusica: null,
  _passo: 0,

  iniciar() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[audio] Web Audio indisponível'); return; }
    this.ctx = new AC();

    this.gMaster = this.ctx.createGain();
    this.gMusic = this.ctx.createGain();
    this.gSfx = this.ctx.createGain();

    // Compressor no barramento final: evita estourar quando muita coisa toca junto.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;

    this.gMusic.connect(this.gMaster);
    this.gSfx.connect(this.gMaster);
    this.gMaster.connect(comp);
    comp.connect(this.ctx.destination);

    this.criarRuido();
    this.aplicarVolumes();
    Settings.aoMudar(() => this.aplicarVolumes());
  },

  retomar() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  aplicarVolumes() {
    if (!this.ctx) return;
    const d = Settings.data;
    const curva = v => Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6); // percepção logarítmica
    this.gMaster.gain.value = curva(d.master);
    this.gMusic.gain.value = curva(d.music) * 0.5;
    this.gSfx.gain.value = curva(d.sfx) * 0.7;
  },

  criarRuido() {
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;
    this.ruidoBuffer = buf;
  },

  // ---------- blocos básicos ----------
  _env(destino, t0, ataque, decaimento, pico = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, pico), t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ataque + decaimento);
    g.connect(destino);
    return g;
  },

  tom({ freq = 220, tipo = 'sine', dur = 0.2, ataque = 0.005, vol = 0.4, freq2 = null, dest = null, detune = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t0);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
    const g = this._env(dest || this.gSfx, t0, ataque, dur, vol);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + ataque + 0.05);
  },

  ruido({ dur = 0.2, vol = 0.4, corte = 1200, tipoFiltro = 'lowpass', corte2 = null, q = 1, dest = null }) {
    if (!this.ctx || !this.ruidoBuffer) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ruidoBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = tipoFiltro;
    f.Q.value = q;
    f.frequency.setValueAtTime(corte, t0);
    if (corte2) f.frequency.exponentialRampToValueAtTime(Math.max(40, corte2), t0 + dur);
    const g = this._env(dest || this.gSfx, t0, 0.004, dur, vol);
    src.connect(f); f.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  },

  // ---------- efeitos do jogo ----------
  sfx(nome) {
    if (!this.ctx) return;
    switch (nome) {
      case 'swing':                       // espada cortando o ar
        this.ruido({ dur: 0.16, vol: 0.35, corte: 3200, corte2: 700, tipoFiltro: 'bandpass', q: 1.4 });
        break;
      case 'hit':                         // acertou carne
        this.ruido({ dur: 0.13, vol: 0.5, corte: 900, corte2: 160 });
        this.tom({ freq: 150, freq2: 60, tipo: 'square', dur: 0.09, vol: 0.22 });
        break;
      case 'hitWall':                     // bateu em pedra
        this.tom({ freq: 420, freq2: 180, tipo: 'triangle', dur: 0.08, vol: 0.16 });
        this.ruido({ dur: 0.07, vol: 0.2, corte: 2600, corte2: 900, tipoFiltro: 'bandpass' });
        break;
      case 'block':                       // bloqueio no escudo
        this.tom({ freq: 900, freq2: 300, tipo: 'square', dur: 0.12, vol: 0.2 });
        this.ruido({ dur: 0.1, vol: 0.25, corte: 4000, corte2: 1200, tipoFiltro: 'bandpass', q: 3 });
        break;
      case 'tiro':                        // escopeta: estouro seco e grave
        this.ruido({ dur: 0.30, vol: 0.85, corte: 2600, corte2: 220, q: 0.7 });
        this.tom({ freq: 130, freq2: 42, tipo: 'square', dur: 0.22, vol: 0.55 });
        this.tom({ freq: 68, freq2: 30, tipo: 'sine', dur: 0.34, vol: 0.5 });
        setTimeout(() => this.ruido({ dur: 0.5, vol: 0.18, corte: 900, corte2: 160 }), 60);
        break;
      case 'recarregar':                  // canos quebrando e fechando
        this.tom({ freq: 320, freq2: 180, tipo: 'square', dur: 0.06, vol: 0.22 });
        setTimeout(() => this.tom({ freq: 210, freq2: 420, tipo: 'square', dur: 0.05, vol: 0.26 }), 190);
        break;
      case 'arcoSolta':                   // corda liberando: estalo seco e o assobio
        this.tom({ freq: 260, freq2: 90, tipo: 'triangle', dur: 0.09, vol: 0.3 });
        this.ruido({ dur: 0.26, vol: 0.22, corte: 1800, corte2: 5200, tipoFiltro: 'bandpass', q: 2.6 });
        break;
      case 'arcoRetesa':                  // couro e madeira sob tensão
        this.ruido({ dur: 0.34, vol: 0.14, corte: 500, corte2: 1500, tipoFiltro: 'bandpass', q: 1.2 });
        this.tom({ freq: 120, freq2: 200, tipo: 'triangle', dur: 0.3, vol: 0.1, ataque: 0.06 });
        break;
      case 'marteloGira':                 // massa cortando o ar, mais grave que a espada
        this.ruido({ dur: 0.3, vol: 0.4, corte: 1400, corte2: 260, tipoFiltro: 'bandpass', q: 1.1 });
        this.tom({ freq: 90, freq2: 44, tipo: 'sine', dur: 0.26, vol: 0.2 });
        break;
      case 'parry':                       // aparou no tempo certo
        this.tom({ freq: 1400, freq2: 2100, tipo: 'triangle', dur: 0.18, vol: 0.3 });
        this.tom({ freq: 2100, tipo: 'sine', dur: 0.3, vol: 0.16, ataque: 0.02 });
        break;
      case 'hurt':                        // jogador levou dano
        this.tom({ freq: 190, freq2: 70, tipo: 'sawtooth', dur: 0.28, vol: 0.3 });
        this.ruido({ dur: 0.2, vol: 0.22, corte: 700, corte2: 120 });
        break;
      case 'die':
        this.tom({ freq: 160, freq2: 38, tipo: 'sawtooth', dur: 1.4, vol: 0.34 });
        this.ruido({ dur: 1.2, vol: 0.2, corte: 500, corte2: 60 });
        break;
      case 'enemyDie':
        this.tom({ freq: 260, freq2: 55, tipo: 'square', dur: 0.42, vol: 0.24 });
        this.ruido({ dur: 0.34, vol: 0.24, corte: 1500, corte2: 140 });
        break;
      case 'enemyAlert':
        this.tom({ freq: 320, freq2: 210, tipo: 'sawtooth', dur: 0.26, vol: 0.16 });
        break;
      case 'pickup':                      // pegou item
        this.tom({ freq: 660, tipo: 'triangle', dur: 0.09, vol: 0.28 });
        setTimeout(() => this.tom({ freq: 990, tipo: 'triangle', dur: 0.14, vol: 0.24 }), 70);
        break;
      case 'gold':
        this.tom({ freq: 1180, tipo: 'sine', dur: 0.07, vol: 0.22 });
        setTimeout(() => this.tom({ freq: 1560, tipo: 'sine', dur: 0.12, vol: 0.18 }), 55);
        break;
      case 'door':
        this.ruido({ dur: 0.7, vol: 0.3, corte: 380, corte2: 120 });
        this.tom({ freq: 90, freq2: 55, tipo: 'sawtooth', dur: 0.6, vol: 0.16 });
        break;
      case 'stairs':                      // desceu de andar
        this.tom({ freq: 300, freq2: 90, tipo: 'sine', dur: 1.1, vol: 0.28 });
        this.ruido({ dur: 1.0, vol: 0.16, corte: 900, corte2: 90 });
        break;
      case 'uiMove':
        this.tom({ freq: 520, tipo: 'square', dur: 0.035, vol: 0.1 });
        break;
      case 'uiPick':
        this.tom({ freq: 300, freq2: 620, tipo: 'triangle', dur: 0.16, vol: 0.22 });
        break;
      case 'uiBack':
        this.tom({ freq: 420, freq2: 200, tipo: 'triangle', dur: 0.14, vol: 0.18 });
        break;
      case 'unlock':
        [523, 659, 784, 1046].forEach((f, i) =>
          setTimeout(() => this.tom({ freq: f, tipo: 'triangle', dur: 0.3, vol: 0.2 }), i * 110));
        break;
      case 'step':
        this.ruido({ dur: 0.07, vol: 0.13, corte: 620, corte2: 190 });
        break;
      case 'armadilhaArma':               // mecanismo destravando sob a placa
        this.tom({ freq: 720, freq2: 420, tipo: 'square', dur: 0.05, vol: 0.16 });
        setTimeout(() => this.tom({ freq: 380, freq2: 240, tipo: 'square', dur: 0.06, vol: 0.14 }), 60);
        break;
      case 'espinhos':                    // os ferros saltando do chão
        this.ruido({ dur: 0.12, vol: 0.4, corte: 5200, corte2: 1400, tipoFiltro: 'bandpass', q: 2.2 });
        this.tom({ freq: 240, freq2: 900, tipo: 'sawtooth', dur: 0.09, vol: 0.22 });
        break;
      case 'armadilhaChama':              // gás escapando antes de acender
        this.ruido({ dur: 0.42, vol: 0.16, corte: 900, corte2: 3400, tipoFiltro: 'bandpass', q: 0.8 });
        break;
      case 'jatoFogo':
        this.ruido({ dur: 0.85, vol: 0.42, corte: 380, corte2: 1900, q: 0.6 });
        this.tom({ freq: 78, freq2: 46, tipo: 'sawtooth', dur: 0.7, vol: 0.22 });
        break;
      case 'mercador':                    // moedas na bancada, acolhedor
        [880, 1170, 1400].forEach((f, i) =>
          setTimeout(() => this.tom({ freq: f, tipo: 'triangle', dur: 0.22, vol: 0.16 }), i * 80));
        break;
      case 'emboscada':                   // portão caindo e a sala acordando
        this.tom({ freq: 110, freq2: 55, tipo: 'sawtooth', dur: 0.9, vol: 0.34 });
        this.ruido({ dur: 0.6, vol: 0.3, corte: 1600, corte2: 200 });
        [0, 90, 180].forEach((ms, i) =>
          setTimeout(() => this.tom({ freq: 300 - i * 60, freq2: 180 - i * 40, tipo: 'square', dur: 0.2, vol: 0.2 }), ms));
        break;
      case 'especialFogo':
        this.ruido({ dur: 0.5, vol: 0.42, corte: 500, corte2: 2600, q: 0.8 });
        this.tom({ freq: 140, freq2: 60, tipo: 'sawtooth', dur: 0.42, vol: 0.3 });
        break;
      case 'especialEstilhaco':
        this.ruido({ dur: 0.22, vol: 0.45, corte: 6000, corte2: 1600, tipoFiltro: 'bandpass', q: 1.6 });
        this.tom({ freq: 900, freq2: 300, tipo: 'square', dur: 0.12, vol: 0.2 });
        break;
      case 'especialSino':
        [520, 780, 1040].forEach((f, k) => setTimeout(() =>
          this.tom({ freq: f, tipo: 'triangle', dur: 0.7, vol: 0.24, ataque: 0.004 }), k * 30));
        this.ruido({ dur: 0.6, vol: 0.24, corte: 3000, corte2: 500 });
        break;
      case 'especialPiscar':
        this.tom({ freq: 1400, freq2: 260, tipo: 'sine', dur: 0.2, vol: 0.26 });
        this.ruido({ dur: 0.24, vol: 0.28, corte: 2200, corte2: 7000, tipoFiltro: 'bandpass', q: 2 });
        break;
      case 'especialDrenar':
        this.tom({ freq: 200, freq2: 720, tipo: 'sawtooth', dur: 0.5, vol: 0.26 });
        this.ruido({ dur: 0.4, vol: 0.2, corte: 900, corte2: 3200, tipoFiltro: 'bandpass' });
        break;
      case 'especialTempestade':
        this.tom({ freq: 70, freq2: 40, tipo: 'sawtooth', dur: 1.4, vol: 0.34 });
        this.ruido({ dur: 1.2, vol: 0.3, corte: 600, corte2: 120 });
        break;
      case 'especialTrovao':
        this.ruido({ dur: 0.34, vol: 0.4, corte: 5200, corte2: 400, tipoFiltro: 'bandpass', q: 0.6 });
        this.tom({ freq: 96, freq2: 44, tipo: 'square', dur: 0.24, vol: 0.24 });
        break;
      case 'trocarArma':                  // pega do chão e engata
        this.tom({ freq: 300, freq2: 620, tipo: 'square', dur: 0.09, vol: 0.2 });
        setTimeout(() => this.ruido({ dur: 0.14, vol: 0.3, corte: 4200, corte2: 1200, tipoFiltro: 'bandpass', q: 2 }), 70);
        setTimeout(() => this.tom({ freq: 880, tipo: 'triangle', dur: 0.22, vol: 0.22 }), 150);
        break;
      case 'portal':                      // atravessar: sopro e queda de tom
        this.tom({ freq: 880, freq2: 160, tipo: 'sine', dur: 1.1, vol: 0.3 });
        this.ruido({ dur: 1.0, vol: 0.26, corte: 5000, corte2: 400, tipoFiltro: 'bandpass', q: 0.9 });
        setTimeout(() => this.tom({ freq: 220, freq2: 660, tipo: 'triangle', dur: 0.6, vol: 0.2 }), 320);
        break;
      case 'fruta':                       // mordida: curto, doce, satisfatório
        this.tom({ freq: 520, freq2: 1180, tipo: 'triangle', dur: 0.14, vol: 0.3 });
        setTimeout(() => this.tom({ freq: 1560, tipo: 'sine', dur: 0.2, vol: 0.2 }), 90);
        break;
      case 'frutaAcabou':
        this.tom({ freq: 700, freq2: 320, tipo: 'triangle', dur: 0.3, vol: 0.16 });
        break;
      case 'dash':                        // arranco: ar rasgando, curto e seco
        this.ruido({ dur: 0.20, vol: 0.34, corte: 900, corte2: 5200, tipoFiltro: 'bandpass', q: 1.1 });
        this.tom({ freq: 330, freq2: 880, tipo: 'triangle', dur: 0.12, vol: 0.16 });
        break;
      case 'dashPronto':                  // uma carga voltou
        this.tom({ freq: 1180, tipo: 'sine', dur: 0.06, vol: 0.09 });
        break;
      case 'slide':                       // raspando o chão
        this.ruido({ dur: 0.55, vol: 0.30, corte: 3000, corte2: 700, tipoFiltro: 'bandpass', q: 0.7 });
        this.tom({ freq: 120, freq2: 70, tipo: 'sawtooth', dur: 0.4, vol: 0.12 });
        break;
      case 'chefeAviso':                  // ele vai fazer alguma coisa
        this.tom({ freq: 180, freq2: 420, tipo: 'sawtooth', dur: 0.3, vol: 0.26 });
        this.ruido({ dur: 0.28, vol: 0.16, corte: 700, corte2: 2600, tipoFiltro: 'bandpass', q: 1.6 });
        break;
      case 'chefeInvestida':
        this.ruido({ dur: 0.5, vol: 0.42, corte: 900, corte2: 180, q: 0.8 });
        this.tom({ freq: 74, freq2: 40, tipo: 'sawtooth', dur: 0.45, vol: 0.32 });
        break;
      case 'chefeOnda':                   // impacto no chão
        this.tom({ freq: 62, freq2: 26, tipo: 'sine', dur: 0.9, vol: 0.6 });
        this.ruido({ dur: 0.7, vol: 0.4, corte: 400, corte2: 70 });
        break;
      case 'chefeSalva':
        [0, 55, 110].forEach((ms, k) => setTimeout(() =>
          this.tom({ freq: 620 - k * 90, freq2: 240, tipo: 'square', dur: 0.14, vol: 0.2 }), ms));
        break;
      case 'chefeInvoca':
        [220, 262, 330, 392].forEach((f, k) => setTimeout(() =>
          this.tom({ freq: f, tipo: 'sawtooth', dur: 0.5, vol: 0.16, ataque: 0.05 }), k * 70));
        break;
      case 'chefeRugido':
        this.tom({ freq: 96, freq2: 52, tipo: 'sawtooth', dur: 1.1, vol: 0.44 });
        this.tom({ freq: 143, freq2: 70, tipo: 'square', dur: 0.9, vol: 0.2, detune: 22 });
        this.ruido({ dur: 1.0, vol: 0.3, corte: 1400, corte2: 260 });
        break;
      case 'chefeFase':                   // virada de fase: ele muda
        [0, 120, 240].forEach((ms, k) => setTimeout(() =>
          this.tom({ freq: 130 + k * 40, freq2: 60, tipo: 'sawtooth', dur: 0.5, vol: 0.32 }), ms));
        this.ruido({ dur: 0.8, vol: 0.28, corte: 5000, corte2: 400, tipoFiltro: 'bandpass' });
        break;
      case 'chefeMorre':
        this.tom({ freq: 120, freq2: 24, tipo: 'sawtooth', dur: 2.4, vol: 0.5 });
        this.ruido({ dur: 2.2, vol: 0.34, corte: 900, corte2: 50 });
        [300, 700, 1200].forEach(ms => setTimeout(() =>
          this.ruido({ dur: 0.5, vol: 0.22, corte: 2200, corte2: 200 }), ms));
        break;
      case 'vitoria':
        [523, 659, 784, 1046, 1318].forEach((f, k) => setTimeout(() =>
          this.tom({ freq: f, tipo: 'triangle', dur: 0.9, vol: 0.24, ataque: 0.02 }), k * 150));
        break;
      case 'lodo':                        // chiado do ácido na armadura
        this.ruido({ dur: 0.5, vol: 0.2, corte: 3800, corte2: 1100, tipoFiltro: 'highpass', q: 0.9 });
        break;
    }
  },

  // ---------- música ----------
  // Sequência lenta em escala menor harmônica, com um drone grave por baixo.
  iniciarMusica(profundidade = 0) {
    if (!this.ctx || this.musicaAtiva) return;
    this.musicaAtiva = true;
    this._passo = 0;

    // Drone contínuo
    const t0 = this.ctx.currentTime;
    this._drone = this.ctx.createOscillator();
    this._drone.type = 'sawtooth';
    this._drone.frequency.value = 55 - Math.min(14, profundidade);
    const df = this.ctx.createBiquadFilter();
    df.type = 'lowpass'; df.frequency.value = 180;
    this._droneGain = this.ctx.createGain();
    this._droneGain.gain.setValueAtTime(0.0001, t0);
    this._droneGain.gain.exponentialRampToValueAtTime(0.14, t0 + 3);
    this._drone.connect(df); df.connect(this._droneGain); this._droneGain.connect(this.gMusic);
    this._drone.start();

    const escala = [0, 2, 3, 5, 7, 8, 11];          // menor harmônica
    const base = 220;
    const tick = () => {
      if (!this.musicaAtiva) return;
      const p = this._passo++;
      if (p % 4 === 0) {
        const grau = escala[(Math.random() * escala.length) | 0];
        const oitava = Math.random() < 0.3 ? 0.5 : 1;
        const freq = base * oitava * Math.pow(2, grau / 12);
        this.tom({ freq, tipo: 'triangle', dur: 1.6, ataque: 0.35, vol: 0.13, dest: this.gMusic });
      }
      if (p % 16 === 8) {
        this.ruido({ dur: 1.4, vol: 0.07, corte: 300, corte2: 90, dest: this.gMusic });
      }
      this._timerMusica = setTimeout(tick, 460);
    };
    tick();
  },

  // ---------- música de chefe ----------
  // Sai da mesma síntese, mas nada aqui se parece com a música de
  // exploração: lá é drone lento e nota solta; aqui é riff com palm
  // mute, power chord (fundamental + quinta), bumbo duplo e prato.
  //
  // A SEMENTE do chefe escolhe o riff, o tom e o andamento — então a
  // trilha do chefe desta run não é a mesma da anterior, pelo mesmo
  // motivo que o bicho não é.
  iniciarMusicaChefe(semente = 1, nomeParaTom = '') {
    if (!this.ctx) return;
    this.pararMusica();
    this.musicaAtiva = true;
    this.chefeAtivo = true;
    this._passo = 0;

    let s = (semente >>> 0) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    // tônica grave: E, F, F#, G, A ou B — todas em região de guitarra baixa
    const tonicas = [41.2, 43.7, 46.2, 49.0, 55.0, 61.7];
    const tonica = tonicas[(rnd() * tonicas.length) | 0];
    const bpm = 132 + Math.floor(rnd() * 44);          // 132 a 176
    const semicolcheia = 60 / bpm / 4;

    // riffs em graus da escala frígia dominante (o "tom mau" clássico)
    const riffs = [
      [0, 0, 1, 0, 0, 3, 0, 1, 0, 0, 5, 0, 4, 3, 1, 0],
      [0, 0, 0, 3, 0, 0, 1, 0, 0, 0, 5, 3, 0, 1, 0, 0],
      [0, 5, 0, 4, 0, 3, 0, 1, 0, 5, 0, 4, 3, 1, 0, 0],
      [0, 0, 1, 1, 0, 0, 3, 3, 0, 0, 4, 4, 5, 3, 1, 0],
      [0, 3, 1, 0, 5, 0, 3, 1, 0, 4, 0, 3, 1, 0, 1, 3],
    ];
    const riff = riffs[(rnd() * riffs.length) | 0];
    const semitons = [0, 1, 4, 5, 7, 8, 11];           // frígia dominante
    const acentos = riff.map(() => rnd() < 0.34);
    this._riffChefe = { riff, tonica, semitons, acentos, semicolcheia };

    // distorção: waveshaper simples, é o que separa "guitarra" de "beep"
    const curva = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const v = (i / 512) - 1;
      curva[i] = Math.tanh(v * 5.5);
    }
    this._dist = this.ctx.createWaveShaper();
    this._dist.curve = curva;
    this._dist.oversample = '2x';
    const corpo = this.ctx.createBiquadFilter();
    corpo.type = 'lowpass'; corpo.frequency.value = 2600;
    this._distGain = this.ctx.createGain();
    this._distGain.gain.value = 0.26;
    this._dist.connect(corpo); corpo.connect(this._distGain);
    this._distGain.connect(this.gMusic);

    let i = 0;
    const tick = () => {
      if (!this.musicaAtiva || !this.chefeAtivo) return;
      const t0 = this.ctx.currentTime;
      const grau = riff[i % riff.length];
      const freq = tonica * Math.pow(2, semitons[grau % semitons.length] / 12);
      const forte = acentos[i % acentos.length];

      // power chord: fundamental + quinta justa
      for (const mult of [1, 1.4983]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq * mult, t0);
        const g = this.ctx.createGain();
        const pico = forte ? 0.5 : 0.26;
        const dur = forte ? semicolcheia * 2.4 : semicolcheia * 0.85;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(pico, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this._dist);
        o.start(t0); o.stop(t0 + dur + 0.02);
      }

      // bumbo duplo em cada semicolcheia, caixa no 2 e no 4
      const bumbo = this.ctx.createOscillator();
      bumbo.type = 'sine';
      bumbo.frequency.setValueAtTime(115, t0);
      bumbo.frequency.exponentialRampToValueAtTime(38, t0 + 0.07);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.55, t0);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
      bumbo.connect(bg); bg.connect(this.gMusic);
      bumbo.start(t0); bumbo.stop(t0 + 0.12);

      if (i % 8 === 4) {
        this.ruido({ dur: 0.16, vol: 0.34, corte: 2400, corte2: 900, tipoFiltro: 'bandpass', q: 0.8, dest: this.gMusic });
      }
      if (i % 16 === 0) {
        this.ruido({ dur: 0.5, vol: 0.16, corte: 7000, tipoFiltro: 'highpass', dest: this.gMusic });
      }

      i++;
      this._timerMusica = setTimeout(tick, semicolcheia * 1000);
    };
    tick();
  },

  /** Fase 2/3 do chefe: sobe o ganho da distorção — a luta fica mais suja. */
  intensificarMusicaChefe(fase) {
    if (!this._distGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._distGain.gain.cancelScheduledValues(t);
    this._distGain.gain.setValueAtTime(this._distGain.gain.value, t);
    this._distGain.gain.linearRampToValueAtTime(0.26 + (fase - 1) * 0.13, t + 1.2);
  },

  pararMusica() {
    this.chefeAtivo = false;
    if (this._distGain) {
      try {
        const t = this.ctx.currentTime;
        this._distGain.gain.cancelScheduledValues(t);
        this._distGain.gain.setValueAtTime(this._distGain.gain.value, t);
        this._distGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      } catch (e) { /* já parado */ }
      this._distGain = null;
      this._dist = null;
    }
    this._pararExploracao();
  },

  _pararExploracao() {
    this.musicaAtiva = false;
    clearTimeout(this._timerMusica);
    if (this._drone) {
      try {
        const t = this.ctx.currentTime;
        this._droneGain.gain.cancelScheduledValues(t);
        this._droneGain.gain.setValueAtTime(this._droneGain.gain.value, t);
        this._droneGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        this._drone.stop(t + 1.4);
      } catch (e) { /* já parado */ }
      this._drone = null;
    }
  },
};
