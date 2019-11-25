/* global trace, Compartment */

import { File, Iterator } from 'file';  // beware: powerful!
import Resource from 'Resource';

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

import { makePath } from './xs-platform/pathlib';

import start from './lib/ag-solo/start';

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

function createServer() { throw('TODO!'); }

export default function main(argv) {
  trace("argv: " + argv + "\n");

  const cwd = makePath('.', { File, Iterator });
  testForBug().then(_ => { console.log('@@no bug?'); });
  try {
    run(argv, cwd);
  } catch(oops) {
    console.log(oops.message);
    // TODO: exit(1);
  }
}

async function testForBug() {
  const things = [1, 2, 3];
  await Promise.all(things.map(async x => {
    console.log({x});
  }));
  console.log('@@@await Promise.all done.');
}

function run(argv, cwd) {
  const kernel = loadKernel();
  trace(`kernel keys: ${JSON.stringify(Object.keys(kernel))}\n`);

  const withSES = false;

  if (argv.length < 1) {
    throw('Usage: ag-solo basedir');
  }

  const basedir = cwd.join(argv[0]);
  start(basedir, withSES, argv, { createServer });
}
