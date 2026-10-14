# N2 live re-run (T-N2-04)

`node core/state-stores/conformance/run.mjs --backend engine --driver rows` -> exit 3, `IMPLEMENTED-NOT-VERIFIED backend: engine, driver: rows, real: true, probe: DO_IT_ENGINE_URL is unset...`

n2.test.mjs re-run: 18/18 pass (T-N2-04 still IMPLEMENTED-NOT-VERIFIED).

Probe: env DO_IT_ENGINE_URL unset; docker daemon not running (Cannot connect to unix:///Users/macbook/.docker/run/docker.sock); no .secrets in do-it root or parent (Engine-Core/.secrets exists, content not read, its local stack at localhost:3001 is down); no staging URL in any file; localhost 3000/3001/3101/27027/6390 refuse connections
