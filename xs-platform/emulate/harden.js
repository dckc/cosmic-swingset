// xs seems to have a harden work-alike built-in.
// https://github.com/Moddable-OpenSource/moddable/blob/public/documentation/xs/preload.md#deep-freezing
export default function harden(root) {
  return Object.freeze(root, true);
}
