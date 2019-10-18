import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { insist } from '@agoric/ertp/util/insist';
import makePromise from '@agoric/ertp/util/makePromise';
import { E } from '@agoric/eventual-send';

const DEFAULT_PUBLIC_ACCOUNT_NAME = 'PUBLIC';

/*
acc = home.pledger~.getAccount();
asset = acc~.depositAll(home.gallery~.tapFaucet());
acc~.getBalances();
acc~.withdraw(asset, 'pixels');
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
      const assayBalanceQueue = new Map();
      let nextChange = makePromise();

      const beginPurseChange = assay => {
        if (!assayPurses.has(assay)) {
          assayPurses.set(assay, E(assay).makeEmptyPurse());
        }
        const purseP = assayPurses.get(assay);

        const balanceQ = assayBalanceQueue.get(assay) || [];
        const pc = harden({ purseP });
        balanceQ.push(pc);
        assayBalanceQueue.set(assay, balanceQ);
        return pc;
      };

      const commitPurseChange = async (assay, pc) => {
        const balanceQ = assayBalanceQueue.get(assay);
        insist(balanceQ)`\
Balance queue for ${assay} is nonexistent`;
        if (balanceQ.indexOf(pc) < 0) {
          return;
        }
        insist(assayPurses.get(assay) === pc.purseP)`\
Purse change object does not match assay
`;

        const ad = await E(pc.purseP).getBalance();
        if (balanceQ.indexOf(pc) < 0) {
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
          if (balanceQ.indexOf(pc) < 0) {
            return;
          }
        }

        // We won the race, so do the actual update.
        const balance = { ...ad, assayID: registeredAssays.get(assay) || 'unregistered', };
        while (balanceQ.length) {
          // Shift off ours and all the balanceQ entries before ours.
          if (balanceQ.shift() === pc) {
            break;
          }
        }
        assayBalances.set(assay, balance);
        nextChange.res();
        nextChange = makePromise();
      };

      return harden({
        getBalances() {
          return harden([nextChange.p, [...assayBalances.values()]]);
        },
        async depositAll(payment) {
          const assay = await E(payment).getAssay();
          // Interlock to fix balance update races.
          const pc = beginPurseChange(assay);
          return E(pc.purseP).depositAll(payment)
            .then(assetDesc => {
              commitPurseChange(assay, pc);
              return assetDesc;
            });
        },
        async withdraw(assetDescP, name) {
          const assetDesc = await assetDescP;
          const assay = assetDesc.label.assay;
          const pc = beginPurseChange(assay);
          return E(pc.purseP).withdraw(assetDesc, name)
            .then(payment => {
              commitPurseChange(assay, pc);
              return payment;
            });
        },
      });
    }
    
    let defaultAccount;
    const userFacet = {
      getBalances() {
        return harden(defaultAccount.getBalances());
      },
    };

    const adminFacet = {
      ...userFacet,
      makeUserFacet(name) {
        return harden(userFacet);
      },
      setRegistry(newRegistry) {
        registeredAssays = new WeakMap();
        registry = newRegistry;
      },
      setDefaultAccount(accountName) {
        // TODO: Send balance change notification
        defaultAccount = adminFacet.getAccount(accountName);
      },
      getAccount(accountName = DEFAULT_PUBLIC_ACCOUNT_NAME) {
        accountName = String(accountName);
        if (!(accountName in accounts)) {
          accounts[accountName] = harden(makeAccount());
        }
        if (!defaultAccount) {
          defaultAccount = accounts[accountName];
        }
        return accounts[accountName];
      },
    };

    adminFacet.setDefaultAccount(DEFAULT_PUBLIC_ACCOUNT_NAME);
    return harden(adminFacet);
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
