// @ts-check
import { isAppleSourceUrl, isAssetPath, isFullSizeUrl } from './snapshot.js';

/**
 * @typedef {import('./snapshot.js').App} App
 * @typedef {import('./snapshot.js').Screenshot} Screenshot
 * @typedef {import('./snapshot.js').Collection} Collection
 * @typedef {import('./snapshot.js').UiElement} UiElement
 * @typedef {import('./snapshot.js').Snapshot} Snapshot
 * @typedef {'flows' | 'elements'} ReviewedKind
 * @typedef {{
 *   snapshot: Snapshot,
 *   screenshotById: Map<string, Screenshot>,
 *   isSaved: (kind: 'screen' | 'collection', id: string) => boolean,
 *   isSelected: (id: string) => boolean,
 *   resolution: Record<string, string>,
 *   category: string,
 * }} ViewContext
 * @typedef {{screenshots: Screenshot[], index: number, title: string, context: string, returnAppId: string | null}} ScreenViewer
 * @typedef {{board: string, categories: string}} PublicationPolicy
 */

/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @param {unknown} value */
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ENTITIES[c] ?? c);

/** @param {App} app */
export const categoriesForApp = app => (app.categories.length ? app.categories : app.category ? [app.category] : []);

/** @param {ViewContext} ctx @param {readonly string[]} ids */
export const screenshotsFor = (ctx, ids) =>
  ids.flatMap(id => {
    const screenshot = ctx.screenshotById.get(id);
    return screenshot ? [screenshot] : [];
  });

/** @param {string | undefined} url */
export const sourceLink = url =>
  isAppleSourceUrl(url)
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View on the App Store ↗</a>`
    : '';

/** @param {ViewContext} ctx @param {Screenshot} screenshot @param {boolean} [fullSize] */
export function media(ctx, screenshot, fullSize = false) {
  const candidate = screenshot.fullSizeUrl || ctx.resolution[screenshot.id] || '';
  const full = isFullSizeUrl(candidate) ? candidate : '';
  const preview = screenshot.path;
  if (!isAssetPath(preview)) return '<span>Media unavailable</span>';
  const src = fullSize && full ? full : preview;
  const srcset =
    !fullSize && full
      ? ` srcset="${esc(preview)} 1x, ${esc(full.replace('1290x2796bb.png', '640x1386bb.jpg'))} 2x"`
      : '';
  return `<img data-catalog-media src="${esc(src)}"${srcset} data-preview="${esc(preview)}" loading="eager" alt="${esc(screenshot.title || 'App Store screenshot')}">`;
}

/** @param {App} app */
const appIcon = app =>
  app.iconPath
    ? `<img class="icon" data-catalog-icon src="${esc(app.iconPath)}" loading="eager" alt="">`
    : '<div class="icon-ph"></div>';

/** @param {string} text @param {string} item */
const actionText = (text, item) => `<span class="action-text">${text}</span><span class="sr-only"> ${esc(item)}</span>`;

/** @param {ViewContext} ctx @param {string} id @param {string} item */
const screenActions = (ctx, id, item) => {
  const saved = ctx.isSaved('screen', id),
    selected = ctx.isSelected(id);
  return `<button data-save="${esc(id)}" aria-pressed="${saved}">${actionText(saved ? 'Saved' : 'Save', item)}</button><button data-select="${esc(id)}" aria-pressed="${selected}">${actionText(selected ? 'Selected' : 'Compare', item)}</button>`;
};

/** @param {ViewContext} ctx @param {Screenshot} screenshot */
export function screenCard(ctx, screenshot) {
  const label = screenshot.title || 'screenshot';
  return `<article class="pin"><button class="pinmedia screen-open" data-view="${esc(screenshot.id)}" aria-label="Open ${esc(label)}">${media(ctx, screenshot)}</button><p class="pincaption">${esc(screenshot.title || 'Screenshot')}</p><span class="pinmeta">${esc(screenshot.category || 'App Store')}</span><div class="pinactions">${screenActions(ctx, screenshot.id, label)}</div></article>`;
}

/** @param {Collection | UiElement} record @returns {string[]} */
export const reviewedScreenshotIds = record => ('assetIds' in record ? record.assetIds : [record.screenId]);

/** @param {ViewContext} ctx @param {Collection | UiElement} record @param {ReviewedKind} kind */
export function reviewedCard(ctx, record, kind) {
  const ids = reviewedScreenshotIds(record);
  const screenshots = screenshotsFor(ctx, ids);
  const collectionId = `${kind}:${record.id}`,
    saved = ctx.isSaved('collection', collectionId);
  const actions =
    kind === 'flows'
      ? `<button data-save-collection="${esc(collectionId)}" aria-pressed="${saved}">${actionText(saved ? 'Saved' : 'Save collection', record.title)}</button>`
      : ids.map(id => screenActions(ctx, id, record.title)).join('');
  const meta = [
    record.category || 'Reviewed reference',
    record.appName,
    `${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  return `<article class="pin collection-card collection-${kind}"><button class="collection-open" data-collection="${esc(record.id)}" data-collection-kind="${kind}" aria-label="Open ${esc(record.title)}"><div class="collection-previews">${screenshots.map(s => `<span>${media(ctx, s)}</span>`).join('')}</div><span class="pincaption">${esc(record.title)}</span><span class="pinmeta">${meta}</span><p class="collection-description">${esc(record.description || '')}</p></button><div class="pinactions">${actions}</div></article>`;
}

/** @param {App} app @param {string} category */
export const chartRankIn = (app, category) =>
  app.chartRanks[category] ?? (category === app.category ? app.chartRank : undefined);

/** @param {ViewContext} ctx @param {App} app */
export function appCard(ctx, app) {
  const cover = screenshotsFor(ctx, app.assetIds)[0];
  const category = ctx.category || app.category || '';
  const rank = ctx.snapshot.coverage.rankBasis === 'original-category-feed' ? chartRankIn(app, category) : undefined;
  const badge = rank !== undefined ? `<span class="pinrank">#${rank} in ${esc(category)}</span>` : '';
  const labels = ctx.category ? [ctx.category] : categoriesForApp(app);
  return `<article class="pin"><button class="app-open" data-related="${esc(app.id)}" aria-label="Open ${esc(app.name)}"><div class="pinmedia">${cover ? media(ctx, cover) : `<div class="pinfallback">${appIcon(app)}</div>`}${badge}</div><span class="pincaption">${esc(app.name)}</span><span class="pinmeta">${esc(labels.join(' · ') || 'App Store')}</span></button></article>`;
}

/** @param {ViewContext} ctx @param {App} app @param {Screenshot[]} screenshots */
export function appDetail(ctx, app, screenshots) {
  const source = sourceLink(app.url);
  const links = [
    source,
    source && screenshots.length ? `<a href="/apps/${encodeURIComponent(app.id)}/">Open reference page ↗</a>` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const rating = app.rating !== undefined ? ` · ${app.rating.toFixed(1)} / 5 App Store rating` : '';
  const count = `${screenshots.length} listing screenshot${screenshots.length === 1 ? '' : 's'}`;
  const summary = `<div class="app-detail-summary"><p>${links}</p><p class="coverage">${esc(categoriesForApp(app).join(' · ') || 'App Store')} · ${count}${rating}</p></div>`;
  const cards = screenshots.map(
    (s, i) =>
      `<article class="app-detail-card"><button class="app-detail-image" data-view="${esc(s.id)}" data-return-app="${esc(app.id)}" aria-label="Open app screenshot ${i + 1}">${media(ctx, { ...s, title: `Screenshot ${i + 1}` })}</button><div class="app-detail-caption"><span>Screenshot ${i + 1}</span><div class="pinactions">${screenActions(ctx, s.id, s.title || app.name)}</div></div></article>`
  );
  const gallery = cards.length
    ? `<div class="app-gallery">${cards.join('')}</div>`
    : '<div class="empty"><h3>No screenshots available yet.</h3><p>This app listing does not include screenshots in the current snapshot.</p></div>';
  return summary + gallery;
}

/** @param {ViewContext} ctx @param {ScreenViewer} viewer @param {App | null} returnApp */
export function screenViewer(ctx, viewer, returnApp) {
  const { screenshots, index, context } = viewer,
    current = screenshots[index];
  const back = returnApp ? `<button class="screen-back" data-back-app="${esc(returnApp.id)}">Back to app</button>` : '';
  const thumbnails = screenshots
    .map(
      (s, i) =>
        `<button data-thumb="${i}" aria-label="Screenshot ${i + 1}" aria-current="${i === index ? 'true' : 'false'}">${media(ctx, { ...s, title: `Screenshot ${i + 1}` })}</button>`
    )
    .join('');
  return `<div class="screen-stage"><button class="screen-prev" data-step="-1" aria-label="Previous screenshot" ${index === 0 ? 'disabled' : ''}>Previous</button><figure class="screen-canvas">${media(ctx, current, true)}</figure><button class="screen-next" data-step="1" aria-label="Next screenshot" ${index === screenshots.length - 1 ? 'disabled' : ''}>Next</button></div><div class="screen-toolbar"><span class="screen-position" role="status">${index + 1} / ${screenshots.length}</span>${back}<div class="pinactions">${screenActions(ctx, current.id, current.title || 'screenshot')}</div>${sourceLink(current.sourceUrl)}</div><div class="screen-thumbnails" aria-label="Screenshots">${thumbnails}</div><p class="screen-context">${esc(context || 'Developer-published listing screenshots')}</p>`;
}

/** @param {string} route @param {string} label */
export function emptyState(route, label) {
  if (route === 'boards')
    return '<h2>Your board is empty.</h2><p>Save screenshots or a collection, then export your board.</p><a href="#flows">Explore collections</a>';
  if (route === 'flows' || route === 'elements')
    return `<h2>No ${esc(label.toLowerCase())} in this snapshot</h2><p>Apple listing screenshots do not include complete flows or tagged UI elements. These sections need human review.</p><a href="#screens">Explore screenshots</a>`;
  return '<h2>No matching results</h2><p>Try a different search or clear your filters.</p><button data-reset>Clear filters</button>';
}

/** @param {PublicationPolicy} policy */
export function aboutDoc(policy) {
  return `<div class="doc"><h2>Public listings. Clear limits.</h2><p>Hugging App brings together apps and screenshots from Apple's public US App Store feeds. Screenshots are developer-published listing images, not verified recordings of a complete app experience.</p><h3>Where the catalog comes from</h3><p>Chart ranks come from category-level free-app charts. Metadata and screenshots come from Apple's Lookup API. Media is cached on this catalog's domain. ${esc(policy.categories)}</p><p><a href="https://rss.marketingtools.apple.com/" target="_blank" rel="noopener noreferrer">Apple chart feeds ↗</a> · <a href="https://performance-partners.apple.com/search-api" target="_blank" rel="noopener noreferrer">Apple Search API ↗</a></p><h3>What this doesn't tell you</h3><p>Listing screenshots do not prove keyboard access, real task flows, accessibility compliance, or current in-app behavior. UI elements are visually reviewed annotations. The Flows section shows collections of related listing screenshots; a collection does not establish actual interaction order.</p><h3>No verified revenue data</h3><p>The raw export retains legacy revenue heuristics for compatibility. These are arbitrary category baselines halved every five ranks, not measured earnings. Hugging App does not use them to compare businesses.</p><h3>Boards stay on this device</h3><p>${esc(policy.board)}</p><h3>Freshness and attribution</h3><p>The timestamp above records when the snapshot was built; it is not proof that a scheduled update succeeded today. Screenshots and trademarks belong to their owners. Public availability is not a reuse licence.</p><p><a href="https://github.com/PatchworkMD/open-app-catalog" target="_blank" rel="noopener noreferrer">Catalog source ↗</a></p></div>`;
}

export function pluginDoc() {
  return `<div class="doc"><h2>Review your references.</h2><p>Give your agent screenshots, interface text, source code, or an exported board. Ask for up to three prioritized improvements, each tied to evidence and a way to test it.</p><ol><li>Save useful screenshots to your board.</li><li>Export your references and attach the relevant images or code to your agent.</li><li>Ask: “Use Hugging App to review these references. Cite the evidence and mark unseen states as unverified.”</li></ol><p>The Hugging App plugin reviews material you supply. It does not browse this catalog or fetch third-party libraries. Your host processes supplied content under its own policies.</p><p><a class="text-link" href="https://github.com/PatchworkMD/app-design-research" target="_blank" rel="noopener noreferrer">Plugin source & installation ↗</a> · <a href="https://chatgpt.com/plugins/plugins_6a9e2172a0608191ad0b9dc952483df3" target="_blank" rel="noopener noreferrer">Open in ChatGPT ↗</a></p><p class="meta">Hugging App · Build &amp; Ship iOS Apps.</p></div>`;
}
