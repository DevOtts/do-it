import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

// Proposal 2, her0 style, with the do-it hero behaviour: one message travels from card to
// card. Palette and components follow the her0 brand guideline (Ink #0D1117 base, Signal
// #00E5A0 as the surgical accent, 3px Signal bar on top, JetBrains Mono). The butterfly art and
// the her0 logo are cropped from DevOtts/build-it assets/build-it-header.png.
const mono = loadMono('normal', {weights: ['500', '700', '800'], subsets: ['latin']});

const HER0 = {
  ink: '#0D1117',
  signal: '#00E5A0',
  carbon: '#C9D1D9',
};

const W = 1280;
const H = 720;
// The message timeline is authored for 216 frames (7.2 s). A variant with a longer clip loop
// stretches it (see `tf` below), so the timeline always matches the composition length.
const CYCLE = 216;

// The man layer is a parameter so the same scene can run with a different GIF.
export type ManConfig = {
  dir: string; // public/<dir>/NN.png, RGBA, green screen already keyed out
  frames: number; // number of source frames
  fps: number; // source frame rate (the GIF's own)
  style: React.CSSProperties; // placement of the man layer
};

export const MAN_A: ManConfig = {
  dir: 'man720',
  frames: 24,
  fps: 10,
  style: {
    position: 'absolute',
    left: 0,
    top: -44,
    width: W,
    height: H,
    transformOrigin: '50% 100%',
    transform: 'scale(0.72)',
    filter: 'drop-shadow(0 0 22px rgba(0,229,160,0.18))',
  },
};

// 299x360 portrait clip, feet anchored to the footer line (y 664). Height 500 keeps the head
// below the title; the bottom edge fades so the cropped legs do not end on a hard line.
export const MAN_B: ManConfig = {
  dir: 'man2',
  frames: 36,
  fps: 50 / 7,
  style: {
    position: 'absolute',
    left: (W - 415) / 2 - 30, // he spends more time on the right of his frame, so nudge left
    top: 664 - 500,
    width: 415,
    height: 500,
    filter: 'drop-shadow(0 0 22px rgba(0,229,160,0.18))',
    WebkitMaskImage: 'linear-gradient(to bottom, #000 90%, transparent 100%)',
  },
};

// Layout: stages 1-3 down the left column, then the message crosses behind the man along the
// middle row, then stages 4-6 go back up the right column.
const CARD_W = 240;
const CARD_H = 72;
const LEFT_X = 64;
const RIGHT_X = W - 64 - CARD_W;
const ROWS = [262, 366, 470];
const STAGES = [
  {label: '/prompt-it', x: LEFT_X, y: ROWS[0]},
  {label: '/plan-it', x: LEFT_X, y: ROWS[1]},
  {label: '/build-it', x: LEFT_X, y: ROWS[2]},
  {label: '/review-it', x: RIGHT_X, y: ROWS[2]},
  {label: '/deploy-it', x: RIGHT_X, y: ROWS[1]},
  {label: '/conclude-it', x: RIGHT_X, y: ROWS[0]},
];
// Each card has a "port" on its left where the message lands, so it never covers the label.
const PORT_DX = 30;
const cx = (i: number) => STAGES[i].x + PORT_DX;
const cy = (i: number) => STAGES[i].y + CARD_H / 2;

// When the message reaches each card and when it leaves (frames).
const ARRIVE = [26, 58, 90, 140, 168, 196];
const LEAVE = [36, 68, 100, 150, 176, 210];
const START = 6; // the message appears at the input chip
const RESET = 212; // everything returns to idle just before the loop wraps

// Message waypoints: input chip, then each card centre with a short dwell.
const CHIP = {x: cx(0), y: 226};
const WAYPOINTS = [
  {t: START, x: CHIP.x, y: CHIP.y},
  ...STAGES.flatMap((_, i) => [
    {t: ARRIVE[i], x: cx(i), y: cy(i)},
    {t: LEAVE[i], x: cx(i), y: cy(i)},
  ]),
];

const messageAt = (f: number) => {
  if (f <= WAYPOINTS[0].t) return {x: WAYPOINTS[0].x, y: WAYPOINTS[0].y};
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i];
    const b = WAYPOINTS[i + 1];
    if (f >= a.t && f <= b.t) {
      const u = b.t === a.t ? 1 : (f - a.t) / (b.t - a.t);
      const e = Easing.inOut(Easing.quad)(u);
      return {x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e};
    }
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return {x: last.x, y: last.y};
};

// Connectors between cards. `from`/`to` are the card edges; the Signal fill follows the message.
const CONNECTORS = [
  {x1: CHIP.x, y1: CHIP.y + 14, x2: cx(0), y2: STAGES[0].y, t0: START, t1: ARRIVE[0]},
  {x1: cx(0), y1: STAGES[0].y + CARD_H, x2: cx(1), y2: STAGES[1].y, t0: LEAVE[0], t1: ARRIVE[1]},
  {x1: cx(1), y1: STAGES[1].y + CARD_H, x2: cx(2), y2: STAGES[2].y, t0: LEAVE[1], t1: ARRIVE[2]},
  {x1: STAGES[2].x + CARD_W, y1: cy(2), x2: STAGES[3].x, y2: cy(3), t0: LEAVE[2], t1: ARRIVE[3]},
  {x1: cx(3), y1: STAGES[3].y, x2: cx(4), y2: STAGES[4].y + CARD_H, t0: LEAVE[3], t1: ARRIVE[4]},
  {x1: cx(4), y1: STAGES[4].y, x2: cx(5), y2: STAGES[5].y + CARD_H, t0: LEAVE[4], t1: ARRIVE[5]},
];

// Small deterministic particles so the background has depth without randomness between renders.
// Kept out of the centre column (x 420..860) so none shows through the keyed man.
const PARTICLES = Array.from({length: 40}, (_, i) => ({
  x: (i * 197 + 83) % W,
  y: 140 + ((i * 131 + 47) % 480),
  r: 1.5 + (i % 3),
  phase: i * 0.9,
}))
  .filter((p) => p.x < 420 || p.x > 860)
  .slice(0, 18);

type CardState = 'idle' | 'lit' | 'done';

const Card: React.FC<{label: string; x: number; y: number; state: CardState}> = ({label, x, y, state}) => {
  const lit = state === 'lit';
  const done = state === 'done';
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 14,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 44,
        fontFamily: mono.fontFamily,
        fontWeight: lit ? 800 : 700,
        fontSize: 24,
        letterSpacing: '-0.01em',
        color: lit ? HER0.signal : done ? 'rgba(0,229,160,0.78)' : HER0.carbon,
        background: lit ? 'rgba(0,229,160,0.10)' : 'rgba(22,27,34,0.74)',
        border: `1.5px solid ${lit ? HER0.signal : done ? 'rgba(0,229,160,0.45)' : 'rgba(201,209,217,0.16)'}`,
        boxShadow: lit ? '0 0 30px rgba(0,229,160,0.38), inset 0 0 18px rgba(0,229,160,0.10)' : 'none',
      }}
    >
      {/* the port: the message lands here */}
      <span
        style={{
          position: 'absolute',
          left: PORT_DX - 6,
          top: CARD_H / 2 - 6,
          width: 12,
          height: 12,
          borderRadius: 999,
          boxSizing: 'border-box',
          border: `1.5px solid ${lit || done ? HER0.signal : 'rgba(201,209,217,0.35)'}`,
          background: lit ? HER0.signal : 'transparent',
        }}
      />
      {label}
    </div>
  );
};

// The scene is a stack of aligned 1280x720 layers. Turning one off renders the others alone on a
// transparent canvas, which is how the separate marketing elements are produced.
export type Layers = {bg: boolean; chrome: boolean; motion: boolean; man: boolean};
const ALL_LAYERS: Layers = {bg: true, chrome: true, motion: true, man: true};

export const Concept3: React.FC<{man?: ManConfig; layers?: Partial<Layers>; loopFloat?: boolean}> = ({
  man = MAN_A,
  layers,
  loopFloat = false,
}) => {
  const L = {...ALL_LAYERS, ...layers};
  const realFrame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  // Timeline frame: the 216 frame authoring timeline, stretched to this composition's length.
  const frame = realFrame * (CYCLE / durationInFrames);
  const manIdx = (Math.floor((realFrame / fps) * man.fps) % man.frames) + 1;
  const cursorOn = Math.floor(realFrame / 15) % 2 === 0;
  // Oscillation. With `loopFloat` the cycle count is a whole number, so the background loops
  // seamlessly; without it this is the original free-running wave (scenes A and B are unchanged).
  const osc = (k: number, phase: number) =>
    loopFloat
      ? Math.sin((realFrame / durationInFrames) * Math.PI * 2 * Math.max(1, Math.round(durationInFrames / (k * Math.PI * 2))) + phase)
      : Math.sin(realFrame / k + phase);
  const float = (p: number, amp: number) => osc(22, p) * amp;

  const idle = frame >= RESET;
  const stateOf = (i: number): CardState => {
    if (idle) return 'idle';
    if (frame >= ARRIVE[i] && frame <= LEAVE[i]) return 'lit';
    if (frame > LEAVE[i]) return 'done';
    return 'idle';
  };

  const msg = messageAt(frame);
  const msgOpacity = interpolate(frame, [START, START + 6, LEAVE[5] - 4, LEAVE[5] + 2], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const chipOpacity = interpolate(frame, [0, 6, ARRIVE[0], ARRIVE[0] + 8], [0, 1, 1, 0.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const verified = interpolate(frame, [ARRIVE[5], ARRIVE[5] + 8, RESET - 2, RESET + 2], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleGlow = 0.5 + 0.35 * verified;

  return (
    <AbsoluteFill style={{background: L.bg ? HER0.ink : 'transparent', overflow: 'hidden'}}>
      {L.bg && (<>
      {/* ambient green light behind the title and a vignette */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 50% 34%, rgba(0,229,160,0.08), transparent 70%), radial-gradient(ellipse 90% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)',
        }}
      />

      {/* butterfly art, feathered toward the centre */}
      <Img
        src={staticFile('bg/left.png')}
        style={{
          position: 'absolute',
          left: 0,
          top: 70 + float(0, 5),
          width: 215,
          height: 580,
          opacity: 0.9,
          WebkitMaskImage: 'linear-gradient(to right, #000 55%, transparent 100%)',
        }}
      />
      <Img
        src={staticFile('bg/right.png')}
        style={{
          position: 'absolute',
          left: 1065,
          top: 95 + float(2, 5),
          width: 215,
          height: 580,
          opacity: 0.9,
          WebkitMaskImage: 'linear-gradient(to left, #000 55%, transparent 100%)',
        }}
      />

      {/* particles */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {PARTICLES.map((p, i) => (
          <circle
            key={i}
            cx={p.x + float(p.phase, 6)}
            cy={p.y + float(p.phase + 1.3, 8)}
            r={p.r}
            fill={HER0.signal}
            opacity={0.18 + 0.22 * (0.5 + 0.5 * (loopFloat ? osc(18, p.phase) : Math.sin(frame / 18 + p.phase)))}
          />
        ))}
      </svg>

      </>)}

      {L.chrome && (<>
      {/* Signal bar on top: the her0 signature */}
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 3, background: HER0.signal, boxShadow: '0 0 14px rgba(0,229,160,0.6)'}} />

      {/* logo cropped from the build-it header; lighten drops its dark box */}
      <Img src={staticFile('bg/logo.png')} style={{position: 'absolute', left: 42, top: 28, width: 150, height: 62, mixBlendMode: 'lighten'}} />
      <div
        style={{
          position: 'absolute',
          right: 44,
          top: 52,
          fontFamily: mono.fontFamily,
          fontWeight: 500,
          fontSize: 13,
          letterSpacing: '0.3em',
          color: 'rgba(139,148,158,0.6)',
        }}
      >
        OPEN-SOURCE · CLAUDE CODE SKILL
      </div>

      {/* tagline and title */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: W,
          top: 104,
          textAlign: 'center',
          fontFamily: mono.fontFamily,
          fontWeight: 500,
          fontSize: 15,
          letterSpacing: '0.42em',
          color: 'rgba(0,229,160,0.85)',
        }}
      >
        ONE MESSAGE IN. A VERIFIED DELIVERY OUT.
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: W,
          top: 126,
          textAlign: 'center',
          fontFamily: mono.fontFamily,
          fontWeight: 800,
          fontSize: 92,
          lineHeight: 1,
          color: HER0.signal,
          textShadow: `0 0 26px rgba(0,229,160,${titleGlow}), 0 0 70px rgba(0,229,160,0.22)`,
        }}
      >
        /do-it
        <span style={{display: 'inline-block', width: 56, height: 78, marginLeft: 14, verticalAlign: '-6px', background: cursorOn ? HER0.signal : 'transparent'}} />
      </div>

      </>)}

      {L.motion && (<>
      {/* connectors: grey base, Signal fill follows the message */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {CONNECTORS.map((c, i) => {
          const p = interpolate(frame, [c.t0, c.t1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const filled = idle ? 0 : p;
          const ex = c.x1 + (c.x2 - c.x1) * filled;
          const ey = c.y1 + (c.y2 - c.y1) * filled;
          return (
            <g key={i}>
              <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="rgba(201,209,217,0.20)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
              <line x1={c.x1} y1={c.y1} x2={ex} y2={ey} stroke={HER0.signal} strokeWidth={3} strokeLinecap="round" opacity={0.85} style={{filter: 'drop-shadow(0 0 6px rgba(0,229,160,0.7))'}} />
            </g>
          );
        })}
      </svg>

      {/* the six stages */}
      {STAGES.map((s, i) => (
        <Card key={s.label} label={s.label} x={s.x} y={s.y} state={stateOf(i)} />
      ))}

      {/* the input message chip above the first card */}
      <div
        style={{
          position: 'absolute',
          left: LEFT_X,
          top: CHIP.y - 14,
          width: 150,
          height: 28,
          borderRadius: 999,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: mono.fontFamily,
          fontWeight: 500,
          fontSize: 13,
          color: HER0.signal,
          border: '1px solid rgba(0,229,160,0.55)',
          background: 'rgba(0,229,160,0.08)',
          opacity: chipOpacity,
        }}
      >
        "ship W0–W2"
      </div>

      {/* the message: an envelope with a halo and a short trail, drawn above the cards */}
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: msgOpacity}}>
        {[10, 8, 6, 4, 2].map((back) => {
          const g = messageAt(frame - back * (CYCLE / durationInFrames));
          return <circle key={back} cx={g.x} cy={g.y} r={3 + (10 - back) * 0.35} fill={HER0.signal} opacity={0.07 * (10 - back)} />;
        })}
        <g transform={`translate(${msg.x} ${msg.y})`}>
          <circle r={26} fill="rgba(0,229,160,0.16)" />
          <circle r={17} fill="rgba(0,229,160,0.28)" />
          <rect x={-12} y={-8.5} width={24} height={17} rx={3} fill={HER0.ink} stroke={HER0.signal} strokeWidth={1.8} />
          <path d="M-12 -8.5 L0 1.5 L12 -8.5" fill="none" stroke={HER0.signal} strokeWidth={1.8} strokeLinejoin="round" />
        </g>
      </svg>

      {/* verified badge pops next to the last card when the message is delivered */}
      <div
        style={{
          position: 'absolute',
          left: STAGES[5].x,
          top: STAGES[5].y - 42,
          width: 150,
          height: 30,
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: mono.fontFamily,
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.18em',
          color: HER0.ink,
          background: HER0.signal,
          boxShadow: '0 0 24px rgba(0,229,160,0.55)',
          opacity: verified,
          transform: `translateY(${(1 - verified) * 6}px)`,
        }}
      >
        ✓ VERIFIED
      </div>

      </>)}

      {L.man && (<>
      {/* the man, keyed out of the green screen, on top of everything and anchored to the bottom */}
      <Img src={staticFile(`${man.dir}/${String(manIdx).padStart(2, '0')}.png`)} style={man.style} />

      </>)}

      {L.chrome && (<>
      {/* footer */}
      <div style={{position: 'absolute', left: 64, right: 64, top: 664, height: 1, background: 'rgba(255,255,255,0.08)'}} />
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 678,
          fontFamily: mono.fontFamily,
          fontWeight: 500,
          fontSize: 13,
          letterSpacing: '0.26em',
          color: 'rgba(139,148,158,0.65)',
        }}
      >
        HER0 &nbsp;·&nbsp; GITHUB.COM/DEVOTTS/DO-IT
      </div>
      <div
        style={{
          position: 'absolute',
          right: 64,
          top: 678,
          fontFamily: mono.fontFamily,
          fontWeight: 500,
          fontSize: 13,
          letterSpacing: '0.26em',
          color: 'rgba(139,148,158,0.45)',
        }}
      >
        MIT
      </div>
      </>)}
    </AbsoluteFill>
  );
};
