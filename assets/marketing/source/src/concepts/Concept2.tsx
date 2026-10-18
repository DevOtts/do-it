import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {ManLayer, PALETTE, STAGES} from '../flow';

// Proposal 2: "JUST DO IT" becomes "JUST DO-IT". The phrase sits in the upper half
// and the do-it stages light up under "DO-IT", one per beat, as the man repeats it.
const CYCLE = 216;

export const Concept2: React.FC = () => {
  const frame = useCurrentFrame();
  const beat = Math.floor((frame / CYCLE) * STAGES.length);
  const pop = interpolate(frame % 72, [0, 8], [0.92, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: PALETTE.bg}}>
      <svg width={960} height={540} viewBox="0 0 960 540" style={{position: 'absolute', inset: 0}}>
        <text
          x={480}
          y={44}
          textAnchor="middle"
          fontSize={46}
          fontWeight={900}
          fontFamily="Impact, ui-sans-serif, system-ui"
          fill={PALETTE.ink}
          transform={`translate(480 44) scale(${pop}) translate(-480 -44)`}
        >
          JUST <tspan fill={PALETTE.lit}>DO-IT</tspan>
        </text>
        {STAGES.map((name, i) => {
          // Left column for the first three stages, right column for the rest, so the
          // man in the centre never covers a stage.
          const lit = i <= beat;
          const left = i < 3;
          const row = i % 3;
          const x = left ? 40 : 960 - 40 - 200;
          const y = 170 + row * 100;
          return (
            <g key={name}>
              <rect
                x={x}
                y={y}
                width={200}
                height={64}
                rx={10}
                fill={lit ? PALETTE.litFill : PALETTE.box}
                stroke={lit ? PALETTE.lit : PALETTE.boxEdge}
                strokeWidth={3}
              />
              <text x={x + 100} y={y + 39} textAnchor="middle" fontSize={20} fontFamily="ui-monospace, Menlo, monospace" fill={PALETTE.ink}>
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <ManLayer frame={frame} />
    </AbsoluteFill>
  );
};
