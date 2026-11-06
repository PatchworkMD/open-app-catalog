const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../site/publication-policy.json');

const views = import('../site/views.js');
const id = c => c.repeat(64);
const screenshot = (c, title = 'Untrusted <b>title</b>') => ({ id: id(c), path: `assets/${id(c)}.png`, title });
const app = {
  id: '42',
  name: 'Two charts',
  category: 'Education',
  categories: ['Education', 'Productivity'],
  chartRank: 3,
  chartRanks: { Education: 3, Productivity: 17 },
  assetIds: [id('a')],
};

function context(overrides = {}) {
  const screens = [screenshot('a'), screenshot('b')];
  return {
    snapshot: { apps: [app], screens, flows: [], elements: [], coverage: { rankBasis: 'original-category-feed' } },
    screenshotById: new Map(screens.map(s => [s.id, s])),
    isSaved: () => false,
    isSelected: () => false,
    resolution: {},
    category: '',
    ...overrides,
  };
}

test('screenshot cards escape listing text and name each action after its screenshot', async () => {
  const { screenCard } = await views;
  const html = screenCard(context({ isSaved: () => true }), screenshot('a'));
  assert.doesNotMatch(html, /<b>/);
  assert.match(
    html,
    /<span class="action-text">Saved<\/span><span class="sr-only"> Untrusted &lt;b&gt;title&lt;\/b&gt;<\/span>/
  );
  assert.match(html, /aria-pressed="true"/);
});

test('an app card shows the chart rank for the selected category only where the app is charted', async () => {
  const { appCard } = await views;
  assert.match(appCard(context(), app), /#3 in Education/);
  assert.match(appCard(context({ category: 'Productivity' }), app), /#17 in Productivity/);
  assert.doesNotMatch(appCard(context({ category: 'Games' }), app), /pinrank/);
  const legacy = context();
  legacy.snapshot.coverage = {};
  assert.doesNotMatch(appCard(legacy, app), /pinrank/);
});

test('media prefers a verified full-size source and ignores untrusted ones', async () => {
  const { media } = await views;
  const full = `https://is1-ssl.mzstatic.com/image/thumb/x/${id('a')}.png/1290x2796bb.png`;
  assert.match(media(context({ resolution: { [id('a')]: full } }), screenshot('a'), true), new RegExp(`src="${full}"`));
  assert.match(
    media(context({ resolution: { [id('a')]: 'https://evil.test/x.png' } }), screenshot('a'), true),
    /src="assets\//
  );
  assert.equal(media(context(), { id: id('c'), path: 'https://evil.test/x.png' }), '<span>Media unavailable</span>');
});

test('the About page states the publication policy', async () => {
  const { aboutDoc } = await views;
  const html = aboutDoc(policy);
  for (const statement of Object.values(policy)) assert(html.includes(statement), statement);
  assert.doesNotMatch(html, /first category encountered|Firebase/);
});
