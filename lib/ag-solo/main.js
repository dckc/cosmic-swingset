import parseArgs from 'minimist';
import { insist } from './insist';

// Start a network service
import bundle from './bundle';
import initBasedir from './init-basedir';
import setGCIIngress from './set-gci-ingress';
import start from './start';

import makeNodePath from './pathlib';

// As we add more egress types, put the default types in a comma-separated
// string below.
const DEFAULT_EGRESSES = 'cosmos';


function insistIsBasedir(AG_SOLO_BASEDIR, { env, cwd, chdir }) {
  if (AG_SOLO_BASEDIR) {
    chdir(AG_SOLO_BASEDIR);
  }
  const basedir = cwd.realpathSync();
  try {
    basedir.join('solo-README.md').statSync();
  } catch (e) {
    throw `${basedir} doesn't appear to be an ag-solo base directory`;
  }
  return basedir;
}

export default async function solo(progname, rawArgv,
				   { env, stdout, fs, path, process, createServer }) {
  process.on('SIGINT', () => process.exit(99));
  const cwd = makeNodePath('.', { fs, path });
  const AG_SOLO_BASEDIR =
	env.AG_SOLO_BASEDIR && cwd.resolve(env.AG_SOLO_BASEDIR);

  console.error('solo', rawArgv);
  const { _: argv, ...opts } = parseArgs(rawArgv, {
    stopEarly: true,
    boolean: ['help', 'version'],
  });

  if (opts.help) {
    stdout.write(`\
Usage: ${rawArgv[0]} COMMAND [OPTIONS...]

init
set-gci-ingress
start
`);
  }

  if (argv[0] === 'init') {
    const { _: subArgs, ...subOpts } = parseArgs(argv.slice(1), {
      default: {
        webport: '8000',
        // If we're in Vagrant, default to listen on the VM's routable address.
        webhost: cwd.resolve('/vagrant').existsSync() ? '0.0.0.0' : '127.0.0.1',
        egresses: DEFAULT_EGRESSES,
      },
    });
    const webport = Number(subOpts.webport);
    const { webhost, egresses } = subOpts;
    const basedir = subArgs[0] || AG_SOLO_BASEDIR;
    const subdir = subArgs[1];
    insist(basedir !== undefined, 'you must provide a BASEDIR');
    initBasedir(basedir, webport, webhost, subdir, egresses.split(','));
    console.error(`Run '(cd ${basedir} && ${progname} start)' to start the vat machine`);
  } else if (argv[0] === 'set-gci-ingress') {
    const basedir = insistIsBasedir(AG_SOLO_BASEDIR, { env, cwd, chdir: process.chdir });
    const { _: subArgs, ...subOpts } = parseArgs(argv.slice(1), {});
    const GCI = subArgs[0];
    const chainID = subOpts.chainID || 'agoric';
    const rpcAddresses = subArgs.slice(1);
    setGCIIngress(basedir, GCI, rpcAddresses, chainID);
  } else if (argv[0] === 'start') {
    const basedir = insistIsBasedir(AG_SOLO_BASEDIR, { env, cwd, chdir: process.chdir });
    const withSES = true;
    await start(basedir, withSES, argv.slice(1), { createServer });
  } else if (argv[0] === 'bundle') {
    await bundle(insistIsBasedir, argv.slice(1));
  } else if (argv[0] === 'upload-contract') {
    await bundle(insistIsBasedir, [`--evaluate`, ...argv]);
  } else if (argv[0] === 'register-http') {
    await bundle(insistIsBasedir, [`--evaluate`, ...argv]);
  } else {
    console.error(`unrecognized command ${argv[0]}`);
    console.error(`try one of: init, set-gci-ingress, start`);
  }
}
