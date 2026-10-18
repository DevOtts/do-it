# do-it marketing motion pack

The README header (A) and outro (B) animations, every option that was explored, and each layer on its own so the pieces can be reused in decks, posts and landing pages.

Style: her0 brand guideline (Ink `#0D1117`, Signal `#00E5A0`, Ink Soft `#161B22`, Carbon `#C9D1D9`, Slate `#8B949E`, JetBrains Mono, 3 px Signal bar on top).

> [!WARNING]
> Both animated clips are third-party meme GIFs of a real, identifiable person. Their rights are not cleared. Confirm that you may use that likeness before this repository goes public or before any commercial use. Every other element here (background, motion, brand layer) is ours and works without the person: see `layers/` and `elements/butterflies`, `elements/logo`.

## What is where

| Folder | Contents |
|---|---|
| `final/` | **A** `a-clip1-header` (README header, 7.2 s) and **B** `b-clip2-outro` (README outro, 10.07 s). Each as `.gif` (960 px wide, 14 fps) and `.mp4` (1280×720, 30 fps). |
| `options/` | The other proposals. Option 1: the flow passes behind the man. Option 2: "JUST DO-IT" with the stages in two columns. Option 3: her0 style with cards lighting in turn. |
| `layers/` | The scene as four aligned 1280×720 layers (below). |
| `elements/man-clip1`, `man-clip2` | The man on his own, green screen removed, at the clip's native size: `.apng` (full alpha), `.webm` (VP9 alpha) and `.gif` (1-bit alpha, jagged edges). |
| `elements/butterflies`, `logo` | The butterfly art (left and right) and the `her0` logo, cropped from `DevOtts/build-it` `assets/build-it-header.png`. Raster, so do not scale them up. |
| `elements/originals` | The two source GIFs as downloaded. |
| `source/` | The Remotion project behind all of it, with the scripts to regenerate everything. |
| `_masters/` | Not in git. The keyed PNG sequences, written by `npm run frames` in `source/`. |

## The layers

Bottom to top, all 1280×720 and aligned, so stacking them reproduces the scene:

1. `layers/bg/` the background: ink gradient, butterflies, particles. `bg-loop.mp4` is opaque and loops with no visible jump (7.2 s; the loop point measures 50 dB PSNR); `bg.png` is a still.
2. `layers/motion/` the stage cards, connectors, input chip, travelling message and VERIFIED badge. `motion-a.webm` (7.2 s) and `motion-b.webm` (10.07 s), transparent.
3. `layers/man/` the keyed clip placed exactly as in the scene. `man-a.webm`, `man-b.webm`, transparent.
4. `layers/chrome/` the Signal bar, logo, labels, tagline, `/do-it` title with cursor and footer. `chrome-a.webm`, `chrome-b.webm`, transparent, plus `chrome-a-still.png`.

A and B use different timelines. B is 302 frames because clip 2 lasts 5.04 s and the scene has to hold two whole loops of it, otherwise the man jumps at the loop point.

### Restack A with ffmpeg

`-c:v libvpx-vp9` before each `.webm` is needed so ffmpeg decodes their alpha.

```bash
ffmpeg -i layers/bg/bg-loop.mp4 \
  -c:v libvpx-vp9 -i layers/motion/motion-a.webm \
  -c:v libvpx-vp9 -i layers/man/man-a.webm \
  -c:v libvpx-vp9 -i layers/chrome/chrome-a.webm \
  -filter_complex "[0:v][1:v]overlay[a];[a][2:v]overlay[b];[b][3:v]overlay,format=yuv420p" \
  -t 7.2 -c:v libx264 -crf 18 restack-a.mp4
```

For B, loop the background (`-stream_loop 1` before the first input) and use `-t 10.07`.

Restacking is visually the same as `final/` but not pixel-identical: it measured 33 to 36 dB PSNR against `a-clip1-header.mp4`. The layers went through video compression, and the background layer uses its own periodic motion so it can loop, which puts the butterflies and particles in slightly different places.

## Regenerate

```bash
cd source
npm install
npm run frames    # keys the original GIFs into public/man, public/man720, public/man2
npm run render    # rebuilds final/, options 1 and 2, and every layer
```

Needs Node 18+ and ffmpeg. Remotion fetches JetBrains Mono from Google Fonts when it renders. Option 3 is an earlier composition that is no longer in the code, so its files are kept as delivered and `npm run render` does not touch them.

## Known limits

- The green-screen key leaves a faint green edge on the silhouette, and clip 2 shows small light speckles on the face in some frames (from the GIF's dithering).
- Clip 2 is 299×360 and clip 1 is 480×270. Both are upscaled, so they are soft at full size.
- The footer text reads `GITHUB.COM/DEVOTTS/DO-IT`. That repository is private, so the link does not open for outside viewers until it is public.
- Options 1 and 2 predate the her0 style and do not carry the her0 logo.
- The `.gif` files are the largest items: A is about 5 MB and B about 7 MB.

## Sources

- Clip 1: `https://i.pinimg.com/originals/43/6c/e7/436ce7f927723c35cf3eecc63d1444fd.gif`
- Clip 2: `https://i.pinimg.com/originals/85/0f/f0/850ff03095c99048708074cb1b3a3615.gif` (the same clip is on Giphy, id `87xihBthJ1DkA`, at the same 299×360 size).
- her0 brand guideline: `her0-landing-page/docs/Her0 brad guideline.md`.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
