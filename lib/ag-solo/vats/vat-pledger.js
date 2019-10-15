import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { insist } from '@agoric/ertp/util/insist';
import { E } from '@agoric/eventual-send';

/*
me = home.pledger.adminFacet~.getAccount('me');
me~.depositAll(home.gallery~.tapFaucet());
home.pledger.userFacet~.getBalances();
home.registry~.set('pixelAssay', home.gallery~.getAssays()~.pixelAssay)
home.pledger.userFacet~.getBalances();
*/

// This vat contains the private Pledger instance.

function build(_E, _log) {
  const accounts = Object.create(null);

  function getPledger() {
    // TODO: Use third-party handoff instead of registeredAssays.
    let registeredAssays = new WeakMap();
    let registry = { reverseGet(assay) { return undefined; }};

    function makeAccount() {
      // An account consists of unique per-assay purses.
      const assayPurses = new Map();
      const assayBalances = new Map();
      const assayGenerations = new Map();

      const beginPurseChange = async assay => {
        if (!assayPurses.has(assay)) {
          assayPurses.set(assay, await E(assay).makeEmptyPurse());
        }
        const purse = assayPurses.get(assay);

        const curGen = assayGenerations.get(assay);
        const ourGen = curGen ? curGen + 1 : 1;
        assayGenerations.set(assay, Nat(ourGen));
        return { purse, ourGen };
      };

      const commitPurseChange = async (assay, { purse, ourGen }) => {
        if (assayGenerations.get(assay) !== ourGen) {
          return;
        }
        insist(assayPurses.get(assay) === purse)`
Purse change object does not match assay
`;

        const ad = await E(purse).getBalance();
        if (assayGenerations.get(assay) !== ourGen) {
          return;
        }

        insist(ad.label.assay === assay)`\
Balance assay does not match`;

        if (!registeredAssays.has(assay)) {
          // Need to fetch the registered name.
          const aid = await E(registry).reverseGet(assay);
          if (aid) {
            registeredAssays.set(assay, aid);
          }
          if (assayGenerations.get(assay) !== ourGen) {
            return;
          }
        }

        // Still the same generation, so do the actual update.
        const balance = { ...ad, assayID: registeredAssays.get(assay) || 'unregistered', };
        assayBalances.set(assay, balance);
      };

      return harden({
        getBalances() {
          return harden([...assayBalances.values()]);
        },
        async depositAll(payment) {
          const assay = await E(payment).getAssay();
          // Interlock to fix balance update races.
          const pc = await beginPurseChange(assay);
          return E(pc.purse).depositAll(payment)
            .then(async assetDesc => {
              await commitPurseChange(assay, pc);
              return assetDesc;
            });
        },
        async withdrawExactly(assetDesc, name) {
          const labelC = E.C(assetDesc).M.getLabel();
          const assay = await labelC.G.assay.P;
          const pc = await beginPurseChange(assay);
          return E(pc.purse).withdrawExactly(assetDesc, name)
            .then(async payment => {
              await commitPurseChange(assay, pc);
              return payment;
            });
        },
      });
    }
    
    const userFacet = {
      getBalances() {
        const balances = Object.entries(accounts).sort().map(
          ([name, account]) => [name, account.getBalances()]
        );
        return harden(balances);
      },
    };

    const adminFacet = {
      ...userFacet,
      setRegistry(newRegistry) {
        registeredAssays = new WeakMap();
        registry = newRegistry;
      },
      getAccount(accountName) {
        accountName = String(accountName);
        if (!(accountName in accounts)) {
          accounts[accountName] = harden(makeAccount());
        }
        return accounts[accountName];
      },
    };

    return harden({
      userFacet,
      adminFacet,
    });
  }

  return harden({ getPledger });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
