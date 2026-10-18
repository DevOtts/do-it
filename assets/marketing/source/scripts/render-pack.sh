#!/usr/bin/env bash
# Re-renders the final A and B, options 1 and 2, and every layer into the folders next to ../source.
# Run `npm install` and `npm run frames` first. Needs ffmpeg.
# Option 3 (her0 cards lighting) is an earlier composition that is no longer in the code; its files
# in ../options are kept as delivered.
set -euo pipefail
cd "$(dirname "$0")/.."
M=..   # assets/marketing

R() { npx remotion render src/index.ts "$@" --log=error; }
STILL() { npx remotion still src/index.ts "$@" --log=error; }
ALPHA=(--codec=vp9 --pixel-format=yuva420p --image-format=png)
# GIF from an mp4: $1 in, $2 out, $3 width, $4 fps
gif() {
  ffmpeg -v error -y -i "$1" -vf "fps=$4,scale=$3:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$2"
}

mkdir -p $M/final $M/options $M/layers/{bg,chrome,motion,man}

echo "== final A (clip 1, header) and B (clip 2, outro)"
R p2-her0   $M/final/a-clip1-header.mp4; gif $M/final/a-clip1-header.mp4 $M/final/a-clip1-header.gif 960 14
R p2-her0-b $M/final/b-clip2-outro.mp4;  gif $M/final/b-clip2-outro.mp4  $M/final/b-clip2-outro.gif  960 14

echo "== options 1 and 2"
R p1-flow-behind $M/options/option-1-flow-behind.mp4; gif $M/options/option-1-flow-behind.mp4 $M/options/option-1-flow-behind.gif 720 12
R p2-just-do-it  $M/options/option-2-just-do-it.mp4;  gif $M/options/option-2-just-do-it.mp4  $M/options/option-2-just-do-it.gif  720 12

echo "== layers (aligned 1280x720; alpha WebM unless noted)"
R layer-bg $M/layers/bg/bg-loop.mp4
STILL layer-bg $M/layers/bg/bg.png --frame=0
R layer-chrome-a $M/layers/chrome/chrome-a.webm "${ALPHA[@]}"
R layer-chrome-b $M/layers/chrome/chrome-b.webm "${ALPHA[@]}"
STILL layer-chrome-a $M/layers/chrome/chrome-a-still.png --frame=120
R layer-motion-a $M/layers/motion/motion-a.webm "${ALPHA[@]}"
R layer-motion-b $M/layers/motion/motion-b.webm "${ALPHA[@]}"
R layer-man-a $M/layers/man/man-a.webm "${ALPHA[@]}"
R layer-man-b $M/layers/man/man-b.webm "${ALPHA[@]}"
echo DONE
