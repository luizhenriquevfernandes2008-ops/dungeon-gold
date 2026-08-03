// ============================================================
// Pipeline de imagem.
//
// A cena 3D é renderizada num alvo de baixa resolução (256 a
// 512px de largura) e só depois é ampliada para a tela com
// filtro NEAREST. É esse passo que dá o pixel de verdade —
// não é um filtro por cima de uma imagem lisa.
//
// No caminho de volta aplico:
//   1. quantização de cor (paleta reduzida)
//   2. pontilhado ordenado 4x4 (Bayer) antes de quantizar,
//      que é o que impede o banding feio nos degradês da névoa
//   3. leve realce quente nas altas luzes (cor de tocha)
//   4. vinheta e linhas de varredura opcionais
// ============================================================

import * as THREE from 'three';
import { Settings, LARGURA_QUALIDADE } from '../core/settings.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
precision mediump float;
uniform sampler2D tDiffuse;
uniform vec2  uRes;
uniform float uDither;
uniform float uScan;
uniform float uNiveis;
uniform float uTempo;
uniform float uDano;
uniform float uBrilho;
varying vec2 vUv;

float limiarBayer(vec2 p){
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  if(i== 0) return  0.0/16.0;  if(i== 1) return  8.0/16.0;
  if(i== 2) return  2.0/16.0;  if(i== 3) return 10.0/16.0;
  if(i== 4) return 12.0/16.0;  if(i== 5) return  4.0/16.0;
  if(i== 6) return 14.0/16.0;  if(i== 7) return  6.0/16.0;
  if(i== 8) return  3.0/16.0;  if(i== 9) return 11.0/16.0;
  if(i==10) return  1.0/16.0;  if(i==11) return  9.0/16.0;
  if(i==12) return 15.0/16.0;  if(i==13) return  7.0/16.0;
  if(i==14) return 13.0/16.0;
  return 5.0/16.0;
}

void main(){
  vec2 px = vUv * uRes;
  vec3 cor = texture2D(tDiffuse, vUv).rgb;

  // brilho: curva de gama. Levanta as sombras sem estourar o que já
  // está claro — subir a exposição linear só lavaria a imagem inteira.
  cor = pow(clamp(cor, 0.0, 1.0), vec3(1.0 / max(0.3, uBrilho)));

  // realce quente: o que já está claro puxa para a cor do fogo
  float luz = dot(cor, vec3(0.299, 0.587, 0.114));
  cor = mix(cor, cor * vec3(1.12, 0.98, 0.82), smoothstep(0.35, 0.95, luz));

  // pontilhado + quantização
  float d = (limiarBayer(px) - 0.5) / uNiveis;
  cor += d * uDither;
  cor = floor(cor * uNiveis + 0.5) / uNiveis;

  // pulso vermelho ao levar dano
  cor = mix(cor, vec3(0.62, 0.06, 0.05), uDano * 0.55);

  // linhas de varredura
  if(uScan > 0.5){
    float s = mod(px.y, 2.0) < 1.0 ? 0.90 : 1.0;
    cor *= s;
  }

  // vinheta
  vec2 v = vUv - 0.5;
  float vig = 1.0 - dot(v, v) * (0.95 / max(0.6, uBrilho));
  cor *= clamp(vig, 0.0, 1.0);

  gl_FragColor = vec4(cor, 1.0);
}`;

export class RenderizadorPixel {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);

    this.alvo = new THREE.WebGLRenderTarget(320, 200, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.alvo.texture },
        uRes: { value: new THREE.Vector2(320, 200) },
        uDither: { value: 1 },
        uScan: { value: 1 },
        uNiveis: { value: 24 },
        uTempo: { value: 0 },
        uDano: { value: 0 },
        uBrilho: { value: 1.15 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.cenaQuad = new THREE.Scene();
    this.cenaQuad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.aplicarConfig();
    this.redimensionar();
    addEventListener('resize', () => this.redimensionar());
    Settings.aoMudar(() => { this.aplicarConfig(); this.redimensionar(); });
  }

  aplicarConfig() {
    const d = Settings.data;
    this.larguraBase = LARGURA_QUALIDADE[d.quality] ?? 384;
    this.material.uniforms.uDither.value = d.dither ? 1 : 0;
    this.material.uniforms.uScan.value = d.scanlines ? 1 : 0;
    this.material.uniforms.uNiveis.value = d.quality === 'high' ? 32 : 22;
    this.material.uniforms.uBrilho.value = (d.brilho ?? 115) / 100;
  }

  redimensionar() {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    this.renderer.setSize(w, h, false);

    const alt = Math.max(1, Math.round(this.larguraBase * h / w));
    this.alvo.setSize(this.larguraBase, alt);
    this.material.uniforms.uRes.value.set(this.larguraBase, alt);
    this.aspecto = w / h;
    if (this.aoRedimensionar) this.aoRedimensionar(this.aspecto);
  }

  set flashDano(v) { this.material.uniforms.uDano.value = v; }
  get flashDano() { return this.material.uniforms.uDano.value; }

  /**
   * @param {THREE.Scene} cena cena do mundo
   * @param {THREE.Camera} camera câmera do mundo
   * @param {THREE.Scene} [cenaFrente] cena da arma em primeira pessoa
   * @param {THREE.Camera} [camFrente] câmera ortográfica da arma
   */
  renderizar(cena, camera, cenaFrente, camFrente, tempo = 0) {
    const r = this.renderer;
    this.material.uniforms.uTempo.value = tempo;

    r.setRenderTarget(this.alvo);
    r.clear(true, true, true);
    r.render(cena, camera);

    if (cenaFrente && camFrente) {
      r.clearDepth();
      r.render(cenaFrente, camFrente);
    }

    r.setRenderTarget(null);
    r.clear(true, true, true);
    r.render(this.cenaQuad, this.camQuad);
  }
}
