/* global trace, Compartment */

import Resource from 'Resource';

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

trace("top-level executes\n");

function agRequire(modSpec) {
  trace(`agRequire(${modSpec})\n`);
  switch(modSpec) {
  case '@agoric/harden':
    return harden({ default: harden });
  case '@agoric/nat':
    return harden({ default: Nat });
  default:
    throw('bad module or something?');
  }
}


function loadKernel() {
  const kernelEndowments = {
    setImmediate() { throw('TODO!'); },
    hostStorage: {
      has() { throw('TODO!'); },
      get() { throw('TODO!'); },
      getKeys() { throw('TODO!'); },
      set() { throw('TODO!'); },
      delete() { throw('TODO!'); },
    },
  };

  const kernelSrc = new Resource("kernel.js");
  trace("kernel src:\n");
  const src = String.fromArrayBuffer(kernelSrc.slice(0));
  trace(src.slice(0, 60) + '...\n');
  const kernelExpr = `(${src.slice('export default '.length)})`;

  const { expr } = Compartment.map;
  trace(`expr module map: ${typeof expr}: ${String(expr)}\n`);

  const c1 = new Compartment(
    'expr', { require: agRequire }, { expr } );
  const kernelEval = c1.export.default;
  const buildKernel = kernelEval(kernelExpr)().default;
  trace(`buildKernel: ${buildKernel}\n`);
  return buildKernel(kernelEndowments);
}

export default function main(argv) {
  trace("main argv: " + argv + "\n");

  const kernel = loadKernel();
  trace(`kernel keys: ${JSON.stringify(Object.keys(kernel))}\n`);
}
