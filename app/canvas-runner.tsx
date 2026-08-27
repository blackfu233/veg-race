"use client";

import { useEffect, useRef } from "react";

export type RunnerRoleId =
  | "potato"
  | "chili"
  | "pumpkin"
  | "tomato"
  | "okra"
  | "peapod"
  | "corn"
  | "scallion"
  | "mushroom"
  | "peanut";

const SOURCE_FRAME_SIZE = 384;
const DRAW_SIZE = 192;
const RUN_FRAME_COUNT = 4;
const RUN_FRAME_MS = 92;
const spriteCache = new Map<string, Promise<HTMLImageElement>>();

function loadSprite(source: string) {
  const cached = spriteCache.get(source);
  if (cached) return cached;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = (error) => {
      spriteCache.delete(source);
      reject(error);
    };
    image.src = source;
  });
  spriteCache.set(source, request);
  return request;
}

export default function CanvasRunner({
  roleId,
  label,
  back = false,
  active = false,
  phaseOffset = 0,
}: {
  roleId: RunnerRoleId;
  label?: string;
  back?: boolean;
  active?: boolean;
  phaseOffset?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = DRAW_SIZE * ratio;
    canvas.height = DRAW_SIZE * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    let cancelled = false;
    let animationFrame = 0;
    let lastPaintedFrame = -1;

    Promise.all([
      loadSprite(`/runner-sprites/${roleId}-ready.webp?v=3`),
      loadSprite(`/runner-sprites/${roleId}-run.webp?v=3`),
    ])
      .then(([readySprite, runSprite]) => {
        const paint = (frame: number) => {
          context.clearRect(0, 0, DRAW_SIZE, DRAW_SIZE);
          if (back) {
            context.drawImage(
              runSprite,
              frame * SOURCE_FRAME_SIZE,
              0,
              SOURCE_FRAME_SIZE,
              SOURCE_FRAME_SIZE,
              0,
              0,
              DRAW_SIZE,
              DRAW_SIZE,
            );
          } else {
            context.drawImage(readySprite, 0, 0, DRAW_SIZE, DRAW_SIZE);
          }
        };

        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (!active || prefersReducedMotion) {
          if (!cancelled) paint(0);
          return;
        }

        const draw = (time: number) => {
          if (cancelled) return;
          const frameIndex = Math.floor((time + phaseOffset) / RUN_FRAME_MS) % RUN_FRAME_COUNT;
          if (frameIndex !== lastPaintedFrame) {
            paint(frameIndex);
            lastPaintedFrame = frameIndex;
          }
          animationFrame = requestAnimationFrame(draw);
        };
        animationFrame = requestAnimationFrame(draw);
      })
      .catch(() => {
        context.clearRect(0, 0, DRAW_SIZE, DRAW_SIZE);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [active, back, phaseOffset, roleId]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas-runner"
      role="img"
      aria-label={`${label ?? roleId} ${active ? "跑步中" : "準備中"}`}
    />
  );
}
