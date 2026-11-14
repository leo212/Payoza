// One-command Firebase setup and deploy for Payoza. Run from the repo root:
//   node tools/firebase-setup.mjs <firebase-project-id>
// It signs you in (browser), creates the web app and the Firestore database
// if they are missing, writes js/config.js, deploys the rules and the site.
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';

const CLI = 'firebase-tools@13.35.1';
const LOCATION = process.env.PZ_LOCATION || 'me-west1';
const project = process.argv[2];

const quote = a => (/[\s()"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
function fb(args, { json = false } = {}) {
  const all = ['-y', CLI, ...args, ...(json ? ['--json'] : [])];
  const r = spawnSync('npx ' + all.map(quote).join(' '), { shell: true, stdio: json ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
  if (!json) return r.status === 0;
  try { const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); return out.status === 'success' ? out.result : null; }
  catch { return null; }
}
const step = s => console.log(`\n\x1b[36m▶ ${s}\x1b[0m`);
const die = s => { console.error(`\n\x1b[31m✖ ${s}\x1b[0m`); process.exit(1); };

if (!existsSync('firebase.json') || !existsSync('js/app.js')) die('Run this from the Payoza folder (where firebase.json is).');
if (+process.versions.node.split('.')[0] < 18) die('Node.js 18 or newer is required.');
if (!project) {
  console.log('Usage: node tools/firebase-setup.mjs <project-id>\n\nSigning in to list your projects…');
  fb(['login']); fb(['projects:list']);
  die('Run again with the Project ID from the table above.');
}

step('Signing in to Firebase (a browser window will open)');
if (!fb(['login'])) die('Sign-in failed.');

step(`Web app in project ${project}`);
let apps = fb(['apps:list', 'WEB', '--project', project], { json: true });
if (!apps) die(`Could not open project "${project}". Check the Project ID (Firebase console → Project settings).`);
let appId = apps[0]?.appId;
if (!appId) {
  const made = fb(['apps:create', 'WEB', 'payoza', '--project', project], { json: true });
  appId = made?.appId;
  if (!appId) die('Could not create the web app.');
  console.log('Created web app', appId);
} else console.log('Using existing web app', appId);

const conf = fb(['apps:sdkconfig', 'WEB', appId, '--project', project], { json: true });
const sdk = conf?.sdkConfig || (conf?.fileContents && JSON.parse(conf.fileContents));
if (!sdk?.apiKey) die('Could not read the web app config.');
const pick = ({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId: id }) => ({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId: id });
const configJs = `// Firebase web config. These values are public identifiers, not secrets.\nexport const firebaseConfig = ${JSON.stringify(pick(sdk), null, 2)};\n`;
writeFileSync('js/config.js', configJs);
writeFileSync('.firebaserc', JSON.stringify({ projects: { default: project } }, null, 2) + '\n');
console.log('Wrote js/config.js');

step('Firestore database');
const dbs = fb(['firestore:databases:list', '--project', project], { json: true }) || [];
if (dbs.some(d => String(d.name || '').endsWith('/(default)'))) console.log('Database already exists');
else if (!fb(['firestore:databases:create', '(default)', '--location', LOCATION, '--project', project])) {
  die('Could not create the database. Create it in the console (Build → Firestore Database → Create database), then run this again.');
}

step('Deploying security rules and the site');
if (!fb(['deploy', '--only', 'firestore:rules,hosting', '--project', project, '--non-interactive'])) die('Deploy failed (see the messages above).');

console.log(`\n\x1b[32m✔ Done! Share this link: https://${project}.web.app\x1b[0m`);
console.log('\nSend this config back to Claude so it is saved in the repo:\n');
console.log(configJs);
