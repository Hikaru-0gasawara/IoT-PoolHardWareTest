import { useEffect, useRef } from "react";
import { isMotionReduced } from "@/hooks/useReducedMotion";

interface KineticBackgroundProps {
  /** Densidade de linhas. Maior = mais cheio (intro) */
  density?: number;
  /** Opacidade global do canvas (0–1) */
  opacity?: number;
  className?: string;
}

// Fundo cinético inspirado no estilo aten7.com: feixes de linhas finas e curvas
// que fluem por um campo de ruído (flow-field), sobre fundo escuro. Mantém a
// paleta AquaSense (ciano/azul) lendo as cores via CSS custom properties, então
// respeita tema claro/escuro automaticamente. Respeita "reduzir movimento":
// quando ativo, desenha um quadro estático sem animar.
export function KineticBackground({
  density = 1,
  opacity = 0.5,
  className,
}: KineticBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctxRaw = canvasEl.getContext("2d");
    if (!ctxRaw) return;
    const canvas = canvasEl;
    const ctx = ctxRaw;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Lê cores da paleta para casar com o tema atual.
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--aqua-accent").trim() || "oklch(0.76 0.16 220)";
    const secondary = styles.getPropertyValue("--aqua-secondary").trim() || "oklch(0.55 0.09 220)";
    const palette = [accent, secondary, accent];

    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; width: number };
    let particles: P[] = [];

    type Ring = { x: number; y: number; r: number; maxR: number; alpha: number };
    let rings: Ring[] = [];
    let ringTimer = 0;
    const RING_INTERVAL = 220; // frames (~3.6s at 60fps)

    const COUNT = Math.round(70 * density);

    function rand(min: number, max: number) {
      return min + Math.random() * (max - min);
    }

    function spawn(): P {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(0.15, 0.6);
      return {
        x: rand(0, w),
        y: rand(0, h),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        max: rand(180, 520),
        color: palette[Math.floor(Math.random() * palette.length)],
        width: rand(0.3, 0.9),
      };
    }

    function spawnRing() {
      rings.push({ x: w / 2, y: h / 2, r: 0, maxR: Math.min(w, h) * 0.55, alpha: 0.55 });
    }

    // Campo de fluxo baseado em senos — cria as curvas suaves características.
    function flow(x: number, y: number, t: number) {
      const s = 0.0016;
      return (
        Math.sin(x * s + t * 0.0003) * 1.2 +
        Math.cos(y * s - t * 0.0002) * 1.2 +
        Math.sin((x + y) * s * 0.6) * 0.8
      );
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: COUNT }, spawn);
    }

    function step(t: number) {
      // Trilha: limpa parcialmente para criar rastro fino e elegante.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      // Sonar rings — pulse from center, fade as they expand.
      ringTimer++;
      if (ringTimer >= RING_INTERVAL) { ringTimer = 0; spawnRing(); }
      rings = rings.filter(ring => {
        ring.r += (ring.maxR - ring.r) * 0.04; // ease-out expansion
        ring.alpha *= 0.965;
        if (ring.alpha < 0.008) return false;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = ring.alpha;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Outer glow ring (wider, softer)
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.globalAlpha = ring.alpha * 0.35;
        ctx.lineWidth = 3;
        ctx.stroke();
        return true;
      });

      // Flow-field particles
      for (const p of particles) {
        const a = flow(p.x, p.y, t);
        p.vx += Math.cos(a * Math.PI) * 0.04;
        p.vy += Math.sin(a * Math.PI) * 0.04;
        // amortece para manter velocidade controlada
        p.vx *= 0.96;
        p.vy *= 0.96;

        const nx = p.x + p.vx;
        const ny = p.y + p.vy;

        const fade = Math.sin((p.life / p.max) * Math.PI); // entra e sai suave
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = Math.max(0, fade) * 0.55;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        p.x = nx;
        p.y = ny;
        p.life += 1;

        if (
          p.life > p.max ||
          p.x < -50 || p.x > w + 50 ||
          p.y < -50 || p.y > h + 50
        ) {
          Object.assign(p, spawn());
          p.life = 0;
        }
      }
      ctx.globalAlpha = 1;
    }

    resize();
    spawnRing(); // immediate first pulse on mount

    if (isMotionReduced()) {
      // Quadro estático: roda alguns passos sem requestAnimationFrame.
      for (let i = 0; i < 120; i++) step(i * 16);
      return () => {};
    }

    const loop = (t: number) => {
      step(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [density]);

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
