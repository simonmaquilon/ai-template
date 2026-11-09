// A plan for the pass cache tests: a committed repository whose plan folder holds the bundled lib and all and the checks.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startRepo } from './support.mjs';

const BUNDLED = join(ROOT, '.agents', 'skills', 'prompt-plan', 'scripts', 'node');
const CACHED = /Fragment (\d\d): PASS \(cached: \S*(\d\d)-check-[\w-]+\.log\)/g;

// A plan with the checks 01, 02, and 03, which scripts[NN] replaces. Each counts its runs in .temp/count-NN.txt, and 01
// breaks when BREAK says so: fail reports a failing line, kill ends the script as a signal would; volatile marks 01's
// line as one that reads state outside the tree.
export function makePlan(t, { volatile = false, scripts = {} } = {}) {
  const repo = startRepo(t);
  const check = join(repo.dir, '.temp', 'plans', 'p', 'check');
  mkdirSync(check, { recursive: true });
  cpSync(join(BUNDLED, 'check-lib.mjs'), join(check, 'lib.mjs'));
  cpSync(join(BUNDLED, 'check-all.mjs'), join(check, 'all.mjs'));
  for (const number of ['01', '02', '03']) {
    const line = `condition('C', 'line', ${number === '01' ? "process.env.BREAK !== 'fail'" : 'true'})`;
    writeFileSync(join(check, `${number}-check.mjs`), scripts[number] ?? `import { appendFileSync } from 'node:fs';\nimport { condition, runChecks${volatile ? ', volatile' : ''} } from './lib.mjs';\n`
      + `appendFileSync(${JSON.stringify(join(repo.dir, '.temp', `count-${number}.txt`))}, 'x');\n`
      + `if (process.env.BREAK === 'kill' && '${number}' === '01') process.kill(process.pid, 'SIGKILL');\n`
      + `runChecks('${number}', [${number === '01' && volatile ? `volatile(${line})` : line}]);\n`);
  }
  const env = { ...process.env };
  delete env.PROMPT_PLAN_RUN;
  delete env.PROMPT_PLAN_SKIP_SLOW;
  const all = (args = [], extra = {}) => spawnSync(process.execPath, [join(check, 'all.mjs'), ...args], { cwd: repo.dir, encoding: 'utf8', env: { ...env, ...extra } });
  const runs = () => ['01', '02', '03'].map((number) => {
    const file = join(repo.dir, '.temp', `count-${number}.txt`);
    return existsSync(file) ? readFileSync(file, 'utf8').length : 0;
  });
  const cached = (result) => [...result.stdout.matchAll(CACHED)].map((found) => found[1]);
  return { repo, check, all, runs, cached, plan: join(repo.dir, '.temp', 'plans', 'p') };
}
