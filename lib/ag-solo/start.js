import readlines from 'n-readlines';
// import { createHash } from 'crypto';

// import connect from 'lotion-connect';
// import harden from '@agoric/harden';
// import djson from 'deterministic-json';
// import maybeExtendPromise from '@agoric/transform-bang';

import {
  loadBasedir,
  buildVatController,
//  buildTimer,
//  getVatTPSourcePath,
//  getCommsSourcePath,
//  getTimerWrapperSourcePath,
} from '@agoric/swingset-vat/controller';
import {
  buildMailboxStateMap,
  buildMailbox,
} from '@agoric/swingset-vat/devices/mailbox';

import { buildStorageInMemory } from '@agoric/swingset-vat/hostStorage';
import buildCommand from '@agoric/swingset-vat/devices/command';

import { deliver, addDeliveryTarget } from './outbound';
//@@ import { makeHTTPListener } from './web';

//@@ import { connectToChain } from './chain-cosmos-sdk';
//@@ import bundle from './bundle';

// import { makeChainFollower } from './follower';
// import { makeDeliverator } from './deliver-with-ag-cosmos-helper';

const CONTRACT_REGEXP = /^((zoe|contractHost)-([^.]+))/;

async function buildSwingset(
  mailboxStateFile,
  kernelStateFile,
  withSES,
  vatsDir,
  argv,
  broadcast,
  ) {
  console.log('@@buildSwingset');
  const initialMailboxState = JSON.parse(mailboxStateFile.readFileSync());

  const mbs = buildMailboxStateMap();
  mbs.populateFromData(initialMailboxState);
  const mb = buildMailbox(mbs);
  const cm = buildCommand(broadcast);
  const timer = buildTimer();

  const config = await loadBasedir(vatsDir);
  config.devices = [
    ['mailbox', mb.srcPath, mb.endowments],
    ['command', cm.srcPath, cm.endowments],
    ['timer', timer.srcPath, timer.endowments],
  ];
  config.vats.set('vattp', { sourcepath: getVatTPSourcePath() });
  config.vats.set('comms', {
    sourcepath: getCommsSourcePath(),
    options: { enablePipelining: true },
  });
  config.vats.set('timer', { sourcepath: getTimerWrapperSourcePath() });

  // 'storage' will be modified in-place as the kernel runs
  const storage = buildStorageInMemory();
  config.hostStorage = storage.storage;

  // kernelStateFile is created in init-basedir.js, should never be missing
  kernelStateFile.withReading(readSync => {
    const lines = new readlines(kernelStateFile.toString(), { readSync });
    let line;
    while ((line = lines.next())) {
      const [key, value] = JSON.parse(line);
      config.hostStorage.set(key, value);
    }
  });

  const controller = await buildVatController(config, withSES, argv);

  async function saveState() {
    const ms = JSON.stringify(mbs.exportToData());
    await mailboxStateFile.atomicReplace(ms);
    kernelStateFile.withWriting('.tmp', fp => {
      for (let [key, value] of storage.map.entries()) {
	const line = JSON.stringify([key, value]);
	fp.writeSync(line);
	fp.writeSync('\n');
      }
    });
  }

  async function processKernel() {
    await controller.run();
    await saveState();
    deliver(mbs);
  }

  async function deliverInboundToMbx(sender, messages, ack) {
    if (!(messages instanceof Array)) {
      throw new Error(`inbound given non-Array: ${messages}`);
    }
    // console.log(`deliverInboundToMbx`, messages, ack);
    if (mb.deliverInbound(sender, messages, ack)) {
      await processKernel();
    }
  }

  async function deliverInboundCommand(obj) {
    // this promise could take an arbitrarily long time to resolve, so don't
    // wait on it
    const p = cm.inboundCommand(obj);
    // TODO: synchronize this somehow, make sure it doesn't overlap with the
    // processKernel() call in deliverInbound()
    await processKernel();
    return p;
  }

  const intervalMillis = 1200;
  // TODO(hibbert) protect against kernel turns that take too long
  // drop calls to moveTimeForward if it's fallen behind, to make sure we don't
  // have two copies of controller.run() executing at the same time.
  function moveTimeForward() {
    const now = Math.floor(Date.now() / intervalMillis);
    if (timer.poll(now)) {
      const p = processKernel();
      p.then(
        _ => console.log(`timer-provoked kernel crank complete ${now}`),
        err =>
          console.log(`timer-provoked kernel crank failed at ${now}:`, err),
      );
    }
  }
  setInterval(moveTimeForward, intervalMillis);

  // now let the bootstrap functions run
  await processKernel();

  return {
    deliverInboundToMbx,
    deliverInboundCommand,
  };
}

export default async function start(basedir, withSES, argv, { createServer }) {
  const mailboxStateFile = basedir.resolve('swingset-mailbox-state.json');
  const kernelStateFile = basedir.resolve('swingset-kernel-state.jsonlines');
  const connections = JSON.parse(
    basedir.join('connections.json').readFileSync(),
  );
  let deliverInboundToMbx;

  function inbound(sender, messages, ack) {
    if (deliverInboundToMbx) {
      deliverInboundToMbx(sender, messages, ack);
    }
  }

  let deliverInboundCommand;
  function command(obj) {
    if (!deliverInboundCommand) {
      return Promise.reject('Not yet ready');
    }
    return deliverInboundCommand(obj);
  }

  let broadcastJSON;
  function broadcast(obj) {
    if (broadcastJSON) {
      broadcastJSON(obj);
    } else {
      console.log(`Called broadcast before HTTP listener connected.`);
    }
  }

  if (false) {
  await Promise.all(
    connections.map(async c => {
      switch (c.type) {
        case 'chain-cosmos-sdk':
          {
            console.log(`adding follower/sender for GCI ${c.GCI}`);
            // c.rpcAddresses are strings of host:port for the RPC ports of several
            // chain nodes
            const deliverator = await connectToChain(
              basedir,
              c.GCI,
              c.rpcAddresses,
              c.myAddr,
              inbound,
              c.chainID,
            );
            addDeliveryTarget(c.GCI, deliverator);
          }
          break;
        case 'http':
          console.log(`adding HTTP/WS listener on ${c.host}:${c.port}`);
  	  console.log('@@http: TODO!'); break;
          if (broadcastJSON) {
            throw new Error(`duplicate type=http in connections.json`);
          }
          broadcastJSON = makeHTTPListener(basedir, c.port, c.host, command, { createServer });
          break;
        default:
          throw new Error(`unknown connection type in ${c}`);
      }
      console.log('@@@after switch');
    }),
  );
  } else {
    console.log('@@http: TODO!');
  }
  console.log('@@@@here.');

  const vatsDir = basedir.join('vats');
  console.log('@@', { vatsDir });
  const d = await buildSwingset(
    mailboxStateFile,
    kernelStateFile,
    withSES,
    vatsDir,
    argv,
    broadcast,
  );
  ({ deliverInboundToMbx, deliverInboundCommand } = d);

  console.log(`swingset running`);

  // Install the bundles as specified.
  const initDir = basedir.join('init-bundles');
  let list = [];
  try {
    list = await initDir.readdir();
  } catch (e) {

  }
  for (const initName of list.sort()) {
    console.log('loading init bundle', initName);
    const initFile = initDir.join(initName);
    if (await bundle(() => '.', ['--evaluate', '--once', '--input', initFile])) {
      return 0;
    }
  }
}
