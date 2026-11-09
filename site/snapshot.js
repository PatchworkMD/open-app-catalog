// @ts-check

/**
 * @typedef {{id:string, path:string, title?:string, category?:string, sourceUrl?:string, fullSizeUrl?:string, curatedOnly?:boolean}} Screenshot
 * @typedef {{id:string, name:string, category?:string, categories?:string[], chartRank?:number, chartRanks?:Record<string, number>, assetIds?:string[], iconPath?:string, url?:string, rating?:number}} App
 * @typedef {{id:string, title:string, assetIds:string[], category?:string, evidence?:string}} Collection
 * @typedef {{id:string, title:string, screenId:string, category?:string, evidence?:string}} UiElement
 * @typedef {{generatedAt?:string, rankBasis?:string}} Coverage
 * @typedef {{apps:App[], screens:Screenshot[], flows:Collection[], elements:UiElement[], coverage:Coverage}} Snapshot
 */

export const ASSET_PATH = /^assets\/[a-f0-9]{64}\.[a-z0-9]{2,4}$/i;
export const SCREENSHOT_ID = /^[a-f0-9]{64}$/;
export const APPLE_SOURCE_URL = /^https:\/\/(apps\.apple\.com|itunes\.apple\.com)\//;
export const FULL_SIZE_URL = /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\/image\/thumb\/[^?#]+\/1290x2796bb\.png$/;

/** @param {unknown} value */
export const isAssetPath = value => ASSET_PATH.test(String(value ?? ''));
/** @param {unknown} value */
export const isScreenshotId = value => SCREENSHOT_ID.test(String(value ?? ''));
/** @param {unknown} value */
export const isAppleSourceUrl = value => APPLE_SOURCE_URL.test(String(value ?? ''));
/** @param {unknown} value */
export const isFullSizeUrl = value => FULL_SIZE_URL.test(String(value ?? ''));

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Accepts a parsed data.json and returns a Snapshot whose lists are always arrays.
 * @param {unknown} value
 * @returns {Snapshot}
 */
export function normalizeSnapshot(value) {
  if (!isRecord(value)) throw new TypeError('Snapshot must be an object');
  /** @param {string} key */
  const list = key => (Array.isArray(value[key]) ? value[key].filter(isRecord) : []);
  const coverage = value.coverage;
  return /** @type {Snapshot} */ ({
    apps: list('apps'),
    screens: list('screens'),
    flows: list('flows'),
    elements: list('elements'),
    coverage: isRecord(coverage) ? coverage : {},
  });
}

/**
 * A reviewed screenshot is usable only when its id, stored asset and Apple source agree.
 * @param {unknown} value
 * @returns {value is Screenshot}
 */
export function isReviewedScreenshot(value) {
  return (
    isRecord(value) &&
    isScreenshotId(value.id) &&
    isAssetPath(value.path) &&
    String(value.path).toLowerCase().startsWith(`assets/${value.id}.`) &&
    isAppleSourceUrl(value.sourceUrl)
  );
}
