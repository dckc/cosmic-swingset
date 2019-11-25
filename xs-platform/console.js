/* global trace */

const harden = x => Object.freeze(x, true);

const text = it => typeof it == 'object' ? JSON.stringify(it) : String(it);

export const console = harden({
  log(...things) {
    const txt = things.map(text).join(' ') + '\n';
    trace(txt);
  },
});
