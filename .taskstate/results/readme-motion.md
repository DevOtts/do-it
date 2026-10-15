# readme-motion check log

Rendered in headless Chromium (Playwright), animations paused and seeked with document.getAnimations(); three timestamps per file plus a prefers-reduced-motion render. Frames were viewed; no overlaps or clipped text after fixing files-strip/loop-label and DOD chip overlap found on first pass.

```
do-it-hero t=1.5s animations=18
do-it-hero t=5s animations=18
do-it-hero t=9.5s animations=18
do-it-hero reduced-motion: running animations=0
do-it-pipeline t=2s animations=12
do-it-pipeline t=5s animations=12
do-it-pipeline t=9.5s animations=12
do-it-pipeline reduced-motion: running animations=0
do-it-uc-feature t=3.5s animations=30
do-it-uc-feature t=11.5s animations=30
do-it-uc-feature t=17s animations=30
do-it-uc-feature reduced-motion: running animations=0
do-it-uc-limit t=6.5s animations=26
do-it-uc-limit t=10s animations=26
do-it-uc-limit t=17s animations=26
do-it-uc-limit reduced-motion: running animations=0
do-it-uc-ownerpack t=6s animations=26
do-it-uc-ownerpack t=9.8s animations=26
do-it-uc-ownerpack t=18s animations=26
do-it-uc-ownerpack reduced-motion: running animations=0
do-it-uc-review t=8.5s animations=31
do-it-uc-review t=13s animations=31
do-it-uc-review t=20s animations=31
do-it-uc-review reduced-motion: running animations=0
```

reduced-motion: running animations = 0 for every file, finished frame shown.

## Gates
```
readme/r1: # pass 17 # fail 0 
readme/motion: # pass 5 # fail 0 
plugin/r2: # pass 16 # fail 0 
catalog/catalog: # pass 16 # fail 0 
gen-claims --check: claims.json is current
check-readme --all: rc=0  (README      292 lines, cap 450)
gate-check handoff: PASS — pre-handoff lint (mechanizable half — the judgment half stays with the model)
gate-check adversary: PASS — adversarial-depth (D4: failure-mode coverage)
```
