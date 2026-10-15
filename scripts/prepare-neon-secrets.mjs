import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const path = existsSync('.env') ? '.env' : '.env.local';
const contents = existsSync(path) ? readFileSync(path, 'utf8') : '';
const read = name => existsSync(name) ? parseEnv(readFileSync(name, 'utf8')) : {};
const current = { ...read('.env'), ...read('.env.local') };
const additions = ['FUNCTION_API_KEY'].filter(name => !current[name] && !process.env[name]);
if (additions.length) {
  appendFileSync(path, '\n' + additions.map(name => `${name}=${randomBytes(32).toString('base64url')}`).join('\n') + '\n', { mode: 0o600 });
}
console.log(`${path}: function credential ${additions.length ? 'created' : 'already configured'}. Secret values omitted.`);
