// ============================================================
// Entrada — teclado, mouse e Pointer Lock.
// ============================================================

export const Input = {
  teclas: Object.create(null),
  apertadaAgora: Object.create(null),   // só verdadeiro no frame em que a tecla desceu
  mouseDX: 0,
  mouseDY: 0,
  botao: [false, false, false],
  botaoAgora: [false, false, false],
  travado: false,
  alvo: null,
  aoTravar: null,
  aoDestravar: null,

  iniciar(canvas) {
    this.alvo = canvas;

    addEventListener('keydown', e => {
      // Evita a página rolar com espaço / setas
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
      const k = e.code;
      if (!this.teclas[k]) this.apertadaAgora[k] = true;
      this.teclas[k] = true;
    });

    addEventListener('keyup', e => { this.teclas[e.code] = false; });

    addEventListener('blur', () => {
      this.teclas = Object.create(null);
      this.botao = [false, false, false];
    });

    canvas.addEventListener('mousedown', e => {
      if (!this.travado) return;
      if (!this.botao[e.button]) this.botaoAgora[e.button] = true;
      this.botao[e.button] = true;
    });
    addEventListener('mouseup', e => { this.botao[e.button] = false; });
    canvas.addEventListener('contextmenu', e => { if (this.travado) e.preventDefault(); });

    addEventListener('mousemove', e => {
      if (!this.travado) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.travado = document.pointerLockElement === canvas;
      this.mouseDX = this.mouseDY = 0;
      if (this.travado) this.aoTravar && this.aoTravar();
      else this.aoDestravar && this.aoDestravar();
    });

    document.addEventListener('pointerlockerror', () => {
      console.warn('[input] pointer lock recusado pelo navegador');
    });
  },

  travar() {
    if (!this.alvo || this.travado) return;
    const p = this.alvo.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  },

  destravar() {
    if (document.pointerLockElement) document.exitPointerLock();
  },

  // Chamado ao final de cada frame para limpar os estados "deste frame".
  limparFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.apertadaAgora = Object.create(null);
    this.botaoAgora = [false, false, false];
  },

  pressionada(...codigos) { return codigos.some(c => !!this.teclas[c]); },
  apertou(...codigos) { return codigos.some(c => !!this.apertadaAgora[c]); },
};
