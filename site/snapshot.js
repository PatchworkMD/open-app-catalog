// @ts-check

/**
 * @typedef {{id:string, path:string, kind?:string, title?:string, category?:string, sourceUrl?:string, fullSizeUrl?:string, reviewedAt?:string, curatedOnly?:boolean}} Screenshot
 * @typedef {{id:string, name:string, category?:string, categories:string[], chartRank?:number, chartRanks:Record<string, number>, assetIds:string[], iconPath?:string, url?:string, rating?:number}} App
 * @typedef {{id:string, title:string, assetIds:string[], evidence:string, category?:string, appName?:string, description?:string, sourceUrl?:string, reviewedAt?:string, tags:string[]}} Collection
 * @typedef {{id:string, title:string, screenId:string, evidence:string, category?:string, appName?:string, description?:string, sourceUrl?:string, reviewedAt?:string, tags:string[]}} UiElement
 * @typedef {{generatedAt?:string, rankBasis?:string}} Coverage
 * @typedef {{apps:App[], screens:Screenshot[], flows:Collection[], elements:UiElement[], coverage:Coverage}} Snapshot
 */

export const ASSET_PATH = /^assets\/[a-f0-9]{64}\.[a-z0-9]{2,4}$/i;
export const SCREENSHOT_ID = /^[a-f0-9]{64}$/;
export const APPLE_SOURCE_URL = /^https:\/\/(apps\.apple\.com|itunes\.apple\.com)\//;
export const FULL_SIZE_URL = /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\/image\/thumb\/[^?#]+\/1290x2796bb\.png$/;

/** @param {unknown} value @returns {value is string} */
const isString = value => typeof value === 'string';
/** @param {RegExp} pattern @returns {(value: unknown) => value is string} */
const matching = pattern => /** @returns {value is string} */ value => isString(value) && pattern.test(value);

export const isAssetPath = matching(ASSET_PATH);
export const isScreenshotId = matching(SCREENSHOT_ID);
export const isAppleSourceUrl = matching(APPLE_SOURCE_URL);
export const isFullSizeUrl = matching(FULL_SIZE_URL);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {unknown} value */
const text = value => (isString(value) && value.trim() ? value : undefined);
/** @param {unknown} value */
const chartRank = value => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined);
/** @param {unknown} value */
const rating = value =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5 ? value : undefined;
/** @param {unknown} value @returns {string[]} */
const strings = value => (Array.isArray(value) ? value.filter(isString) : []);
/** @param {unknown} value @param {(item: unknown) => item is string} [accept] @returns {string[]} */
const uniqueIds = (value, accept = isString) => [...new Set(Array.isArray(value) ? value.filter(accept) : [])];
/** @param {unknown} value @returns {Record<string, number>} */
function ranks(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([category, rank]) => {
      const valid = chartRank(rank);
      return valid === undefined ? [] : [[category, valid]];
    })
  );
}

/**
 * A Screenshot is usable only when its id, stored asset and (when present) sources agree.
 * @param {unknown} value
 * @returns {Screenshot | null}
 */
export function readScreenshot(value) {
  if (!isRecord(value) || !isScreenshotId(value.id) || !isAssetPath(value.path)) return null;
  if (!value.path.toLowerCase().startsWith(`assets/${value.id}.`)) return null;
  return {
    ...value,
    id: value.id,
    path: value.path,
    kind: text(value.kind),
    title: text(value.title),
    category: text(value.category),
    sourceUrl: isAppleSourceUrl(value.sourceUrl) ? value.sourceUrl : undefined,
    fullSizeUrl: isFullSizeUrl(value.fullSizeUrl) ? value.fullSizeUrl : undefined,
    reviewedAt: text(value.reviewedAt),
    curatedOnly: value.curatedOnly === true ? true : undefined,
  };
}

/** @param {unknown} value @returns {boolean} */
export const isReviewedScreenshot = value => {
  const screenshot = readScreenshot(value);
  return screenshot !== null && screenshot.sourceUrl !== undefined;
};

/** @param {unknown} value @returns {App | null} */
export function readApp(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id),
    name = text(value.name);
  if (!id || !name) return null;
  return {
    ...value,
    id,
    name,
    category: text(value.category),
    categories: strings(value.categories),
    chartRank: chartRank(value.chartRank),
    chartRanks: ranks(value.chartRanks),
    assetIds: uniqueIds(value.assetIds, isScreenshotId),
    iconPath: isAssetPath(value.iconPath) ? value.iconPath : undefined,
    url: isAppleSourceUrl(value.url) ? value.url : undefined,
    rating: rating(value.rating),
  };
}

/** @param {Record<string, unknown>} value */
const reviewedFields = value => ({
  category: text(value.category),
  appName: text(value.appName),
  description: text(value.description),
  sourceUrl: isAppleSourceUrl(value.sourceUrl) ? value.sourceUrl : undefined,
  reviewedAt: text(value.reviewedAt),
  tags: strings(value.tags),
});

/** @param {unknown} value @param {Set<string>} known @returns {Collection | null} */
function readCollection(value, known) {
  if (!isRecord(value)) return null;
  const id = text(value.id),
    title = text(value.title);
  const assetIds = uniqueIds(value.assetIds).filter(screenshotId => known.has(screenshotId));
  if (!id || !title || assetIds.length < 2) return null;
  return {
    ...value,
    id,
    title,
    assetIds,
    evidence: text(value.evidence) ?? 'listing-collection',
    ...reviewedFields(value),
  };
}

/** @param {unknown} value @param {Set<string>} known @returns {UiElement | null} */
function readUiElement(value, known) {
  if (!isRecord(value)) return null;
  const id = text(value.id),
    title = text(value.title),
    screenId = value.screenId;
  if (!id || !title || !isString(screenId) || !known.has(screenId)) return null;
  return { ...value, id, title, screenId, evidence: text(value.evidence) ?? 'visual-review', ...reviewedFields(value) };
}

/**
 * @template T
 * @param {unknown} value
 * @param {(item: unknown) => (T & {id:string}) | null} read
 * @param {Set<string>} [seen]
 * @returns {T[]}
 */
function readList(value, read, seen = new Set()) {
  /** @type {T[]} */
  const out = [];
  for (const item of Array.isArray(value) ? value : []) {
    const record = read(item);
    if (record && !seen.has(record.id)) {
      seen.add(record.id);
      out.push(record);
    }
  }
  return out;
}

/**
 * Builds a Snapshot from parsed data.json. Invalid records are skipped, invalid optional fields are dropped,
 * and the first record with a given id wins.
 * @param {unknown} value
 * @returns {Snapshot}
 */
export function readSnapshot(value) {
  if (!isRecord(value)) throw new TypeError('Snapshot must be an object');
  const screens = readList(value.screens, readScreenshot);
  const known = new Set(screens.map(screenshot => screenshot.id));
  const coverage = isRecord(value.coverage) ? value.coverage : {};
  return {
    apps: readList(value.apps, readApp),
    screens,
    flows: readList(value.flows, item => readCollection(item, known)),
    elements: readList(value.elements, item => readUiElement(item, known)),
    coverage: { ...coverage, generatedAt: text(coverage.generatedAt), rankBasis: text(coverage.rankBasis) },
  };
}

/**
 * Adds the reviewed library to a Snapshot. A reviewed Screenshot fills in only when the Snapshot lacks that id,
 * so fresher listing metadata wins. Collections and UI elements must reference a known Screenshot.
 * @param {Snapshot} snapshot
 * @param {unknown} reviewed
 * @returns {Snapshot}
 */
export function mergeReviewedLibrary(snapshot, reviewed) {
  if (!isRecord(reviewed) || !Array.isArray(reviewed.flows) || !Array.isArray(reviewed.elements)) {
    throw new TypeError('Reviewed library must list flows and elements');
  }
  const screenIds = new Set(snapshot.screens.map(screenshot => screenshot.id));
  const screens = [
    ...snapshot.screens,
    ...readList(reviewed.screens, item => (isReviewedScreenshot(item) ? readScreenshot(item) : null), screenIds),
  ];
  const known = new Set(screens.map(screenshot => screenshot.id));
  return {
    ...snapshot,
    screens,
    flows: readList([...snapshot.flows, ...reviewed.flows], item => readCollection(item, known)),
    elements: readList([...snapshot.elements, ...reviewed.elements], item => readUiElement(item, known)),
  };
}
