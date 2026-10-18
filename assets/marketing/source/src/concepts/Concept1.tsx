import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {FinishLine, FlowRow, ManLayer, PALETTE} from '../flow';

// Proposal 1: the do-it pipeline runs as a band behind the man. The man is keyed
// out of the green screen and sits in front; the stages light left to right and
// the finish line closes the run.
const CYCLE = 216;

export const Concept1: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: PALETTE.bg}}>
      <svg width={960} height={540} viewBox="0 0 960 540" style={{position: 'absolute', inset: 0}}>
        <text x={40} y={70} fontSize={34} fontWeight={800} fontFamily="ui-sans-serif, system-ui" fill={PALETTE.ink}>
          do-it
        </text>
        <text x={40} y={100} fontSize={18} fontFamily="ui-sans-serif, system-ui" fill={PALETTE.muted}>
          One message in. A verified delivery out.
        </text>
        <g transform="translate(40 220)">
          <FlowRow frame={frame} cycle={CYCLE} width={880} y={0} />
        </g>
        <g transform="translate(40 340)">
          <FinishLine frame={frame} cycle={CYCLE} x={900} y={-60} h={130} />
        </g>
      </svg>
      <ManLayer frame={frame} />
    </AbsoluteFill>
  );
};
