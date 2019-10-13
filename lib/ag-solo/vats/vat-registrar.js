import harden from '@agoric/harden';
import { makeRegistrar } from '@agoric/ertp/more/registrar/registrar';

// This vat contains the handoff service for the demo.

function build(E, log) {
  const sharedRegistrar = makeRegistrar();

  function getSharedRegistrar() {
    return sharedRegistrar;
  }

  return harden({ getSharedRegistrar: getSharedRegistrar });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
