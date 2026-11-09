// @ts-check

/**
 * @typedef {'screen' | 'collection'} BoardKind
 * @typedef {{getItem(key:string): string | null, setItem(key:string, value:string): void}} BoardStorage
 * @typedef {{screens:string[], collections:string[]}} BoardItems
 */

export const STORAGE_KEYS = Object.freeze({ screen: 'oac-board', collection: 'oac-board-collections' });
export const STORAGE_WARNING = 'Storage unavailable; changes last for this session only';

/** @param {unknown} value @returns {string[]} */
const ids = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string') : []);

/** @param {BoardStorage} storage @param {string} key @returns {string[]} */
function read(storage, key) {
  try {
    return ids(JSON.parse(storage.getItem(key) || '[]'));
  } catch {
    return [];
  }
}

/**
 * The visitor's board. Device mode persists to storage; remote mode holds what a cloud adapter supplies.
 * @param {BoardStorage} storage
 */
export function createBoard(storage) {
  /** @returns {BoardItems} */
  const readDevice = () => ({ screens: read(storage, STORAGE_KEYS.screen), collections: read(storage, STORAGE_KEYS.collection) });
  let items = readDevice();
  let remote = false;
  let warning = '';
  /** @param {BoardKind} kind */
  const listFor = kind => (kind === 'screen' ? items.screens : items.collections);

  return {
    readDevice,
    get remote() { return remote; },
    get warning() { return warning; },
    /** @param {BoardKind} kind @param {string} id */
    has: (kind, id) => listFor(kind).includes(id),
    /** @param {BoardKind} kind */
    list: kind => [...listFor(kind)],
    /**
     * Saves or removes an item and reports whether it is now saved.
     * @param {BoardKind} kind @param {string} id
     */
    toggle(kind, id) {
      const current = listFor(kind);
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      items = kind === 'screen' ? { ...items, screens: next } : { ...items, collections: next };
      if (!remote) {
        try {
          storage.setItem(STORAGE_KEYS[kind], JSON.stringify(next));
          warning = '';
        } catch {
          warning = STORAGE_WARNING;
        }
      }
      return next.includes(id);
    },
    /** @param {unknown} value */
    useRemote(value) {
      const record = /** @type {{screens?:unknown, collections?:unknown} | null} */ (typeof value === 'object' ? value : null);
      remote = true;
      warning = '';
      items = { screens: ids(record?.screens), collections: ids(record?.collections) };
    },
    useDevice() {
      remote = false;
      items = readDevice();
    },
  };
}
