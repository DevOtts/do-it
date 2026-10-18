#!/usr/bin/env bash
# Regenerates the keyed (green screen removed) PNG frame sequences the compositions read.
# Source: the original GIFs in ../elements/originals. Output: public/man, public/man720, public/man2.
# Key colours were measured from each clip's own background (clip 1 is flat #63ad73,
# clip 2 drifts between #5eab6f and #6cb57b, so it is keyed at #64b075 with a wider tolerance).
set -euo pipefail
cd "$(dirname "$0")/.."
O=../elements/originals
C1=$O/clip1-original-480x270.gif
C2=$O/clip2-original-299x360.gif

mkdir -p public/man public/man720 public/man2
rm -f public/man/*.png public/man720/*.png public/man2/*.png

# Clip 1 at 960x540 (options 1 and 2) and at 1280x720 (final A)
ffmpeg -v error -y -i "$C1" -vf "colorkey=0x63ad73:0.12:0.03,format=rgba,scale=960:540:flags=lanczos"  public/man/%02d.png
ffmpeg -v error -y -i "$C1" -vf "colorkey=0x63ad73:0.12:0.03,format=rgba,scale=1280:720:flags=lanczos" public/man720/%02d.png
# Clip 2 at 598x720 (final B)
ffmpeg -v error -y -i "$C2" -vf "colorkey=0x64b075:0.14:0.04,format=rgba,scale=598:720:flags=lanczos"  public/man2/%02d.png

echo "frames: clip1 $(ls public/man720 | wc -l | tr -d ' '), clip2 $(ls public/man2 | wc -l | tr -d ' ')"
