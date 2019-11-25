const harden = x => Object.freeze(x, true);

export function makePath(filename, { File, Iterator }) {
  const mk = there => makePath(there, { File, Iterator });

  return harden({
    resolve(...others) {
      // ISSUE: support ../?
      // TODO: chop off filename at last /
      return mk([filename, ...others].join('/'));
    },
    join(...others) {
      // ISSUE: support ../?
      return mk([filename, ...others].join('/'));
    },
    readFileSync() {
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
    },
  });
}
