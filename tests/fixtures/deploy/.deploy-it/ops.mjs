// Scripted deploy commands. Knobs (env): DEPLOY_FAIL=<leg command>, ROLLBACK_FAIL=<leg command>.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const T = 'target/app.txt';
const BACKUP = '.deploy-it/backup/app.txt';
const CLAIM = 'target/claimed.json';
const PUB = 'target/published/app.txt';
const cmd = process.argv[2];

function die(msg) { console.error(msg); process.exit(1); }
if (process.env.DEPLOY_FAIL === cmd) die('scripted failure in ' + cmd);

switch (cmd) {
  case 'write':
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    if (!fs.existsSync(BACKUP)) fs.copyFileSync(T, BACKUP);
    fs.copyFileSync('release/app.txt', T);
    console.log('wrote ' + T + ' sha256=' + sha(T));
    break;
  case 'verify-write':
    if (sha(T) !== sha('release/app.txt')) die('digest mismatch: target ' + sha(T) + ' release ' + sha('release/app.txt'));
    console.log('verified write sha256=' + sha(T));
    break;
  case 'rollback-write':
    if (process.env.ROLLBACK_FAIL === 'write') {
      console.error('digest mismatch: expected ' + sha(BACKUP) + ' got ' + sha(T) + ' (restore refused)');
      process.exit(1);
    }
    fs.copyFileSync(BACKUP, T);
    console.log('restored ' + T + ' sha256=' + sha(T));
    break;
  case 'claim-digest':
    fs.writeFileSync(CLAIM, JSON.stringify({ digest: sha(T) }) + '\n');
    console.log('claimed digest ' + sha(T));
    break;
  case 'verify-digest': {
    const claimed = JSON.parse(fs.readFileSync(CLAIM, 'utf8')).digest;
    const actual = sha(T);
    if (claimed !== actual) die('digest mismatch: claimed ' + claimed + ' re-read ' + actual);
    console.log('re-read digest matches ' + actual);
    break;
  }
  case 'rollback-digest':
    if (process.env.ROLLBACK_FAIL === 'verify-digest') die('rollback refused');
    fs.rmSync(CLAIM, { force: true });
    console.log('removed claim');
    break;
  case 'publish':
    fs.mkdirSync(path.dirname(PUB), { recursive: true });
    fs.copyFileSync(T, PUB);
    console.log('published ' + PUB);
    break;
  case 'verify-publish':
    if (!fs.existsSync(PUB) || sha(PUB) !== sha(T)) die('digest mismatch: published copy differs');
    console.log('verified publish');
    break;
  case 'rollback-publish':
    fs.rmSync(PUB, { force: true });
    console.log('unpublished');
    break;
  default:
    die('unknown command ' + cmd);
}
