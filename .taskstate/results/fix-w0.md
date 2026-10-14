# fix-w0 results

Spine was wrong for T-R2-12..14: doctor --install --host <h> now runs the companion fallback (prd-5 D13): one npx skills add per required companion, --dry-run, state in .do-it/companions-installed.json, stops at first failure with PARTIAL_FAILURE, re-run installs only the missing. Without --host it still places the binary (T-S1-11). T-H0-02: s1.test.mjs G-12 regex now assembled from joined strings (scan not weakened). Rebuilt core/spine/do-it.mjs.

```
== core/spine/test/**/*.test.mjs
# tests 35
# pass 35
# fail 0
# skipped 0
== hosts/_interface/tests/*.test.mjs
# tests 18
# pass 18
# fail 0
# skipped 0
== tests/plugin/*.test.mjs
# tests 16
# pass 16
# fail 0
# skipped 0
```
