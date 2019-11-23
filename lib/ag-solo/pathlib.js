import { promisify } from 'util';

export default function makeNodePath(filename, { fs, path, temp }) {
  const fsWrite = promisify(fs.write);
  const fsClose = promisify(fs.close);
  const rename = promisify(fs.rename);
  const unlink = promisify(fs.unlink);

  const make = there => makeNodePath(there, { fs, path, temp });

  function openSync(fn, mode) {
    const fd = fs.openSync(fn, mode);

    return Object.freeze({
      writeSync(data) {
	fs.writeSync(fd, data);
      },
      readSync(...options) {
	fs.readSync(fd, ...options);
      },
      closeSync() {
	fs.closeSync(fd);
      },
    });
  }

  function withWriting(suffix, thunk) {
    const tmpfn = `${filename}${suffix}`;
    const fp = openSync(tmpfn, 'w');
    thunk(fp);
    fp.closeSync();
    fs.renameSync(tmpfn, filename);
  }

  function withReading(thunk) {
    const fp = openSync(filename, 'r');
    thunk(fp.readSync);
    fp.closeSync();
  }

  async function atomicReplace(contents) {
    const info = await new Promise((resolve, reject) => {
      temp.open(
	{
          dir: path.dirname(filename),
          prefix: `${path.basename(filename)}.`,
	},
	(err, inf) => {
          if (err) {
            reject(err);
            return;
            }
          resolve(inf);
	},
      );
    });
    try {
      // Write the contents, close, and rename.
      await fsWrite(info.fd, contents);
      await fsClose(info.fd);
      await rename(info.path, filename);
    } catch (e) {
      // Unlink on error.
      try {
	await unlink(info.path);
      } catch (e2) {
	// do nothing, we're already failing
      }
      throw e;
    }
  }

  return Object.freeze({
    toString() {
      return filename;
    },
    join(...others) {
      // console.log('join', { others });
      return make(path.join(filename, ...others));
    },
    resolve(...others) {
      // console.log('resolve', { others });
      return make(path.resolve(filename, ...others));
    },
    statSync() {
      // console.log('statSync', { filename });
      return fs.statSync(filename);
    },
    realpathSync() {
      // console.log('realpathSync', { filename });
      return make(fs.realpathSync(filename));
    },
    readFileSync() {
      return fs.readFileSync(filename);
    },
    readdir() {
      return fs.promises.readdir(filename);
    },
    readdirSync(options) {
      return fs.readdirSync(filename, options);
    },
    withWriting,
    atomicReplace,
  });
}
