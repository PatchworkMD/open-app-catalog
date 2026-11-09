const { test } = require('node:test');
const assert = require('node:assert/strict');

const boardModule = import('../site/board.js');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
}

test('a device board saves and removes screenshots and collections under the existing keys', async () => {
  const { createBoard } = await boardModule;
  const storage = memoryStorage();
  const board = createBoard(storage);
  assert.equal(board.toggle('screen', 'shot-1'), true);
  assert.equal(board.toggle('collection', 'flows:welcome'), true);
  assert.equal(board.has('screen', 'shot-1'), true);
  assert.equal(storage.values.get('oac-board'), '["shot-1"]');
  assert.equal(storage.values.get('oac-board-collections'), '["flows:welcome"]');
  assert.equal(board.toggle('screen', 'shot-1'), false);
  assert.equal(storage.values.get('oac-board'), '[]');
  assert.deepEqual(createBoard(storage).list('collection'), ['flows:welcome']);
});

test('a corrupt or unreadable device board starts empty', async () => {
  const { createBoard } = await boardModule;
  assert.deepEqual(createBoard(memoryStorage({ 'oac-board': '{not json' })).list('screen'), []);
  assert.deepEqual(createBoard(memoryStorage({ 'oac-board': '{"a":1}' })).list('screen'), []);
  const denied = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {},
  };
  assert.deepEqual(createBoard(denied).list('screen'), []);
});

test('denied storage keeps the change for the session and reports a warning until a save succeeds', async () => {
  const { createBoard, STORAGE_WARNING } = await boardModule;
  let deny = true;
  const storage = memoryStorage();
  const board = createBoard({
    getItem: storage.getItem,
    setItem: (k, v) => {
      if (deny) throw new Error('denied');
      storage.setItem(k, v);
    },
  });
  assert.equal(board.toggle('screen', 'shot-1'), true);
  assert.equal(board.has('screen', 'shot-1'), true);
  assert.equal(board.warning, STORAGE_WARNING);
  deny = false;
  board.toggle('screen', 'shot-2');
  assert.equal(board.warning, '');
});

test('a remote board never writes to device storage and switching back restores the device board', async () => {
  const { createBoard } = await boardModule;
  const storage = memoryStorage({ 'oac-board': '["device-shot"]' });
  const board = createBoard(storage);
  board.useRemote({ screens: ['cloud-shot', 7], collections: 'bad' });
  assert.equal(board.remote, true);
  assert.deepEqual(board.list('screen'), ['cloud-shot']);
  assert.deepEqual(board.list('collection'), []);
  board.toggle('screen', 'cloud-2');
  assert.equal(storage.values.get('oac-board'), '["device-shot"]');
  board.useDevice();
  assert.equal(board.remote, false);
  assert.deepEqual(board.list('screen'), ['device-shot']);
});
