/* global Compartment */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export function eval2(expr, endowments) {
  const params = Object.keys(endowments || {}).join(', ');
  const wrap = `(function ({${params}}) { return ${expr}; })`;
  console.log('@@eval2 wrap:', wrap.slice(0, 120));
  const f = (1, eval)(wrap);
  return f(endowments);
}

function agRequire(modSpec) {
  console.log(`agRequire(${modSpec})\n`);
  switch(modSpec) {
  case '@agoric/harden':
    return harden({ default: harden });
  case '@agoric/nat':
    return harden({ default: Nat });
  default:
    throw('bad module or something?');
  }
}


const SES = { makeSESRootRealm, confine, confineExpr };

function confine() {
  throw('TODO!@@');
}

function confineExpr() {
  throw('TODO!@@');
}

const makeRealmSrc = `(
function makeRealm() {
  return harden({
    makeRequire(options) {
      // console.log('makeRequire', {optionKeys: Object.keys(options)});
      return agRequire;
    },
    evaluate: eval2,
    global: {
      Realm: {
	makeCompartment,
      },
      SES,
    },
  });
}
)`;

export function makeSESRootRealm(options) {
  // console.log('makeSESRootRealm', { optionKeys: Object.keys(options) });
  const { ses, '@agoric/harden': agHarden, '@agoric/nat': agNat } = Compartment.map;
  const map = { ses, '@agoric/harden': agHarden, '@agoric/nat': agNat };
  const optEndowments = options.consoleMode == 'allow' ? { console } : {};
  const makeCompartment = (...args) => new Compartment('ses', { ...optEndowments, SES }, map);

  const c = makeCompartment();
  const makeRealm = c.export.eval2(makeRealmSrc, { makeCompartment, eval2, console, agRequire, harden });
  const realm = makeRealm();
  // console.log('new realm:', realm);
  return realm;
}

export default SES;
