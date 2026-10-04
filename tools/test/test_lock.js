const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* The real lock.js: PIN and recovery-code round trips, the change-PIN path
   keeping the recovery code, and the back-off schedule surviving in storage. */
const fs = require('fs');
const vm = require('vm');

const store = {};
const chrome = {
  storage: {
    local: {
      get(k, cb) { const o = {}; if (k in store) o[k] = store[k]; cb(o); },
      set(o, cb) { Object.assign(store, o); cb && cb(); },
      remove(k, cb) { delete store[k]; cb && cb(); }
    }
  }
};

const ctx = { crypto: globalThis.crypto, atob, btoa, TextEncoder, chrome, Date, Math };
vm.runInNewContext(fs.readFileSync(ROOT + 'src/shared/lock.js', 'utf8'), ctx);
const K = ctx.BEEJ_LOCK;

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

(async () => {
  check('short PIN refused', !!K.pinProblem('123'), '');
  check('4-char PIN accepted', K.pinProblem(' 1234 ') === null, '');

  const { lock, recoveryCode } = await K.create('2468');
  const json = JSON.stringify(lock);
  check('neither secret is stored', !json.includes('2468') && !json.includes(recoveryCode.replace(/-/g, '')), json);
  check('recovery code looks like XXXX-XXXX-XXXX', /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(recoveryCode), recoveryCode);

  check('right PIN opens', await K.checkPin(lock, '2468'), '');
  check('surrounding spaces ignored', await K.checkPin(lock, ' 2468 '), '');
  check('wrong PIN does not', !(await K.checkPin(lock, '2469')), '');
  check('no lock record opens nothing', !(await K.checkPin(null, '2468')), '');

  check('recovery code opens', await K.checkRecovery(lock, recoveryCode), '');
  check('recovery code typed lower-case without dashes opens',
    await K.checkRecovery(lock, recoveryCode.toLowerCase().replace(/-/g, ' ')), '');
  check('PIN is not a recovery code', !(await K.checkRecovery(lock, '2468')), '');

  const changed = await K.changePin(lock, '1357');
  check('changed PIN opens', await K.checkPin(changed, '1357'), '');
  check('old PIN stops working', !(await K.checkPin(changed, '2468')), '');
  check('recovery code survives a PIN change', await K.checkRecovery(changed, recoveryCode), '');

  check('first four failures are free', [1, 2, 3, 4].every(n => K._waitFor(n) === 0), '');
  check('fifth failure waits 30s', K._waitFor(5) === 30000, K._waitFor(5));
  check('wait doubles', K._waitFor(6) === 60000, K._waitFor(6));
  check('wait is capped at 15 min', K._waitFor(40) === 15 * 60 * 1000, K._waitFor(40));

  for (let i = 0; i < 5; i++) await K.recordFailure();
  const wait = await K.retryIn();
  check('back-off is persisted', wait > 25000 && wait <= 30000, wait);
  await K.clearFailures();
  check('success clears the back-off', (await K.retryIn()) === 0, '');

  process.exit(ok ? 0 : 1);
})();
