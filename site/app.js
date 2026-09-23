'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes = {apps:'Apps',screens:'Screens',flows:'Flows',elements:'UI elements',boards:'Saved board',agents:'About & sources',plugin:'Hugging App plugin'};
let viewerState = null, curationState = 'loading', resolutionMap = {};
let data, limit = 48, selected = new Set(), board = [], savedCollections = [], storageWarning = '';
try { board = JSON.parse(localStorage.getItem('oac-board') || '[]'); if (!Array.isArray(board)) board = []; } catch { board = []; }
try { savedCollections = JSON.parse(localStorage.getItem('oac-board-collections') || '[]'); if (!Array.isArray(savedCollections)) savedCollections = []; } catch { savedCollections = []; }
const route = () => Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : 'apps';
const sourceLink = u => /^https:\/\/(apps\.apple\.com|itunes\.apple\.com)\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">View on the App Store ↗</a>` : '';
function media(s, fullSize = false) {
  const candidate = s.fullSizeUrl || resolutionMap[s.id] || '';
  const full = /^https:\/\/is[0-9]+-ssl\.mzstatic\.com\/image\/thumb\/[^?#]+\/1290x2796bb\.png$/.test(candidate) ? candidate : '';
  const p = String(s.path || '');
  return /^assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(p) ? `<img src="${esc(fullSize && full ? full : p)}" ${!fullSize && full ? `srcset="${esc(p)} 1x, ${esc(full.replace('1290x2796bb.png', '640x1386bb.jpg'))} 2x"` : ''} data-preview="${esc(p)}" loading="eager" alt="${esc(s.title || 'App Store screenshot')}" onload="this.classList.add('loaded')" onerror="if(this.dataset.preview){this.removeAttribute('srcset');this.src=this.dataset.preview;delete this.dataset.preview;}else this.replaceWith(Object.assign(document.createElement('span'),{className:'media-unavailable',textContent:'Image unavailable'}))">` : '<span>Media unavailable</span>';
}
function appIcon(x) {
  const p = String(x.iconPath || '');
  return /^assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(p) ? `<img class="icon" src="${esc(p)}" loading="eager" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'icon-ph'}))">` : '<div class="icon-ph"></div>';
}
function screenCard(s) {
  return `<article class="pin"><button class="pinmedia screen-open" data-view="${esc(s.id)}" aria-label="Open ${esc(s.title || 'screen')}">${media(s)}</button><p class="pincaption">${esc(s.title || 'Screen reference')}</p><span class="pinmeta">${esc(s.category || 'App Store')}</span><div class="pinactions"><button data-save="${esc(s.id)}" aria-pressed="${board.includes(s.id)}">${board.includes(s.id) ? 'Saved' : 'Save'}</button><button data-select="${esc(s.id)}" aria-pressed="${selected.has(s.id)}">${selected.has(s.id) ? 'Selected' : 'Compare'}</button></div></article>`;
}
function screenIds(ids) {
  const known = new Set((data.screens || []).map(s => s.id));
  return [...new Set((Array.isArray(ids) ? ids : []).filter(id => known.has(id)))];
}
function curationCard(x, kind) {
  const ids = kind === 'flows' ? x.assetIds : [x.screenId];
  const shots = ids.map(id => data.screens.find(s => s.id === id)).filter(Boolean);
  const collectionId = `${kind}:${x.id}`, isSaved = savedCollections.includes(collectionId);
  const actions = kind === 'flows' ? `<button data-save-collection="${esc(collectionId)}" aria-pressed="${isSaved}">${isSaved ? 'Saved' : 'Save collection'}</button>` : ids.map(id => `<button data-save="${esc(id)}" aria-pressed="${board.includes(id)}">${board.includes(id) ? 'Saved' : 'Save'}</button><button data-select="${esc(id)}" aria-pressed="${selected.has(id)}">${selected.has(id) ? 'Selected' : 'Compare'}</button>`).join('');
  return `<article class="pin collection-card collection-${kind}"><button class="collection-open" data-collection="${esc(x.id)}" data-collection-kind="${kind}" aria-label="Open ${esc(x.title)}"><div class="collection-previews">${shots.map(s => `<span>${media(s)}</span>`).join('')}</div><span class="pincaption">${esc(x.title)}</span><span class="pinmeta">${esc(x.category || 'Curated reference')}${x.appName ? ` · ${esc(x.appName)}` : ''} · ${shots.length} screenshot${shots.length === 1 ? '' : 's'}</span><p class="collection-description">${esc(x.description || '')}</p></button><div class="pinactions">${actions}</div></article>`;
}
function appCard(x) {
  const shot = data.screens.find(s => (x.assetIds || []).includes(s.id));
  const rank = data.coverage?.rankBasis === 'original-category-feed' && Number.isInteger(x.chartRank) ? `<span class="pinrank">#${x.chartRank} in ${esc(x.category)}</span>` : '';
  return `<article class="pin"><button class="app-open" data-related="${esc(x.id)}" aria-label="Open ${esc(x.name)}"><div class="pinmedia">${shot ? media(shot) : `<div class="pinfallback">${appIcon(x)}</div>`}${rank}</div><span class="pincaption">${esc(x.name)}</span><span class="pinmeta">${esc(x.category || 'App Store')}</span></button></article>`;
}
function matchesFilters(x) {
  const q = $('#search').value.toLowerCase().trim(), cat = $('#category').value;
  return (!q || [x.name,x.title,x.category,x.appName,x.id,x.description,...(Array.isArray(x.tags) ? x.tags : [])].join(' ').toLowerCase().includes(q)) && (!cat || x.category === cat);
}
function filtered(items) {
  const out = items.filter(matchesFilters);
  if ($('#sort').value === 'name') out.sort((a,b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  else if (data.coverage?.rankBasis === 'original-category-feed') out.sort((a,b) => (a.chartRank ?? 999) - (b.chartRank ?? 999));
  return out;
}
function currentItems() { return filtered(route() === 'boards' ? data.screens.filter(s => board.includes(s.id)) : data[route()] || []); }
function currentBoardCollections() {
  return [
    ...(data.flows || []).map(record => ({kind:'flows',record})),
    ...(data.elements || []).map(record => ({kind:'elements',record}))
  ].filter(({kind,record}) => savedCollections.includes(`${kind}:${record.id}`) && matchesFilters(record));
}
function mergeCuration(curation) {
  if (!curation || typeof curation !== 'object') return;
  const knownScreens = new Set(data.screens.map(s => s.id));
  for (const s of Array.isArray(curation.screens) ? curation.screens : []) {
    if (s && /^[a-f0-9]{64}$/.test(s.id || '') && new RegExp('^assets/' + s.id + '\\.[a-z0-9]+$', 'i').test(s.path || '') && /^https:\/\/(apps\.apple\.com|itunes\.apple\.com)\//.test(s.sourceUrl || '') && !knownScreens.has(s.id)) {
      data.screens.push(s); knownScreens.add(s.id);
    }
  }
  const flows = (Array.isArray(curation.flows) ? curation.flows : []).map(x => {
    if (!x || typeof x !== 'object') return null;
    const assetIds = screenIds(x.assetIds);
    return x && x.id && x.title && assetIds.length >= 2 ? {...x, assetIds, evidence: x.evidence || 'listing-collection'} : null;
  }).filter(Boolean);
  const elements = (Array.isArray(curation.elements) ? curation.elements : []).map(x => {
    if (!x || typeof x !== 'object') return null;
    const valid = screenIds([x.screenId]);
    return x && x.id && x.title && valid.length ? {...x, screenId: valid[0], evidence: x.evidence || 'visual-review'} : null;
  }).filter(Boolean);
  data.flows = [...(data.flows || []), ...flows];
  data.elements = [...(data.elements || []), ...elements];
}
function docs() {
  return `<div class="doc"><h2>Public listings. Clear limits.</h2><p>Hugging App brings together apps and screenshots from Apple's public US App Store feeds. Screenshots are developer-published listing images, not verified recordings of a complete app experience.</p><h3>Where the data comes from</h3><p>App rankings come from category-level free-app charts. Metadata and screenshots come from Apple's Lookup API. Media is cached on this catalog's domain. An app appearing in multiple categories is kept in the first category encountered.</p><p><a href="https://rss.marketingtools.apple.com/" target="_blank" rel="noopener noreferrer">Apple chart feeds ↗</a> · <a href="https://performance-partners.apple.com/search-api" target="_blank" rel="noopener noreferrer">Apple Search API ↗</a></p><h3>What this doesn't tell you</h3><p>Listing screenshots do not prove keyboard access, real task flows, accessibility compliance, or current in-app behavior. UI elements are visually reviewed annotations. The Flows section groups related listing screenshots; these collections do not establish actual interaction order.</p><h3>No verified revenue data</h3><p>The raw export retains legacy revenue heuristics for compatibility. These are arbitrary category baselines halved every five ranks, not measured earnings. Hugging App does not use them to compare businesses.</p><h3>Your board stays in this browser</h3><p>Saved screenshots and curated flow collections are stored on this device. Export a board to keep a copy or supply it to your agent. There is no account sync. Your agent host's policies apply to anything you share with it.</p><h3>Freshness and attribution</h3><p>The timestamp above records when the dataset was built; it is not proof that a scheduled update succeeded today. Screenshots and trademarks belong to their owners. Public availability is not a reuse licence.</p><p><a href="https://github.com/PatchworkMD/open-app-catalog" target="_blank" rel="noopener noreferrer">Catalog source ↗</a></p></div>`;
}
function pluginDocs() {
  return `<div class="doc"><h2>Review your references.</h2><p>Give your agent screenshots, interface text, source code, or an exported board. Ask for up to three prioritized improvements, each tied to evidence and a way to test it.</p><ol><li>Save useful screenshots to your board.</li><li>Export your references and attach the relevant images or code to your agent.</li><li>Ask: “Use Hugging App to review these references. Cite the evidence and mark unseen states as unverified.”</li></ol><p>The plugin reviews material you supply. It does not automatically browse this catalog or fetch third-party libraries. Your host processes supplied content under its own policies.</p><p><a class="text-link" href="https://github.com/PatchworkMD/app-design-research" target="_blank" rel="noopener noreferrer">Plugin source & installation ↗</a> · <a href="https://chatgpt.com/plugins/plugins_6a9e2172a0608191ad0b9dc952483df3" target="_blank" rel="noopener noreferrer">Open in ChatGPT ↗</a></p><p class="meta">Hugging App · Build &amp; Ship iOS Apps.</p></div>`;
}
function fillHero() {
  const nodes = document.querySelectorAll('.float-card');
  const shots = [...data.apps].sort((a,b) => (a.chartRank ?? 999) - (b.chartRank ?? 999)).map(a => data.screens.find(s => (a.assetIds || []).includes(s.id))).filter(Boolean);
  nodes.forEach((el,i) => { if (shots[i]) el.innerHTML = media(shots[i]).replace('loading="eager"', 'loading="eager"'); });
  const copy = $('#hero p');
  if (copy) copy.textContent = `Up to 100 free-chart apps per category. ${data.apps.length.toLocaleString()} apps and ${data.screens.length.toLocaleString()} listing screenshots to explore.`;
}
function render() {
  if (!data) return;
  const r = route(), informational = ['agents','plugin'].includes(r);
  document.querySelectorAll('nav a').forEach(a => { const on = a.hash === '#' + r; a.classList.toggle('active',on); on ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'); });
  $('#hero').hidden = r !== 'apps'; $('#title').textContent = routes[r];
  $('#controls').hidden = informational; $('#export').hidden = informational;
  $('#kind').disabled = true;
  const built = new Date(data.coverage?.generatedAt);
  $('#coverage').textContent = `${data.apps.length.toLocaleString()} apps · ${data.screens.length.toLocaleString()} screenshots · Snapshot ${Number.isNaN(built.getTime()) ? 'date unavailable' : built.toLocaleString()} · US App Store`;
  $('#compareCount').textContent = selected.size;
  if (informational) { $('#content').className = ''; $('#content').innerHTML = r === 'plugin' ? pluginDocs() : docs(); $('#status').textContent = ''; $('#more').hidden = true; return; }
  if (['flows','elements'].includes(r) && curationState !== 'ready') {
    $('#content').className = 'grid'; $('#more').hidden = true; $('#export').disabled = true;
    $('#status').textContent = curationState === 'loading' ? 'Loading reviewed references…' : 'Reviewed references unavailable';
    $('#content').innerHTML = curationState === 'loading' ? '<p role="status">Loading reviewed references…</p>' : '<div class="empty"><h3>These references could not load.</h3><p>The app catalog is still available. Try loading the reviewed library again.</p><button data-retry-curation>Try again</button></div>';
    return;
  }
  $('#export').disabled = false;
  const items = currentItems(), collections = r === 'boards' ? currentBoardCollections() : [];
  $('#status').textContent = `${(items.length + collections.length).toLocaleString()} results${r === 'boards' ? ' · saved on this device' : ''}${storageWarning ? ' · ' + storageWarning : ''}`;
  $('#more').hidden = items.length <= limit;
  $('#content').className = ['elements','flows'].includes(r) || collections.length ? 'grid curated-grid' : 'grid';
  const empty = r === 'boards' ? '<h3>Your board is empty.</h3><p>Save screenshots or a curated flow, then export your research board.</p><a href="#flows">Explore flows ↗</a>' : ['flows','elements'].includes(r) ? `<h3>No ${esc(routes[r].toLowerCase())} in this dataset</h3><p>Apple listing screenshots do not include complete flows or tagged UI elements. These sections require manual curation.</p><a href="#screens">Explore captured screens ↗</a>` : '<h3>No matching results</h3><p>Try a different search or clear your filters.</p><button data-reset>Clear filters</button>';
  const collectionCards = collections.map(({kind,record}) => curationCard(record,kind));
  const screenCards = items.slice(0,limit).map(x => r === 'apps' ? appCard(x) : ['flows','elements'].includes(r) ? curationCard(x, r) : screenCard(x));
  const cards = [...collectionCards,...screenCards];
  $('#content').innerHTML = cards.length ? cards.join('') : `<div class="empty">${empty}</div>`;
}
function openScreens(shots, index, title, context = '') {
  if (!shots.length) return;
  viewerState = {shots, index, title, context};
  $('#viewer').classList.add('screen-viewer');
  renderScreen();
  if (!$('#viewer').open) $('#viewer').showModal();
}
function renderScreen() {
  const {shots, index, title, context} = viewerState, s = shots[index];
  $('#viewerTitle').textContent = title;
  $('#viewerContent').innerHTML = `<div class="screen-stage"><button class="screen-prev" data-step="-1" aria-label="Previous screenshot" ${index === 0 ? 'disabled' : ''}>Previous</button><figure class="screen-canvas">${media(s, true)}</figure><button class="screen-next" data-step="1" aria-label="Next screenshot" ${index === shots.length - 1 ? 'disabled' : ''}>Next</button></div><div class="screen-toolbar"><span class="screen-position" role="status">${index + 1} / ${shots.length}</span><div class="pinactions"><button data-save="${esc(s.id)}" aria-pressed="${board.includes(s.id)}">${board.includes(s.id) ? 'Saved' : 'Save'}</button><button data-select="${esc(s.id)}" aria-pressed="${selected.has(s.id)}">${selected.has(s.id) ? 'Selected' : 'Compare'}</button></div>${sourceLink(s.sourceUrl)}</div><div class="screen-thumbnails" aria-label="Screenshots">${shots.map((shot, i) => `<button data-thumb="${i}" aria-label="Screenshot ${i + 1}" aria-current="${i === index ? 'true' : 'false'}">${media({...shot,title:`Screenshot ${i + 1}`})}</button>`).join('')}</div><p class="screen-context">${esc(context || 'Developer-published listing screenshots')}</p>`;
  $('#viewerContent').scrollTop = 0;
  $('.screen-thumbnails [aria-current="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function view(id) {
  const screen = data.screens.find(s => s.id === id); if (!screen) return;
  const app = data.apps.find(a => (a.assetIds || []).includes(id));
  const shots = app ? app.assetIds.map(id => data.screens.find(s => s.id === id)).filter(Boolean) : [screen];
  openScreens(shots, shots.findIndex(s => s.id === id), app?.name || screen.title || 'Screenshot');
}
function viewCollection(id, kind) {
  const item = (data[kind] || []).find(x => x.id === id); if (!item) return;
  const ids = kind === 'flows' ? item.assetIds : [item.screenId];
  const shots = ids.map(x => data.screens.find(s => s.id === x)).filter(Boolean);
  const context = kind === 'flows'
    ? "Listing collection · interaction order unverified. Shown in the curator's order."
    : `${item.description || 'Reviewed interface pattern'} · Reviewed ${item.reviewedAt || 'date unavailable'}`;
  openScreens(shots, 0, item.title, context);
}

function syncActions() {
  document.querySelectorAll('[data-save],[data-select],[data-save-collection]').forEach(b => {
    const collection = b.dataset.saveCollection, save = Boolean(b.dataset.save), on = collection ? savedCollections.includes(collection) : save ? board.includes(b.dataset.save) : selected.has(b.dataset.select);
    b.textContent = collection ? (on ? 'Saved' : 'Save collection') : on ? (save ? 'Saved' : 'Selected') : (save ? 'Save' : 'Compare');
    b.setAttribute('aria-pressed', String(on));
  });
  $('#compareCount').textContent = selected.size;
}
function download(value,name) {
  const u = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u),1000);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save],[data-save-collection],[data-select],[data-view],[data-related],[data-collection],[data-reset],[data-step],[data-thumb],[data-retry-curation]'); if (!b || !data) return;
  if (b.hasAttribute('data-retry-curation')) { loadCuration(); return; }
  if (b.hasAttribute('data-step') || b.hasAttribute('data-thumb')) {
    if (!viewerState) return;
    const index = b.hasAttribute('data-thumb') ? Number(b.dataset.thumb) : viewerState.index + Number(b.dataset.step);
    if (index < 0 || index >= viewerState.shots.length) return;
    viewerState.index = index; renderScreen();
    const target = b.hasAttribute('data-thumb') ? `[data-thumb="${index}"]` : `[data-step="${b.dataset.step}"]`;
    const next = $(target); (next && !next.disabled ? next : $('.screen-thumbnails [aria-current="true"]'))?.focus({preventScroll:true});
  } else if (b.hasAttribute('data-reset')) { $('#search').value = ''; $('#category').value = ''; limit = 48; render(); }
  else if (b.dataset.saveCollection) {
    const id = b.dataset.saveCollection;
    savedCollections = savedCollections.includes(id) ? savedCollections.filter(x => x !== id) : [...savedCollections,id];
    try { localStorage.setItem('oac-board-collections',JSON.stringify(savedCollections)); storageWarning = ''; } catch { storageWarning = 'Storage unavailable; changes last for this session only'; }
    if (route() === 'boards') render();
    syncActions();
    if (storageWarning) $('#status').textContent = storageWarning;
  } else if (b.dataset.save) {
    const id = b.dataset.save; board = board.includes(id) ? board.filter(x => x !== id) : [...board,id];
    try { localStorage.setItem('oac-board',JSON.stringify(board)); storageWarning = ''; } catch { storageWarning = 'Storage unavailable; changes last for this session only'; }
    if (route() === 'boards') render();
    syncActions();
    if (storageWarning) $('#status').textContent = storageWarning;
  } else if (b.dataset.select) {
    const id = b.dataset.select;
    if (selected.has(id)) selected.delete(id); else if (selected.size < 4) selected.add(id); else { $('#status').textContent = 'Compare up to four screens at a time'; return; }
    syncActions();
  } else if (b.dataset.view) view(b.dataset.view);
  else if (b.dataset.collection) viewCollection(b.dataset.collection, b.dataset.collectionKind);
  else {
    const x = data.apps.find(x => x.id === b.dataset.related); if (!x) return;
    const related = (x.assetIds || []).map(id => data.screens.find(s => s.id === id)).filter(Boolean);
    if (related.length) openScreens(related, 0, x.name, `${x.category} · App Store listing screenshots`);
    else {
      viewerState = null; $('#viewer').classList.remove('screen-viewer');
      $('#viewerTitle').textContent = x.name;
      $('#viewerContent').innerHTML = `<p>No screenshots available for this app.</p>${sourceLink(x.url)}`;
      if (!$('#viewer').open) $('#viewer').showModal();
    }
  }
});
$('#compare').onclick = () => {
  if (!data) return;
  if (selected.size < 2) { $('#status').textContent = 'Select at least two screens to compare'; return; }
  viewerState = null; $('#viewer').classList.remove('screen-viewer');
  $('#viewerTitle').textContent = 'Compare references';
  $('#viewerContent').innerHTML = `<div class="comparegrid">${data.screens.filter(s => selected.has(s.id)).map(screenCard).join('')}</div>`;
  if (!$('#viewer').open) $('#viewer').showModal();
};
document.addEventListener('keydown', e => {
  if (!$('#viewer').open || !viewerState || e.altKey || e.ctrlKey || e.metaKey || !['ArrowLeft','ArrowRight'].includes(e.key) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  e.preventDefault();
  const index = viewerState.index + (e.key === 'ArrowRight' ? 1 : -1);
  if (index >= 0 && index < viewerState.shots.length) { viewerState.index = index; renderScreen(); $('.screen-thumbnails [aria-current="true"]')?.focus({preventScroll:true}); }
});
$('#viewer').addEventListener('close', () => { viewerState = null; $('#viewer').classList.remove('screen-viewer'); });
$('#close').onclick = () => $('#viewer').close();
$('#viewer').addEventListener('click', e => { if (e.target === $('#viewer')) $('#viewer').close(); });
$('#more').onclick = () => { limit += 48; render(); };
['search','category','kind','sort'].forEach(id => $('#' + id).addEventListener('input', () => { limit = 48; render(); }));
window.addEventListener('hashchange', () => { $('#viewer').close(); limit = 48; $('#search').value = ''; $('#kind').value = ''; $('#category').value = ''; render(); window.scrollTo({top:0,behavior:'instant'}); });
$('#export').onclick = () => {
  if (!data || ['agents','plugin'].includes(route())) return;
  const items = currentItems();
  const collections = route() === 'boards' ? currentBoardCollections().map(({kind,record}) => ({kind,...record})) : undefined;
  download({name:'Hugging App references',exportedAt:new Date().toISOString(),coverage:data.coverage,route:route(),records:items,...(collections ? {collections} : {})},`hugging-app-${route()}.json`);
};
$('#export').disabled = true;
$('#content').className = 'grid';
$('#content').innerHTML = Array(12).fill('<div class="skel" aria-hidden="true"></div>').join('');
Promise.all([fetch('image-sources.json').then(r => r.ok ? r.json() : {}).catch(() => ({})), fetch('data.json').then(r => { if (!r.ok) throw Error('Catalog unavailable'); return r.json(); })]).then(([sources, d]) => {
  resolutionMap = sources && typeof sources === 'object' && !Array.isArray(sources) ? sources : {};
  data = d;
  for (const key of ['apps','screens','flows','elements']) if (!Array.isArray(data[key])) data[key] = [];
  const cats = [...new Set([...data.apps,...data.screens,...data.flows,...data.elements].map(x => x.category).filter(Boolean))].sort();
  $('#category').innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  fillHero(); render(); $('#export').disabled = false;
  loadCuration();
}).catch(() => {
  $('#hero').hidden = true; $('#coverage').textContent = 'The catalog could not load.';
  $('#content').innerHTML = '<div class="empty"><h3>We could not load the library.</h3><p>Your saved board remains on this device.</p><button onclick="location.reload()">Try again</button></div>';
});

async function loadCuration() {
  curationState = 'loading'; render();
  try {
    const response = await fetch('curation.json');
    if (!response.ok) throw Error('Reviewed library unavailable');
    const curation = await response.json();
    if (!curation || !Array.isArray(curation.flows) || !Array.isArray(curation.elements)) throw Error('Invalid reviewed library');
    mergeCuration(curation);
    const category = $('#category').value;
    const cats = [...new Set([...data.apps,...data.screens,...data.flows,...data.elements].map(x => x.category).filter(Boolean))].sort();
    $('#category').innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
    $('#category').value = category;
    curationState = 'ready'; fillHero();
  } catch { curationState = 'error'; }
  render();
}
