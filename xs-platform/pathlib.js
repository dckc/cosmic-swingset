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

  return harden({
    toString() {
      return filename;
    },
    resolve(...others) {
      // ISSUE: support ../?
      // TODO: chop off filename at last /
      return mk([filename, ...others].join('/'));
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
  });
}
