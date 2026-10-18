import React from 'react';
import {Composition} from 'remotion';
import {Concept1} from './concepts/Concept1';
import {Concept2} from './concepts/Concept2';
import {Concept3, MAN_A, MAN_B} from './concepts/Concept3';

// Each layer alone on a transparent canvas, aligned to the full scene (1280x720), so a designer
// can restack them. A = clip 1 timeline (216 frames), B = clip 2 timeline (302 frames).
const LAYER_COMPS = [
  {id: 'layer-bg', dur: 216, props: {layers: {bg: true, chrome: false, motion: false, man: false}, loopFloat: true}},
  {id: 'layer-chrome-a', dur: 216, props: {man: MAN_A, layers: {bg: false, chrome: true, motion: false, man: false}}},
  {id: 'layer-chrome-b', dur: 302, props: {man: MAN_B, layers: {bg: false, chrome: true, motion: false, man: false}}},
  {id: 'layer-motion-a', dur: 216, props: {man: MAN_A, layers: {bg: false, chrome: false, motion: true, man: false}}},
  {id: 'layer-motion-b', dur: 302, props: {man: MAN_B, layers: {bg: false, chrome: false, motion: true, man: false}}},
  {id: 'layer-man-a', dur: 216, props: {man: MAN_A, layers: {bg: false, chrome: false, motion: false, man: true}}},
  {id: 'layer-man-b', dur: 302, props: {man: MAN_B, layers: {bg: false, chrome: false, motion: false, man: true}}},
];

// The man clip is 3 loops of the 2.4 s source GIF: 7.2 s at 30 fps.
const FPS = 30;
const DURATION = 216;
const W = 960;
const H = 540;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="p1-flow-behind" component={Concept1} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
    <Composition id="p2-just-do-it" component={Concept2} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
    <Composition id="p2-her0" component={Concept3} durationInFrames={DURATION} fps={FPS} width={1280} height={720} />
    {/* Same scene, second GIF: 36 frames at 50/7 fps = 5.04 s. Two loops = 10.08 s = 302 frames, so the clip repeats with no jump. */}
    <Composition id="p2-her0-b" component={Concept3} defaultProps={{man: MAN_B}} durationInFrames={302} fps={FPS} width={1280} height={720} />
    {LAYER_COMPS.map((c) => (
      <Composition key={c.id} id={c.id} component={Concept3} defaultProps={c.props} durationInFrames={c.dur} fps={FPS} width={1280} height={720} />
    ))}
  </>
);
