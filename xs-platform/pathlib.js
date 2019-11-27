const harden = x => Object.freeze(x, true);

export function makePath(filename, { File, Iterator }) {
  const mk = there => makePath(there, { File, Iterator });

  function readFileSync() {
    let file;
    try {
      file = new File(filename);
    } catch(oops) {
      // not sure why xs loses error messages, but without logging, we just get:
      // xs-platform/pathlib.js:21: exception: throw!
      console.log({ filename, message: oops.message });
      throw(new Error(`${filename}: ${oops.message}`));
    }
    const contents = file.read(String);
    file.close();
    return contents;
  }

  function withWriting(suffix, thunk) {
    const tmpName = filename + suffix;
    const file = new File(tmpName, true);
    const fp = harden({
      writeSync(value) {
	file.write(value);
      }
    });
    try {
      thunk(fp);
    } finally {
      file.close();
    }
    File.rename(tmpName, filename);
  }

  function atomicReplace(contents) {
    return new Promise(
      (resolve, reject) => {
	try {
	  const tmp = mk(filename + '.tmp');
	  const tmpF = new File(tmp, true);
	  tmpF.write(contents);
	  tmpF.close();
	  File.rename(tmp, filename);
	} catch(oops) {
	  reject(oops);
	  return;
	}
	resolve();
      });
  }

  function readdirSync(options) {
    const dirIter = new Iterator(filename);
    let item;
    const items = [];
    while ((item = dirIter.next())) {
      const f = typeof item.length === 'number';
      items.push(harden({
	name: item.name,
	isFile: () => f,
      }));
    }
    return items;
  }

  function readdir() {
    return new Promise((resolve, reject) => {
      try {
	const names = readdirSync({}).map(item => item.name);
	resolve(names);
      } catch (oops) {
	reject(oops);
      }
    });
  }

  function butLast(p) {
    const pos = p.lastIndexOf('/');
    return pos >= 0 ? p.slice(0, pos + 1) : p;
  }

  function bundleSource() {
    let bundlePath;
    const parts = filename.match(/vat(-)([^\.]+).js$/);
    if (parts) {
      bundlePath = `${butLast(filename)}vat_${parts[2]}-src.js`;
    } else if (filename.match(/\/bootstrap.js$/)) {
      bundlePath = `${butLast(filename)}bootstrap-src.js`;
    } else {
      throw new Error(`expected vat-NAME.js; got: ${filename}`);
    }
    console.log(`@@bundleSource ${filename} -> ${bundlePath}`);
    const src = mk(bundlePath).readFileSync();
    return {
      source: src.replace(/^export default /, ''),
      sourceMap: `//# sourceURL=${filename}\n`,
    };
  }

  return harden({
    toString() {
      return filename;
    },
    resolve(...others) {
      // ISSUE: support ../?
      return mk([butLast(filename), ...others].join('/'));
    },
    join(...others) {
      // ISSUE: support ../?
      return mk([filename, ...others].join('/'));
    },
    statSync() {
      new File(filename);
      return harden({});
    },
    readFileSync,
    readlinesSync() {
      return readFileSync().replace(/\n$/, '').split('\n');
    },
    readdirSync,
    readdir,
    bundleSource,
    atomicReplace,
    withWriting,
  });
}
