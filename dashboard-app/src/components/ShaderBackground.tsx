import { useEffect, useRef } from "react";
import { isMotionReduced } from "@/hooks/useReducedMotion";

// Fundo "shader" inspirado no shader.se: um campo de gradiente orgânico que
// "respira" (domain-warped fbm) na paleta da marca (grafite → verde-menta),
// com film grain sutil sobreposto — a textura de "fita 80s" característica.
// Implementação em WebGL puro (sem Three.js / dependências novas). Lê o tema
// atual (claro/escuro) para casar a paleta. Respeita "reduzir movimento":
// renderiza um único quadro estático. Se WebGL não estiver disponível, o canvas
// fica transparente e o fundo sólido do app aparece normalmente.

interface Props {
  /** Opacidade global do canvas (0–1) */
  opacity?: number;
  className?: string;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;
uniform vec3 uMid;
uniform vec3 uAccent;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv * 3.0;
  p.x *= uRes.x / uRes.y;
  float t = uTime * 0.05;

  // Domain warping — duas iterações criam o fluxo orgânico "respirando".
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.5),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.5)
  );
  float f = clamp(fbm(p + 4.0 * r) * 1.1, 0.0, 1.0);

  vec3 col = mix(uBg, uMid, smoothstep(0.2, 0.7, f));
  col = mix(col, uAccent, smoothstep(0.62, 1.0, f) * 0.45);

  // Vinheta — escurece (escuro) / clareia (claro) suavemente nas bordas.
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  col *= mix(0.82, 1.0, vig);

  // Film grain — hash por pixel/quadro, a assinatura "fita".
  float g = hash(gl_FragCoord.xy + fract(uTime) * vec2(13.0, 7.0));
  col += (g - 0.5) * 0.05;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Paletas aproximadas (sRGB lineares-ish) casando os tokens oklch da marca.
const PALETTE = {
  dark: {
    bg: [0.086, 0.098, 0.09] as const,
    mid: [0.14, 0.16, 0.148] as const,
    accent: [0.42, 0.82, 0.6] as const,
  },
  light: {
    bg: [0.965, 0.972, 0.965] as const,
    mid: [0.9, 0.93, 0.91] as const,
    accent: [0.4, 0.68, 0.52] as const,
  },
};

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function ShaderBackground({ opacity = 0.6, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { antialias: false, alpha: true }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // sem WebGL → canvas transparente, fundo sólido aparece

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // Triângulo fullscreen — cobre a tela com um único triângulo.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uBg = gl.getUniformLocation(prog, "uBg");
    const uMid = gl.getUniformLocation(prog, "uMid");
    const uAccent = gl.getUniformLocation(prog, "uAccent");

    function applyPalette() {
      const light = document.documentElement.classList.contains("light");
      const pal = light ? PALETTE.light : PALETTE.dark;
      gl!.uniform3fv(uBg, pal.bg as unknown as number[]);
      gl!.uniform3fv(uMid, pal.mid as unknown as number[]);
      gl!.uniform3fv(uAccent, pal.accent as unknown as number[]);
    }

    let w = 0;
    let h = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // grain barato
      const rect = canvas!.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width * dpr));
      h = Math.max(1, Math.floor(rect.height * dpr));
      canvas!.width = w;
      canvas!.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uRes, w, h);
    }

    resize();
    applyPalette();

    // Reage à troca de tema (classe .light no <html>).
    const themeObs = new MutationObserver(applyPalette);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let raf = 0;
    const t0 = performance.now();

    function render(now: number) {
      gl!.uniform1f(uTime, (now - t0) / 1000);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    if (isMotionReduced()) {
      render(t0); // quadro estático
      themeObs.disconnect();
      return () => {};
    }

    const loop = (now: number) => {
      render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      themeObs.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}
