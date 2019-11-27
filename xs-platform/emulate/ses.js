/* global Compartment */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export function eval2(expr, endowments) {
  console.log('@@eval2 endowments:',
	      JSON.stringify(Object.entries(endowments)
			     .map(([k, v]) => [k, typeof v])));
  // ISSUE: check that params are valid identifiers
  const params = Object.keys(endowments || {}).join(', ');
  const wrap = `(function ({${params}}) { return ${expr}; })`;
  let f;
  try {
    f = (1, eval)(wrap);
  } catch (oops) {
    console.log('@@eval wrap failed:', oops.message, wrap);
    throw oops;
  }
  const out = f(endowments);
  console.log('@@eval2 =>', typeof out);
  return out;
}

function agRequire(modSpec) {
  console.log(`agRequire(${modSpec})\n`);
  switch(modSpec) {
  case '@agoric/harden':
    return harden({ default: harden });
  case '@agoric/nat':
    return harden({ default: Nat });
  case '@agoric/evaluate':
    console.log('@@TODO: details of @agoric/evaluate');
    return harden({ default: eval2 });
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
      console.log('@@makeRequire', {optionKeys: Object.keys(options)});
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
  console.log('@@new realm:', typeof realm.makeRequire({}));
  return realm;
}

export default SES;
