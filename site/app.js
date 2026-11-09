// @ts-check
import { createBoard } from './board.js';
import policy from './publication-policy.json' with { type: 'json' };
import { mergeReviewedLibrary, readSnapshot } from './snapshot.js';
import {
  aboutDoc,
  appCard,
  appDetail,
  categoriesForApp,
  chartRankIn,
  emptyState,
  esc,
  media,
  pluginDoc,
  reviewedCard,
  reviewedScreenshotIds,
  screenCard,
  screenViewer,
  screenshotsFor,
} from './views.js';

/**
 * @typedef {import('./snapshot.js').App} App
 * @typedef {import('./snapshot.js').Screenshot} Screenshot
 * @typedef {import('./snapshot.js').Collection} Collection
 * @typedef {import('./snapshot.js').UiElement} UiElement
 * @typedef {import('./snapshot.js').Snapshot} Snapshot
 * @typedef {import('./views.js').ScreenViewer} ScreenViewer
 * @typedef {import('./views.js').ReviewedKind} ReviewedKind
 * @typedef {import('./views.js').ReviewedEntry} ReviewedEntry
 * @typedef {{kind: 'app', record: App} | {kind: 'screenshot', record: Screenshot} | ReviewedEntry} CatalogEntry
 * @typedef {{label: string, categories: string[], text: unknown[], rank?: (category: string) => number | undefined}} Facets
 */

/**
 * @template {typeof Element} T
 * @param {string} selector
 * @param {T} type
 * @returns {InstanceType<T>}
 */
function element(selector, type) {
  const found = document.querySelector(selector);

  if (!(found instanceof type)) throw new Error(`Missing ${selector}`);

  return /** @type {InstanceType<T>} */ (found);
}

const ui = {
  hero: element('#hero', HTMLElement),
  heroCopy: element('#hero p:not(.hero-title)', HTMLParagraphElement),
  heroCta: element('.hero-cta', HTMLButtonElement),
  heading: element('.heading', HTMLElement),
  skipLink: element('.skip-link', HTMLAnchorElement),
  title: element('#title', HTMLHeadingElement),
  coverage: element('#coverage', HTMLElement),
  controls: element('#controls', HTMLElement),
  search: element('#search', HTMLInputElement),
  category: element('#category', HTMLSelectElement),
  kind: element('#kind', HTMLSelectElement),
  sort: element('#sort', HTMLSelectElement),
  compare: element('#compare', HTMLButtonElement),
  compareCount: element('#compareCount', HTMLElement),
  exportButton: element('#export', HTMLButtonElement),
  status: element('#status', HTMLElement),
  content: element('#content', HTMLElement),
  more: element('#more', HTMLButtonElement),
  viewer: element('#viewer', HTMLDialogElement),
  viewerTitle: element('#viewerTitle', HTMLElement),
  viewerContent: element('#viewerContent', HTMLElement),
  close: element('#close', HTMLButtonElement),
};

const ROUTES = /** @type {const} */ ({
  apps: 'Apps',
  screens: 'Screens',
  flows: 'Flows',
  elements: 'UI elements',
  boards: 'Saved board',
  agents: 'About & sources',
  plugin: 'Hugging App plugin',
});

/** @typedef {keyof typeof ROUTES} Route */
const PAGE_SIZE = 48;
const MAX_COMPARISON = 4;

/** @param {string} value @returns {value is Route} */
const isRoute = value => Object.hasOwn(ROUTES, value);

/** @returns {Route} */
const route = () => {
  const hash = location.hash.slice(1);

  return isRoute(hash) ? hash : 'apps';
};

/** @param {Route} r @returns {r is 'flows' | 'elements'} */
const isReviewedRoute = r => r === 'flows' || r === 'elements';
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {Snapshot | null} */
let listingSnapshot = null;

/** @type {Snapshot | null} */
let snapshot = null;

/** @type {Map<string, Screenshot>} */
let screenshotById = new Map();

/** @type {'loading' | 'ready' | 'error'} */
let reviewedLibraryState = 'loading';

/** @type {Record<string, string>} */
let resolution = {};

/** @type {ScreenViewer | null} */
let viewer = null;
let limit = PAGE_SIZE;

/** @type {Set<string>} */
const selected = new Set();

const board = createBoard({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});

/** @param {Snapshot} next */
function useSnapshot(next) {
  snapshot = next;
  screenshotById = new Map(next.screens.map(screenshot => [screenshot.id, screenshot]));
}

/** @param {Snapshot} current @returns {import('./views.js').ViewContext} */
const viewContext = current => ({
  snapshot: current,
  screenshotById,
  isSaved: board.has,
  isSelected: id => selected.has(id),
  resolution,
  category: ui.category.value,
});

function refreshBoard() {
  if (snapshot && route() === 'boards') render();
  else syncActions();
}

Object.assign(window, {
  HuggingCatalog: {
    getDeviceBoard: board.readDevice,
    /** @param {unknown} value */
    applyRemoteBoard(value) {
      board.useRemote(value);
      refreshBoard();
    },
    useDeviceBoard() {
      board.useDevice();
      refreshBoard();
    },
  },
});

/** @param {Snapshot} current */
const catalogCategories = current =>
  [
    ...new Set(
      [
        ...current.apps.flatMap(categoriesForApp),
        ...current.screens.map(s => s.category),
        ...current.flows.map(c => c.category),
        ...current.elements.map(e => e.category),
      ].flatMap(category => (category ? [category] : []))
    ),
  ].sort();

/**
 * What filtering and sorting read from an entry. Each kind reads only its own validated fields,
 * so extra fields a record carries from older data cannot change its behavior.
 * @param {CatalogEntry} entry
 * @returns {Facets}
 */
function facets(entry) {
  switch (entry.kind) {
    case 'app': {
      const app = entry.record,
        categories = categoriesForApp(app);

      return {
        label: app.name,
        categories,
        text: [app.id, app.name, ...categories],
        rank: category => chartRankIn(app, category || app.category || ''),
      };
    }

    case 'screenshot': {
      const s = entry.record;

      return { label: s.title ?? '', categories: s.category ? [s.category] : [], text: [s.id, s.title, s.category] };
    }

    default: {
      const r = entry.record;

      return {
        label: r.title,
        categories: r.category ? [r.category] : [],
        text: [r.id, r.title, r.category, r.appName, r.description, ...r.tags],
      };
    }
  }
}

/** @param {CatalogEntry} entry */
function matchesFilters(entry) {
  const query = ui.search.value.toLowerCase().trim(),
    category = ui.category.value,
    { categories, text } = facets(entry);

  const searchable = text
    .filter(part => typeof part === 'string' && part)
    .join(' ')
    .toLowerCase();

  return (!category || categories.includes(category)) && (!query || searchable.includes(query));
}

/** @param {CatalogEntry[]} entries @returns {CatalogEntry[]} */
function filtered(entries) {
  const out = entries.filter(matchesFilters);

  if (ui.sort.value === 'name') return out.sort((a, b) => facets(a).label.localeCompare(facets(b).label));

  if (snapshot?.coverage.rankBasis !== 'original-category-feed') return out;
  const category = ui.category.value;
  /** @param {CatalogEntry} entry */
  const rank = entry => facets(entry).rank?.(category) ?? 999;

  return out.sort((a, b) => rank(a) - rank(b));
}

/** @param {Screenshot[]} screens @returns {CatalogEntry[]} */
const screenshotEntries = screens => screens.map(record => ({ kind: /** @type {const} */ ('screenshot'), record }));

/** @param {Snapshot} current @returns {ReviewedEntry[]} */
const reviewedEntries = current => [
  ...current.flows.map(record => ({ kind: /** @type {const} */ ('flows'), record })),
  ...current.elements.map(record => ({ kind: /** @type {const} */ ('elements'), record })),
];

/** @param {Snapshot} current @param {Route} r @returns {CatalogEntry[]} */
function routeEntries(current, r) {
  switch (r) {
    case 'apps':
      return filtered(current.apps.map(record => ({ kind: /** @type {const} */ ('app'), record })));
    case 'screens':
      return filtered(screenshotEntries(current.screens.filter(s => !s.curatedOnly)));
    case 'boards':
      return filtered(screenshotEntries(current.screens.filter(s => board.has('screen', s.id))));
    case 'flows':
    case 'elements':
      return filtered(reviewedEntries(current).filter(entry => entry.kind === r));
    default:
      return [];
  }
}

/** @param {Snapshot} current @returns {ReviewedEntry[]} */
const boardCollections = current =>
  reviewedEntries(current).filter(
    entry => board.has('collection', `${entry.kind}:${entry.record.id}`) && matchesFilters(entry)
  );

/** @param {import('./views.js').ViewContext} ctx @param {CatalogEntry} entry */
function card(ctx, entry) {
  switch (entry.kind) {
    case 'app':
      return appCard(ctx, entry.record);
    case 'screenshot':
      return screenCard(ctx, entry.record);
    default:
      return reviewedCard(ctx, entry);
  }
}

/** @param {Snapshot} current */
function fillHero(current) {
  const ctx = viewContext(current);

  const covers = [...current.apps]
    .sort((a, b) => (a.chartRank ?? 999) - (b.chartRank ?? 999))
    .flatMap(app => screenshotsFor(ctx, app.assetIds).slice(0, 1));

  document.querySelectorAll('.float-card').forEach((node, i) => {
    if (covers[i]) node.innerHTML = media(ctx, covers[i]);
  });
  const listed = listingSnapshot?.screens.length ?? current.screens.length;
  ui.heroCopy.textContent = `Up to 100 free-chart apps per category. ${current.apps.length.toLocaleString()} apps and ${listed.toLocaleString()} listing screenshots to explore.`;
}

function render() {
  if (!snapshot) return;

  const current = snapshot,
    r = route(),
    informational = r === 'agents' || r === 'plugin';

  document.querySelectorAll('nav a').forEach(link => {
    if (!(link instanceof HTMLAnchorElement)) return;
    const on = link.hash === '#' + r;
    link.classList.toggle('active', on);

    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  ui.hero.hidden = r !== 'apps';
  ui.title.textContent = ROUTES[r];
  ui.controls.hidden = informational;
  ui.exportButton.hidden = informational;
  ui.kind.disabled = true;
  const built = new Date(current.coverage.generatedAt ?? '');
  const builtLabel = Number.isNaN(built.getTime()) ? 'date unavailable' : built.toLocaleString();
  ui.coverage.textContent = `${current.apps.length.toLocaleString()} apps · ${current.screens.length.toLocaleString()} screenshots · Snapshot ${builtLabel} · US App Store`;
  ui.compareCount.textContent = String(selected.size);

  if (informational) {
    ui.content.className = '';
    ui.content.innerHTML = r === 'plugin' ? pluginDoc() : aboutDoc(policy);
    ui.status.textContent = '';
    ui.more.hidden = true;

    return;
  }

  if (isReviewedRoute(r) && reviewedLibraryState !== 'ready') {
    ui.content.className = 'grid';
    ui.more.hidden = true;
    ui.exportButton.disabled = true;
    const loading = reviewedLibraryState === 'loading';
    ui.status.textContent = loading ? 'Loading reviewed references…' : 'Reviewed references unavailable';
    ui.content.innerHTML = loading
      ? '<p role="status">Loading reviewed references…</p>'
      : '<div class="empty"><h2>These references could not load.</h2><p>The app catalog is still available. Try loading the reviewed library again.</p><button data-retry-reviewed>Try again</button></div>';

    return;
  }

  ui.exportButton.disabled = false;
  const ctx = viewContext(current);

  const records = routeEntries(current, r),
    collections = r === 'boards' ? boardCollections(current) : [];

  const where = r === 'boards' ? (board.remote ? ' · synced board' : ' · saved on this device') : '';
  ui.status.textContent = `${(records.length + collections.length).toLocaleString()} results${where}${board.warning ? ' · ' + board.warning : ''}`;
  ui.more.hidden = records.length <= limit;
  ui.content.className = isReviewedRoute(r) || collections.length ? 'grid curated-grid' : 'grid';

  const cards = [
    ...collections.map(entry => reviewedCard(ctx, entry)),
    ...records.slice(0, limit).map(record => card(ctx, record)),
  ];

  ui.content.innerHTML = cards.length ? cards.join('') : `<div class="empty">${emptyState(r, ROUTES[r])}</div>`;
}

function showViewer() {
  if (!ui.viewer.open) ui.viewer.showModal();
}

function renderScreen() {
  if (!snapshot || !viewer) return;

  const current = snapshot,
    returnAppId = viewer.returnAppId;

  const returnApp = returnAppId ? (current.apps.find(app => app.id === returnAppId) ?? null) : null;
  ui.viewerTitle.textContent = viewer.title;
  ui.viewerContent.innerHTML = screenViewer(viewContext(current), viewer, returnApp);
  ui.viewerContent.scrollTop = 0;
  ui.viewerContent
    .querySelector('.screen-thumbnails [aria-current="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** @param {ScreenViewer} next */
function openScreens(next) {
  if (!next.screenshots.length) return;
  viewer = next;
  ui.viewer.classList.add('screen-viewer');
  renderScreen();
  showViewer();
}

/** @param {string} id @param {string | null} returnAppId */
function view(id, returnAppId) {
  if (!snapshot) return;
  const screenshot = screenshotById.get(id);

  if (!screenshot) return;
  const app = snapshot.apps.find(a => a.assetIds.includes(id));
  const screenshots = app ? screenshotsFor(viewContext(snapshot), app.assetIds) : [screenshot];
  openScreens({
    screenshots,
    index: Math.max(
      0,
      screenshots.findIndex(s => s.id === id)
    ),
    title: app?.name || screenshot.title || 'Screenshot',
    context: app ? `${app.category || 'App Store'} · App Store listing screenshots` : '',
    returnAppId,
  });
}

/** @param {App} app @param {string | null} [focusScreenId] */
function openApp(app, focusScreenId = null) {
  if (!snapshot) return;
  const ctx = viewContext(snapshot);
  viewer = null;
  ui.viewer.classList.remove('screen-viewer');
  ui.viewerTitle.textContent = app.name;
  ui.viewerContent.innerHTML = appDetail(ctx, app, screenshotsFor(ctx, app.assetIds));
  showViewer();

  if (focusScreenId)
    requestAnimationFrame(() => {
      const target = [...ui.viewerContent.querySelectorAll('.app-detail-image')].find(
        button => button instanceof HTMLElement && button.dataset.view === focusScreenId
      );

      if (!(target instanceof HTMLElement)) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
    });
}

/** @param {string} id @param {string | undefined} kind */
function viewReviewed(id, kind) {
  if (!snapshot || (kind !== 'flows' && kind !== 'elements')) return;
  const entry = reviewedEntries(snapshot).find(item => item.kind === kind && item.record.id === id);

  if (!entry) return;
  const { record } = entry;
  openScreens({
    screenshots: screenshotsFor(viewContext(snapshot), reviewedScreenshotIds(entry)),
    index: 0,
    title: record.title,
    context:
      entry.kind === 'flows'
        ? "Listing collection · interaction order unverified. Shown in the curator's order."
        : `${record.description || 'Reviewed interface pattern'} · Reviewed ${record.reviewedAt || 'date unavailable'}`,
    returnAppId: null,
  });
}

function syncActions() {
  document.querySelectorAll('[data-save],[data-select],[data-save-collection]').forEach(button => {
    if (!(button instanceof HTMLElement)) return;
    const { saveCollection, save, select } = button.dataset;

    const on = saveCollection
      ? board.has('collection', saveCollection)
      : save
        ? board.has('screen', save)
        : selected.has(select ?? '');

    const text = saveCollection
      ? on
        ? 'Saved'
        : 'Save collection'
      : save
        ? on
          ? 'Saved'
          : 'Save'
        : on
          ? 'Selected'
          : 'Compare';

    const label = button.querySelector('.action-text');

    if (label) label.textContent = text;
    else button.textContent = text;
    button.setAttribute('aria-pressed', String(on));
  });
  ui.compareCount.textContent = String(selected.size);
}

/** @param {unknown} value @param {string} name */
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** @param {'screen' | 'collection'} kind @param {string} id */
function toggleSaved(kind, id) {
  const saved = board.toggle(kind, id);

  if (board.remote) window.dispatchEvent(new CustomEvent('hugging:board-change', { detail: { kind, id, saved } }));

  if (route() === 'boards') render();
  syncActions();

  if (board.warning) ui.status.textContent = board.warning;
}

/** @param {string} id */
function toggleSelected(id) {
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < MAX_COMPARISON) selected.add(id);
  else {
    ui.status.textContent = 'Compare up to four screenshots at a time';

    return;
  }

  syncActions();
}

/** @param {number} index @param {string} focusSelector */
function stepViewer(index, focusSelector) {
  if (!viewer || index < 0 || index >= viewer.screenshots.length) return;
  viewer.index = index;
  renderScreen();
  const next = ui.viewerContent.querySelector(focusSelector);

  const target =
    next instanceof HTMLButtonElement && !next.disabled
      ? next
      : ui.viewerContent.querySelector('.screen-thumbnails [aria-current="true"]');

  if (target instanceof HTMLElement) target.focus({ preventScroll: true });
}

const ACTIONS =
  '[data-save],[data-save-collection],[data-select],[data-view],[data-related],[data-collection],[data-reset],[data-step],[data-thumb],[data-retry-reviewed],[data-back-app],[data-reload]';

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest(ACTIONS) : null;

  if (!(button instanceof HTMLElement)) return;
  const d = button.dataset;

  if ('reload' in d) return location.reload();

  if (!snapshot) return;
  const current = snapshot;

  if ('retryReviewed' in d) loadReviewedLibrary();
  else if (d.thumb !== undefined && viewer) stepViewer(Number(d.thumb), `[data-thumb="${d.thumb}"]`);
  else if (d.step !== undefined && viewer) stepViewer(viewer.index + Number(d.step), `[data-step="${d.step}"]`);
  else if ('reset' in d) {
    ui.search.value = '';
    ui.category.value = '';
    limit = PAGE_SIZE;
    render();
  } else if (d.saveCollection) toggleSaved('collection', d.saveCollection);
  else if (d.save) toggleSaved('screen', d.save);
  else if (d.select) toggleSelected(d.select);
  else if (d.view) view(d.view, d.returnApp || null);
  else if (d.backApp) {
    const app = current.apps.find(item => item.id === d.backApp);

    if (app) openApp(app, viewer?.screenshots[viewer.index]?.id ?? null);
  } else if (d.collection) viewReviewed(d.collection, d.collectionKind);
  else if (d.related) {
    const app = current.apps.find(item => item.id === d.related);

    if (app) openApp(app);
  }
});

ui.skipLink.addEventListener('click', event => {
  event.preventDefault();
  ui.title.focus();
});

ui.heroCta.addEventListener('click', () =>
  ui.heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
);

ui.compare.addEventListener('click', () => {
  if (!snapshot) return;

  if (selected.size < 2) {
    ui.status.textContent = 'Select at least two screenshots to compare';

    return;
  }

  const ctx = viewContext(snapshot);
  viewer = null;
  ui.viewer.classList.remove('screen-viewer');
  ui.viewerTitle.textContent = 'Compare references';
  ui.viewerContent.innerHTML = `<div class="comparegrid">${snapshot.screens
    .filter(s => selected.has(s.id))
    .map(s => screenCard(ctx, s))
    .join('')}</div>`;
  showViewer();
});

document.addEventListener('keydown', event => {
  if (!ui.viewer.open || !viewer || event.altKey || event.ctrlKey || event.metaKey) return;

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  )
    return;
  event.preventDefault();
  stepViewer(viewer.index + (event.key === 'ArrowRight' ? 1 : -1), '.screen-thumbnails [aria-current="true"]');
});

ui.viewer.addEventListener('close', () => {
  viewer = null;
  ui.viewer.classList.remove('screen-viewer');
});

ui.close.addEventListener('click', () => ui.viewer.close());

ui.viewer.addEventListener('click', event => {
  if (event.target === ui.viewer) ui.viewer.close();
});

ui.more.addEventListener('click', () => {
  limit += PAGE_SIZE;
  render();
});

for (const control of [ui.search, ui.category, ui.kind, ui.sort])
  control.addEventListener('input', () => {
    limit = PAGE_SIZE;
    render();
  });

window.addEventListener('hashchange', () => {
  ui.viewer.close();
  limit = PAGE_SIZE;
  ui.search.value = '';
  ui.kind.value = '';
  ui.category.value = '';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
});

ui.exportButton.addEventListener('click', () => {
  const r = route();

  if (!snapshot || r === 'agents' || r === 'plugin') return;

  const collections =
    r === 'boards' ? boardCollections(snapshot).map(({ kind, record }) => ({ kind, ...record })) : undefined;

  download(
    {
      name: 'Hugging App references',
      exportedAt: new Date().toISOString(),
      coverage: snapshot.coverage,
      route: r,
      records: routeEntries(snapshot, r).map(entry => entry.record),
      ...(collections ? { collections } : {}),
    },
    `hugging-app-${r}.json`
  );
});

document.addEventListener(
  'load',
  event => {
    if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-catalog-media'))
      event.target.classList.add('loaded');
  },
  true
);

document.addEventListener(
  'error',
  event => {
    const image = event.target;

    if (!(image instanceof HTMLImageElement)) return;

    if (image.hasAttribute('data-catalog-icon'))
      image.replaceWith(Object.assign(document.createElement('div'), { className: 'icon-ph' }));

    if (!image.hasAttribute('data-catalog-media')) return;
    const preview = image.dataset.preview;
    const source = image.currentSrc || image.getAttribute('src') || '';

    if (
      preview &&
      /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\/image\/thumb\//.test(source) &&
      image.dataset.previewAttempted !== 'true'
    ) {
      image.dataset.previewAttempted = 'true';
      image.removeAttribute('srcset');
      image.src = preview;

      return;
    }

    image.replaceWith(
      Object.assign(document.createElement('span'), {
        className: 'media-unavailable',
        textContent: 'Image unavailable',
      })
    );
  },
  true
);

/** @param {Snapshot} current */
function fillCategories(current) {
  const chosen = ui.category.value;
  ui.category.innerHTML =
    '<option value="">All categories</option>' +
    catalogCategories(current)
      .map(c => `<option>${esc(c)}</option>`)
      .join('');
  ui.category.value = chosen;
}

/** @param {string} url */
async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  return /** @type {unknown} */ (await response.json());
}

async function loadReviewedLibrary() {
  reviewedLibraryState = 'loading';
  render();

  try {
    if (!listingSnapshot) return;
    const merged = mergeReviewedLibrary(listingSnapshot, await fetchJson('curation.json'));
    useSnapshot(merged);
    fillCategories(merged);
    reviewedLibraryState = 'ready';
    fillHero(merged);
  } catch {
    reviewedLibraryState = 'error';
  }

  render();
}

async function start() {
  ui.exportButton.disabled = true;
  ui.content.className = 'grid';
  ui.content.innerHTML = Array(12).fill('<div class="skel" aria-hidden="true"></div>').join('');

  try {
    const [sources, listing] = await Promise.all([
      fetchJson('image-sources.json').catch(() => ({})),
      fetchJson('data.json'),
    ]);

    resolution =
      sources && typeof sources === 'object' && !Array.isArray(sources)
        ? Object.fromEntries(Object.entries(sources).filter(([, url]) => typeof url === 'string'))
        : {};
    listingSnapshot = readSnapshot(listing);
    useSnapshot(listingSnapshot);
  } catch {
    ui.hero.hidden = true;
    ui.coverage.textContent = 'The catalog could not load.';
    ui.content.innerHTML =
      '<div class="empty"><h2>We could not load the catalog.</h2><p>Your board remains on this device.</p><button data-reload>Try again</button></div>';

    return;
  }

  fillCategories(listingSnapshot);
  fillHero(listingSnapshot);
  render();
  ui.exportButton.disabled = false;
  loadReviewedLibrary();
}

start();
