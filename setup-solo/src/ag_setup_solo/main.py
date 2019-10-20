import json
import urllib.request
import logging
from urllib.request import Request as Request_T
from subprocess import CompletedProcess

from typing import (
    Any,
    Callable, Iterable,
    Dict, List, Optional as Opt,
    IO,
    cast,
)

from twisted.internet.task import react  # type: ignore
from twisted.internet import defer  # type: ignore
from twisted.python import usage  # type: ignore

MAILBOX_URL = u"ws://relay.magic-wormhole.io:4000/v1"
# MAILBOX_URL = u"ws://10.0.2.24:4000/v1"
APPID = u"agoric.com/ag-testnet1/provisioning-tool"
NETWORK_CONFIG = "https://testnet.agoric.com/network-config"
# We need this to connect to cloudflare's https.
USER_AGENT = "Mozilla/5.0"

log = logging.getLogger(__name__)


class Path:
    # like pathlib.Path but with rmtree
    def __init__(self, here: str,
                 io_open: Callable[..., IO[Any]],
                 path_join: Callable[[str, str], str],
                 basename: Callable[[str], str],
                 exists: Callable[[str], bool],
                 isdir: Callable[[str], bool],
                 islink: Callable[[str], bool],
                 realpath: Callable[[str], str],
                 samefile: Callable[[str, str], bool],
                 rmtree: Callable[[str], None]) -> None:
        self.here = here
        self.exists: Callable[[], bool] = lambda: exists(here)
        self.is_dir: Callable[[], bool] = lambda: isdir(here)
        self.is_symlink: Callable[[], bool] = lambda: islink(here)
        self.samefile = lambda other: samefile(here, str(other))
        self.open: Callable[[], IO[Any]] = lambda: io_open(here)
        self.rmtree: Callable[[], None] = lambda: rmtree(here)

        def make(there: str) -> Path:
            return Path(there,
                        io_open, path_join, basename, exists,
                        isdir, islink, realpath, samefile,
                        rmtree)

        self.resolve: Callable[[], Path] = lambda: make(realpath(here))
        self.joinpath: Callable[[str], Path] = lambda other: make(
            path_join(here, other))
        self._parent: Callable[[], Path] = lambda: make(basename(here))

    @property
    def parent(self) -> 'Path':
        return self._parent()

    def __truediv__(self, other: str) -> 'Path':
        return self.joinpath(other)


CP = Callable[..., CompletedProcess]
CN = Callable[..., None]


class Runner:
    def __init__(self, prog: str,
                 run: CP,
                 execvp: CN):
        self.__prog = prog
        self.run: CP = lambda args, **kwargs: run([str(prog)] + args, **kwargs)
        self.execvp: CN = lambda args: execvp(str(prog), [str(prog)] + args)

    def __repr__(self) -> str:
        return repr(self.__prog)

    @classmethod
    def locate(cls, start: Path,
               run: CP, execvp: CN,
               name: str = 'ag-solo') -> 'Runner':
        # Locate the ag-solo binary.
        # Look up until we find a different bin directory.
        candidate = start.resolve().parent / '..' / '..'

        prog = candidate / 'bin' / name
        while not prog.exists():
            next_candidate = candidate.parent
            if next_candidate == candidate:
                return cls(name, run, execvp)
            candidate = next_candidate
            prog = candidate / 'bin' / name
        return cls(str(prog), run, execvp)


class Options(usage.Options):  # type: ignore
    def __init__(self, argv: List[str], environ: Dict[str, str]) -> None:
        self.__environ = environ

    optParameters = [
        ["webhost", "h", "127.0.0.1", "client-visible HTTP listening address"],
        ["webport", "p", "8000", "client-visible HTTP listening port"],
        ["netconfig", None, NETWORK_CONFIG, "website for network config"]
    ]

    def parseArgs(self, basedir: Opt[str] = None) -> None:
        environ = self.__environ
        if basedir is None:
            basedir = environ.get('AG_SOLO_BASEDIR', 'agoric')
        assert(basedir)  # mypy isn't too smart
        self['basedir'] = environ['AG_SOLO_BASEDIR'] = basedir


def setIngress(sm: Dict[str, object], ag_solo: Runner) -> None:
    log.info('Setting chain parameters with %s', ag_solo)
    ag_solo.run(['set-gci-ingress', '--chainID=%s' % sm['chainName'],
                 sm['gci'], *cast(List[str], sm['rpcAddrs'])], check=True)


def restart(ag_solo: Runner) -> None:
    log.info('Restarting %s', ag_solo)
    ag_solo.execvp(['start', '--role=client'])


class WormHoleI:
    def input_code(self) -> str: ...

    def send_message(self, msg: bytes) -> None: ...

    def get_message(self) -> Iterable[bytes]: ...

    def close(self) -> Iterable[None]: ...


class WormHoleModI:
    @staticmethod
    def create(APPID: str, MAILBOX_URL: str, reactor: Any) -> WormHoleI: ...

    @staticmethod
    def input_with_completion(prompt: str, code: str,
                              reactor: Any) -> None: ...


@defer.inlineCallbacks  # type: ignore
def run_client(reactor: Any, o: Options, pkeyFile: Path,
               ag_solo: Runner,
               cwd: Path, wormhole: WormHoleModI) -> None:
    def cleanup() -> None:
        try:
            # Delete the basedir if we failed
            (cwd / o['basedir']).rmtree()
        except FileNotFoundError:
            pass

    try:
        # Try to initialize the client
        log.info("initializing ag-solo %s", o['basedir'])
        doInit(o, ag_solo)

        # read the pubkey out of BASEDIR/ag-cosmos-helper-address
        f = pkeyFile.open()
        pubkey = f.read()
        f.close()
        pubkey = pubkey.strip()

        # Use the provisioning code to register our pubkey.
        w = wormhole.create(APPID, MAILBOX_URL, reactor)

        # Ensure cleanup gets called before aborting
        t = reactor.addSystemEventTrigger("before", "shutdown", cleanup)
        yield wormhole.input_with_completion("Provisioning code: ",
                                             w.input_code(), reactor)
        reactor.removeSystemEventTrigger(t)

        cm = json.dumps({
            "pubkey": pubkey,
            })
        w.send_message(cm.encode("utf-8"))
        server_message = yield w.get_message()
        sm = json.loads(server_message.decode("utf-8"))
        log.info("server message is%s", sm)
        yield w.close()

        if not sm['ok']:
            raise Exception("error from server: " + sm['error'])

        setIngress(sm, ag_solo)
    except:  # noqa
        cleanup()
        raise
    restart(ag_solo)


def doInit(o: Options, ag_solo: Runner) -> None:
    BASEDIR = o['basedir']
    # run 'ag-solo init BASEDIR'
    ag_solo.run(['init', BASEDIR,
                 '--webhost=' + o['webhost'], '--webport=' + o['webport']],
                check=True)


def main(argv: List[str],
         environ: Dict[str, str], env_update: Callable[[Dict[str, str]], None],
         cwd: Path,
         run: CP, execvp: CN,
         source_file: Path, input: Callable[[str], str],
         makeRequest: Callable[..., Request_T],
         wormhole: WormHoleModI) -> None:
    o = Options(argv, environ)
    o.parseOptions()
    ag_solo = Runner.locate(source_file, run, execvp, name='ag-solo')
    pkeyFile = cwd / o['basedir'] / 'ag-cosmos-helper-address'
    # If the public key file does not exist, just init and run.
    if not pkeyFile.exists():
        react(run_client, (o, pkeyFile, ag_solo, cwd, wormhole))
        raise SystemExit(1)

    yesno = input('Type "yes" to reset state from ' + o['netconfig'] +
                  ', anything else cancels: ')
    if yesno.strip() != 'yes':
        log.warning('Cancelling!')
        raise SystemExit(1)

    # Download the netconfig.
    log.info('downloading netconfig from', o['netconfig'])
    req = urllib.request.Request(o['netconfig'], data=None,
                                 headers={'User-Agent': USER_AGENT})
    resp = urllib.request.urlopen(req)
    encoding = resp.headers.get_content_charset('utf-8')
    decoded = resp.read().decode(encoding)
    netconfig = json.loads(decoded)

    connections_json = cwd / o['basedir'] / 'connections.json'
    conns = []  # type: List[Dict[str, str]]
    try:
        f = connections_json.open()
        conns = json.loads(f.read())
    except FileNotFoundError:
        pass

    # Maybe just run the ag-solo command if our params already match.
    for conn in conns:
        if 'GCI' in conn and conn['GCI'] == netconfig['gci']:
            log.warning('Already have an entry for %s; not replacing',
                        conn['GCI'])
            restart(ag_solo)
            raise SystemExit(1)

    # Blow away everything except the key file and state dir.
    helperStateDir = cwd / o['basedir'] / 'ag-cosmos-helper-statedir'
    for p in (cwd / o['basedir']).listdir():
        if p.samefile(pkeyFile) or p.samefile(helperStateDir):
            continue
        if p.isdir() and not p.islink():
            p.rmtree()
        else:
            p.remove()

    # Upgrade the ag-solo files.
    doInit(o, ag_solo)

    setIngress(netconfig, ag_solo)
    restart(ag_solo)
    raise SystemExit(1)


if __name__ == '__main__':
    def _script_io() -> None:
        from io import open as io_open
        from os import environ, execvp
        from shutil import rmtree
        from subprocess import run
        from sys import argv
        from urllib.request import Request
        import os.path

        import wormhole  # type: ignore

        cwd = Path('.', io_open, os.path.join, os.path.basename,
                   os.path.exists, os.path.isdir, os.path.islink,
                   os.path.realpath, os.path.samefile, rmtree)
        main(argv[:], environ.copy(), environ.update,
             cwd=cwd,
             run=run, execvp=execvp,
             source_file=cwd / __file__,
             input=input,
             makeRequest=Request,
             wormhole=wormhole)

    _script_io()
