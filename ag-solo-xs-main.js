/* global trace, Compartment */

import Resource from 'Resource';

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

import { File, Iterator } from 'file';  // beware: powerful!

import { makePath } from './xs-platform/pathlib';

// ref moddable/examples/base/timers/main.js
import Timer from 'timer';

import start from './lib/ag-solo/start';

trace("top-level executes\n");

function setImmediate(callback) {
  Timer.set(callback);
}

function setInterval(callback, delay) {
  Timer.repeat(callback, delay);
}

function now() {
  return Date.now();
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
  run(argv || ['t3', '@@@'], cwd)
    .then(_ => console.log('run() done.'))
    .catch(oops => {
      console.log('run() oops: ', oops);
      console.log('run() oops: ', oops.message);
      // TODO: exit(1);
    });
}

async function run(argv, cwd) {
  if (false) { //@@@
  const kernel = loadKernel();
  trace(`kernel keys: ${JSON.stringify(Object.keys(kernel))}\n`);
  }

  const withSES = true;

  if (argv.length < 1) {
    throw('Usage: ag-solo basedir');
  }

  const basedir = cwd.join(argv[0]);
  return start(basedir, withSES, argv,
	       { createServer, setImmediate, setInterval, now });
}
