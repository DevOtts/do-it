import React from 'react';
import {Img, interpolate, staticFile} from 'remotion';

// The source GIF is 21 frames at 10 fps. The composition runs at 30 fps, so each
// source frame holds for 3 composition frames. Frames are RGBA PNGs with the
// green screen already keyed out (public/man/NN.png).
const SOURCE_FRAMES = 24;
export const ManLayer: React.FC<{frame: number}> = ({frame}) => {
  const idx = (Math.floor(frame / 3) % SOURCE_FRAMES) + 1;
  return (
    <Img
      src={staticFile(`man/${String(idx).padStart(2, '0')}.png`)}
      style={{position: 'absolute', inset: 0, width: 960, height: 540}}
    />
  );
};

// Stages and palette come from do-it's own pipeline SVG (assets/do-it-pipeline.svg).
export const STAGES = ['prompt-it', 'plan-it', 'build-it', 'review-it', 'deploy-it', 'conclude-it'];

export const PALETTE = {
  bg: '#0b1220',
  box: '#10203a',
  boxEdge: '#1e2d44',
  lit: '#38bdf8',
  litFill: '#0b3a52',
  done: '#34d399',
  doneFill: '#06352b',
  ink: '#e5e7eb',
  muted: '#8ea0b8',
};

// Each stage lights in turn, then turns to "done" and the finish line glows.
// `cycle` is the length of one full run in frames.
export const stageState = (frame: number, index: number, cycle: number) => {
  const start = (index / STAGES.length) * cycle * 0.75;
  const litAt = start;
  const doneAt = start + cycle * 0.12;
  const lit = frame >= litAt && frame < doneAt;
  const done = frame >= doneAt;
  return {lit, done};
};

export const FlowRow: React.FC<{frame: number; cycle: number; width: number; y: number}> = ({
  frame,
  cycle,
  width,
  y,
}) => {
  const gap = 18;
  const boxW = (width - gap * (STAGES.length - 1)) / STAGES.length;
  return (
    <g>
      {STAGES.map((name, i) => {
        const {lit, done} = stageState(frame, i, cycle);
        const x = i * (boxW + gap);
        const fill = done ? PALETTE.doneFill : lit ? PALETTE.litFill : PALETTE.box;
        const stroke = done ? PALETTE.done : lit ? PALETTE.lit : PALETTE.boxEdge;
        return (
          <g key={name}>
            <rect x={x} y={y} width={boxW} height={70} rx={10} fill={fill} stroke={stroke} strokeWidth={3} />
            <text x={x + boxW / 2} y={y + 44} textAnchor="middle" fontSize={18} fontFamily="ui-monospace, Menlo, monospace" fill={PALETTE.ink}>
              {name}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export const FinishLine: React.FC<{frame: number; cycle: number; x: number; y: number; h: number}> = ({
  frame,
  cycle,
  x,
  y,
  h,
}) => {
  const glow = interpolate(frame, [cycle * 0.8, cycle * 0.9, cycle], [0.25, 1, 0.25], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <g opacity={glow}>
      <line x1={x} y1={y} x2={x} y2={y + h} stroke={PALETTE.done} strokeWidth={6} strokeDasharray="10 8" />
      <text x={x} y={y - 12} textAnchor="middle" fontSize={16} fontFamily="ui-monospace, Menlo, monospace" fill={PALETTE.done}>
        finish
      </text>
    </g>
  );
};
