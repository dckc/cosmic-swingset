// TODO: Publish as '@pledger/web-bridge'
function createPledgerBridge(startSession, ourID = 'dapp', origin = 'http://localhost:8000') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('hidden', 'hidden');

  const bridgeURL = `${origin}/pledger-bridge.html`;
  document.body.prepend(iframe);

  fetch(bridgeURL, { mode: 'no-cors'})
    .then(res => {
      console.log(`Pledger bridge exists at ${bridgeURL}`);

      // We found the bridge, so begin the conversation.
      iframe.setAttribute('src', bridgeURL);
      iframe.addEventListener('load', _ => {
        console.log('Pledger loaded');
        sendPledger({ type: 'PLEDGER_CONNECT' });
      });
    })  
  .catch(rej => {
    // We can't find the bridge, so reject.
    console.log('Pledger bridge failed', rej);
    startSession(() => Promise.reject(rej));
  });

  const sendPledger = obj => {
    iframe.contentWindow.postMessage(obj, "*");
  };

  let dispatch;
  let disconnected;
  window.addEventListener('message', ev => {
    if (origin !== ev.origin) {
      return;
    }
    const obj = ev.data;
    console.log('Pledger sent', obj);
    switch (obj.type) {
      case 'PLEDGER_DISCONNECTED':
        if (dispatch) {
          dispatch({ type: 'CTP_ABORT', exception: Error(`Pledger is disconnected`), });
        }
        dispatch = undefined;
        break;
      case 'PLEDGER_CONNECTED': {
        let getBootstrap;
        ({ dispatch, getBootstrap } = makeCapTP(ourID, sendPledger));
        startSession(getBootstrap);
        break;
      }
      default: {
        if (dispatch) {
          dispatch(obj);
        }
      }
    }
  });
}
