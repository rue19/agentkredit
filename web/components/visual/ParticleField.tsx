"use client";

import { useEffect, useRef } from "react";

/*
  The hero's flowing particle field.

  Hand-written Canvas 2D — no three.js, no shader library, no dependency.
  The form is a set of sweeping filament ribbons: each ribbon is a curve
  whose points are scattered across its own width, brightest at the core,
  in the two hues sampled from the reference (a cool steel blue and a warm
  amber). Points are accumulated additively into an ImageData buffer, then
  a two-octave bloom is composited over the top.

  The A mark is deliberately absent — the brand mark lives in the navbar only.
*/

const COOL: [number, number, number] = [118, 178, 255];
const WARM: [number, number, number] = [255, 183, 104];

type Ribbon = {
  cy: number; // vertical centre, fraction of height
  a1: number; // primary amplitude, fraction of height
  k1: number; // primary wavelength
  a2: number; // secondary amplitude
  k2: number;
  phase: number;
  speed: number;
  band: number; // ribbon thickness, fraction of height
  warm: number; // 0 = cool, 1 = warm
  gain: number; // overall brightness
};

const RIBBONS: Ribbon[] = [
  { cy: 0.1, a1: 0.16, k1: 0.85, a2: 0.05, k2: 2.3, phase: 0.4, speed: 0.075, band: 0.03, warm: 0.05, gain: 1.15 },
  { cy: 0.26, a1: 0.2, k1: 0.62, a2: 0.06, k2: 1.8, phase: 2.4, speed: -0.055, band: 0.045, warm: 0.75, gain: 0.85 },
  { cy: 0.42, a1: 0.14, k1: 1.1, a2: 0.045, k2: 2.7, phase: 4.1, speed: 0.09, band: 0.026, warm: 0.1, gain: 0.95 },
  { cy: 0.6, a1: 0.22, k1: 0.55, a2: 0.07, k2: 1.5, phase: 1.1, speed: 0.048, band: 0.062, warm: 0.5, gain: 1.35 },
  { cy: 0.74, a1: 0.17, k1: 0.78, a2: 0.055, k2: 2.1, phase: 5.4, speed: -0.068, band: 0.048, warm: 0.92, gain: 1.25 },
  { cy: 0.9, a1: 0.15, k1: 0.5, a2: 0.07, k2: 1.35, phase: 3.2, speed: 0.04, band: 0.055, warm: 0.28, gain: 0.8 },
  { cy: 0.18, a1: 0.13, k1: 1.4, a2: 0.04, k2: 3.2, phase: 1.7, speed: -0.1, band: 0.02, warm: 0.35, gain: 0.6 },
  { cy: 0.5, a1: 0.19, k1: 0.7, a2: 0.06, k2: 1.65, phase: 5.9, speed: -0.042, band: 0.034, warm: 0.82, gain: 0.75 },
  { cy: 0.67, a1: 0.12, k1: 1.25, a2: 0.038, k2: 2.85, phase: 0.9, speed: 0.105, band: 0.022, warm: 0.12, gain: 0.7 },
  { cy: 0.83, a1: 0.2, k1: 0.6, a2: 0.065, k2: 1.55, phase: 4.6, speed: 0.058, band: 0.05, warm: 0.68, gain: 0.9 },
];

const TAU = Math.PI * 2;

/* Deterministic per-point hash so the "dust" pattern is stable frame to frame. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Offscreen buffers: full-res accumulation, plus two bloom octaves.
    const acc = document.createElement("canvas");
    const accCtx = acc.getContext("2d", { alpha: true });
    const b1 = document.createElement("canvas");
    const b1Ctx = b1.getContext("2d", { alpha: true });
    const b2 = document.createElement("canvas");
    const b2Ctx = b2.getContext("2d", { alpha: true });
    if (!accCtx || !b1Ctx || !b2Ctx) return;

    let w = 0;
    let h = 0;
    let img: ImageData | null = null;
    let data: Uint8ClampedArray | null = null;
    let dirty = new Int32Array(0);
    let dirtyCount = 0;
    let samples = 0;
    let cross = 0;
    let raf = 0;
    let running = false;
    let t = 0;
    let disposed = false;

    const supportsFilter = typeof ctx.filter === "string";

    function resize() {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      /*
        The field is soft, bloomed atmosphere, so it is accumulated at a
        capped internal resolution and upscaled by the compositor. That keeps
        the per-frame ImageData work bounded no matter how large the layer is,
        and costs nothing visible.
      */
      const MAX_EDGE = 900;
      const scale = Math.min(1, MAX_EDGE / Math.max(rect.width, rect.height));
      w = Math.max(2, Math.round(rect.width * scale));
      h = Math.max(2, Math.round(rect.height * scale));

      canvasEl.width = w;
      canvasEl.height = h;
      acc.width = w;
      acc.height = h;
      b1.width = Math.max(2, w >> 2);
      b1.height = Math.max(2, h >> 2);
      b2.width = Math.max(2, w >> 3);
      b2.height = Math.max(2, h >> 3);

      img = accCtx!.createImageData(w, h);
      data = img.data;

      // Point budget scales with area and stays bounded on small screens.
      const area = w * h;
      const density = Math.min(1, Math.max(0.34, area / (900 * 660)));
      samples = Math.round(480 * density);
      cross = Math.max(4, Math.round(6 * density));

      dirty = new Int32Array(RIBBONS.length * samples * cross + 700);
      dirtyCount = 0;
      draw();
    }

    function plot(x: number, y: number, r: number, g: number, b: number, a: number) {
      const xi = x | 0;
      const yi = y | 0;
      if (xi < 0 || xi >= w || yi < 0 || yi >= h) return;
      const i = (yi * w + xi) << 2;
      const d = data!;
      d[i] += r * a;
      d[i + 1] += g * a;
      d[i + 2] += b * a;
      d[i + 3] = 255;
      dirty[dirtyCount++] = i;
    }

    function draw() {
      if (!data || !img) return;

      // Clear only what the previous frame touched.
      const d = data;
      for (let n = 0; n < dirtyCount; n++) {
        const i = dirty[n];
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      }
      dirtyCount = 0;

      // --- ambient dust ---
      const dust = Math.round(samples * 1.4);
      for (let i = 0; i < dust; i++) {
        const hx = hash(i * 1.37);
        const hy = hash(i * 2.71 + 11);
        const drift = reduced ? 0 : Math.sin(t * 0.15 + i) * 0.004;
        const a = (0.04 + hash(i * 3.13 + 5) * 0.13) * (0.3 + 0.7 * hx);
        plot((hx + drift) * w, hy * h, 226, 224, 218, a);
      }

      // --- ribbons ---
      for (let rI = 0; rI < RIBBONS.length; rI++) {
        const rb = RIBBONS[rI];
        const cr = COOL[0] + (WARM[0] - COOL[0]) * rb.warm;
        const cg = COOL[1] + (WARM[1] - COOL[1]) * rb.warm;
        const cb = COOL[2] + (WARM[2] - COOL[2]) * rb.warm;

        for (let i = 0; i < samples; i++) {
          const u = i / (samples - 1);
          const x = (-0.12 + 1.24 * u) * w;

          const p = rb.phase + t * rb.speed;
          const y0 =
            rb.cy * h +
            rb.a1 * h * Math.sin(k(rb.k1) * u + p) +
            rb.a2 * h * Math.sin(k(rb.k2) * u - p * 1.7);

          // Crest highlight: brighten where the curve flattens out.
          const slope =
            rb.a1 * rb.k1 * Math.cos(k(rb.k1) * u + p) +
            rb.a2 * rb.k2 * Math.cos(k(rb.k2) * u - p * 1.7);
          const ridge = 1 / (1 + Math.abs(slope) * 2.2);

          // Ribbons breathe in and out along their length.
          const envelope =
            0.35 +
            0.65 * Math.max(0, Math.sin(u * 3.1 + rb.phase * 1.7 + t * 0.08));
          const thickness =
            rb.band * h * (0.5 + 0.5 * Math.sin(u * 7.3 + rb.phase + t * 0.12));

          // Brighter toward the right of the layer, as in the reference.
          const spatial = 0.3 + 0.7 * Math.min(1, Math.max(0, (u - 0.08) / 0.8));

          for (let j = 0; j < cross; j++) {
            const seed = rI * 7919 + i * 131 + j;
            if (hash(seed) < 0.22) continue; // dusty, not solid

            // Shaped across the band so points crowd the filament's core.
            const lin = (j + hash(seed + 3.7)) / cross - 0.5;
            const sp = Math.sign(lin) * Math.pow(Math.abs(lin) * 2, 1.7);
            const y = y0 + sp * thickness;

            const core = 1 - Math.min(1, Math.abs(sp));
            const a =
              rb.gain *
              envelope *
              spatial *
              (0.06 + 0.94 * core * core) *
              (0.3 + 0.7 * ridge) *
              1.5;

            // Only the hottest crest cores burn out toward white.
            const burn = Math.min(1, Math.max(0, core * ridge - 0.55) * 2.4);
            plot(
              x,
              y,
              cr + (255 - cr) * burn,
              cg + (255 - cg) * burn,
              cb + (255 - cb) * burn,
              a,
            );
          }
        }
      }

      accCtx!.putImageData(img, 0, 0);

      // --- composite: crisp pass, then two bloom octaves ---
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
      ctx!.drawImage(acc, 0, 0);

      /*
        Bloom is blurred while the image is small — a blur on a quarter-size
        buffer costs a sixteenth of the same blur at full size — then blitted
        back up unfiltered.
      */
      b2Ctx!.clearRect(0, 0, b2.width, b2.height);
      b2Ctx!.drawImage(acc, 0, 0, b2.width, b2.height);
      b1Ctx!.clearRect(0, 0, b1.width, b1.height);
      if (supportsFilter) b1Ctx!.filter = "blur(1.6px)";
      b1Ctx!.drawImage(b2, 0, 0, b1.width, b1.height);
      if (supportsFilter) b1Ctx!.filter = "none";

      ctx!.globalCompositeOperation = "lighter";
      ctx!.globalAlpha = 0.75;
      ctx!.drawImage(b2, 0, 0, w, h);
      ctx!.globalAlpha = 0.6;
      ctx!.drawImage(b1, 0, 0, w, h);
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
    }

    function k(v: number) {
      return v * TAU;
    }

    function loop() {
      if (disposed) return;
      t += 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduced || disposed) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(
      (entries) => (entries[0].isIntersecting ? start() : stop()),
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVisibility = () =>
      document.visibilityState === "visible" ? start() : stop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      stop();
      clearTimeout(resizeTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /*
    The canvas sits inside a positioned wrapper: as a replaced element it
    resolves `width: auto` from its 300x150 intrinsic size rather than from
    its insets, so the wrapper owns the geometry and the canvas just fills it.
  */
  return (
    <div className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
