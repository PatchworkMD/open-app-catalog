'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes = {apps:'Apps',screens:'Screens',flows:'Flows',elements:'UI elements',boards:'Saved board',agents:'About & sources',plugin:'Hugging App plugin'};
let data, limit = 48, selected = new Set(), board = [], storageWarning = '';
try { board = JSON.parse(localStorage.getItem('oac-board') || '[]'); if (!Array.isArray(board)) board = []; } catch { board = []; }
const route = () => Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : 'apps';
const sourceLink = u => /^https:\/\/(apps\.apple\.com|itunes\.apple\.com)\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">View on the App Store ↗</a>` : '';
function media(s) {
  const p = String(s.path || '');
  return /^assets\/[a-f0-9]+\.[a-z0-9]+$/i.test(p) ? `<img src="${esc(p)}" loading="eager" alt="${esc(s.title || 'App Store screenshot')}" onload="this.classList.add('loaded')" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'media-unavailable',textContent:'Image unavailable'}))">` : '<span>Media unavailable</span>';
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
  const actions = kind === 'elements' ? ids.map(id => `<button data-save="${esc(id)}" aria-pressed="${board.includes(id)}">${board.includes(id) ? 'Saved' : 'Save'}</button><button data-select="${esc(id)}" aria-pressed="${selected.has(id)}">${selected.has(id) ? 'Selected' : 'Compare'}</button>`).join('') : '';
  return `<article class="pin collection-card collection-${kind}"><button class="collection-open" data-collection="${esc(x.id)}" data-collection-kind="${kind}" aria-label="Open ${esc(x.title)}"><div class="collection-previews">${shots.map(s => `<span>${media(s)}</span>`).join('')}</div><span class="pincaption">${esc(x.title)}</span><span class="pinmeta">${esc(x.category || 'Curated reference')}${x.appName ? ` · ${esc(x.appName)}` : ''} · ${shots.length} screenshot${shots.length === 1 ? '' : 's'}</span><p class="collection-description">${esc(x.description || '')}</p></button><div class="pinactions">${actions}</div></article>`;
}
function appCard(x) {
  const shot = data.screens.find(s => (x.assetIds || []).includes(s.id));
  const rank = data.coverage?.rankBasis === 'original-category-feed' && Number.isInteger(x.chartRank) ? `<span class="pinrank">#${x.chartRank} in ${esc(x.category)}</span>` : '';
  return `<article class="pin"><button class="app-open" data-related="${esc(x.id)}" aria-label="Open ${esc(x.name)}"><div class="pinmedia">${shot ? media(shot) : `<div class="pinfallback">${appIcon(x)}</div>`}${rank}</div><span class="pincaption">${esc(x.name)}</span><span class="pinmeta">${esc(x.category || 'App Store')}</span></button></article>`;
}
function filtered(items) {
  const q = $('#search').value.toLowerCase().trim(), cat = $('#category').value;
  const out = items.filter(x => (!q || [x.name,x.title,x.category,x.appName,x.id,x.description,...(Array.isArray(x.tags) ? x.tags : [])].join(' ').toLowerCase().includes(q)) && (!cat || x.category === cat));
  if ($('#sort').value === 'name') out.sort((a,b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
  else if (data.coverage?.rankBasis === 'original-category-feed') out.sort((a,b) => (a.chartRank ?? 999) - (b.chartRank ?? 999));
  return out;
}
function currentItems() { return filtered(route() === 'boards' ? data.screens.filter(s => board.includes(s.id)) : data[route()] || []); }
function mergeCuration(curation) {
  if (!curation || typeof curation !== 'object') return;
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
  return `<div class="doc"><h2>Public listings. Clear limits.</h2><p>Hugging App brings together apps and screenshots from Apple's public US App Store feeds. Screenshots are developer-published listing images, not verified recordings of a complete app experience.</p><h3>Where the data comes from</h3><p>App rankings come from category-level free-app charts. Metadata and screenshots come from Apple's Lookup API. Media is cached on this catalog's domain. An app appearing in multiple categories is kept in the first category encountered.</p><p><a href="https://rss.marketingtools.apple.com/" target="_blank" rel="noopener noreferrer">Apple chart feeds ↗</a> · <a href="https://performance-partners.apple.com/search-api" target="_blank" rel="noopener noreferrer">Apple Search API ↗</a></p><h3>What this doesn't tell you</h3><p>Listing screenshots do not prove keyboard access, real task flows, accessibility compliance, or current in-app behavior. UI elements are visually reviewed annotations. The Flows section groups related listing screenshots; these collections do not establish actual interaction order.</p><h3>No verified revenue data</h3><p>The raw export retains legacy revenue heuristics for compatibility. These are arbitrary category baselines halved every five ranks, not measured earnings. Hugging App does not use them to compare businesses.</p><h3>Your board stays in this browser</h3><p>Saved screenshot IDs are stored on this device. Export a board to keep a copy or supply it to your agent. There is no account sync. Your agent host's policies apply to anything you share with it.</p><h3>Freshness and attribution</h3><p>The timestamp above records when the dataset was built; it is not proof that a scheduled update succeeded today. Screenshots and trademarks belong to their owners. Public availability is not a reuse licence.</p><p><a href="https://github.com/PatchworkMD/open-app-catalog" target="_blank" rel="noopener noreferrer">Catalog source ↗</a></p></div>`;
}
function pluginDocs() {
  return `<div class="doc"><h2>Review your references.</h2><p>Give your agent screenshots, interface text, source code, or an exported board. Ask for up to three prioritized improvements, each tied to evidence and a way to test it.</p><ol><li>Save useful screenshots to your board.</li><li>Export your references and attach the relevant images or code to your agent.</li><li>Ask: “Use Hugging App to review these references. Cite the evidence and mark unseen states as unverified.”</li></ol><p>The plugin reviews material you supply. It does not automatically browse this catalog or fetch third-party libraries. Your host processes supplied content under its own policies.</p><p><a class="text-link" href="https://github.com/PatchworkMD/app-design-research" target="_blank" rel="noopener noreferrer">Plugin source & installation ↗</a> · <a href="https://chatgpt.com/plugins/plugins_6a9e2172a0608191ad0b9dc952483df3" target="_blank" rel="noopener noreferrer">Open in ChatGPT ↗</a></p><p class="meta">Hugging App · Build &amp; Ship iOS Apps.</p></div>`;
}
function fillHero() {
  const nodes = document.querySelectorAll('.float-card');
  const shots = [...data.apps].sort((a,b) => (a.chartRank ?? 999) - (b.chartRank ?? 999)).map(a => data.screens.find(s => (a.assetIds || []).includes(s.id))).filter(Boolean);
  nodes.forEach((el,i) => { if (shots[i]) el.innerHTML = media(shots[i]).replace('loading="eager"', 'loading="eager"'); });
  const copy = $('#hero p');
  if (copy) copy.textContent = `${data.apps.length.toLocaleString()} apps. ${data.screens.length.toLocaleString()} screenshots. Explore references from Apple's public listings.`;
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
  const items = currentItems();
  $('#status').textContent = `${items.length.toLocaleString()} results${r === 'boards' ? ' · saved on this device' : ''}${storageWarning ? ' · ' + storageWarning : ''}`;
  $('#more').hidden = items.length <= limit;
  $('#content').className = 'grid';
  const empty = r === 'boards' ? '<h3>Your board is empty.</h3><p>Save screenshots from the Screens library, then export a board for your research.</p><a href="#screens">Explore screens ↗</a>' : ['flows','elements'].includes(r) ? `<h3>No ${esc(routes[r].toLowerCase())} in this dataset</h3><p>Apple listing screenshots do not include complete flows or tagged UI elements. These sections require manual curation.</p><a href="#screens">Explore captured screens ↗</a>` : '<h3>No matching results</h3><p>Try a different search or clear your filters.</p><button data-reset>Clear filters</button>';
  $('#content').innerHTML = items.length ? items.slice(0,limit).map(x => r === 'apps' ? appCard(x) : ['flows','elements'].includes(r) ? curationCard(x, r) : screenCard(x)).join('') : `<div class="empty">${empty}</div>`;
}
function view(id) {
  const s = data.screens.find(x => x.id === id); if (!s) return;
  $('#viewerTitle').textContent = s.title || 'Screen reference';
  $('#viewerContent').innerHTML = `<div class="detail"><figure class="detail-shot">${media(s)}<figcaption>${esc(s.title || 'Screenshot')} · ${esc(s.category || 'App Store')} · Developer-published listing screenshot</figcaption></figure><p>${sourceLink(s.sourceUrl)}</p></div>`;
  $('#viewerContent img')?.classList.add('detailmedia');
  if (!$('#viewer').open) $('#viewer').showModal();
}
function appDetailCard(s, index) {
  return `<article class="app-detail-card"><button class="app-detail-image" data-view="${esc(s.id)}" aria-label="Open ${esc(s.title || 'app')} screenshot ${index + 1}">${media({...s,title:`${s.title || 'App'} screenshot ${index + 1}`})}</button><div class="app-detail-caption"><span>Screenshot ${index + 1}</span><div class="pinactions"><button data-save="${esc(s.id)}" aria-pressed="${board.includes(s.id)}">${board.includes(s.id) ? 'Saved' : 'Save'}</button><button data-select="${esc(s.id)}" aria-pressed="${selected.has(s.id)}">${selected.has(s.id) ? 'Selected' : 'Compare'}</button></div></div></article>`;
}
function viewCollection(id, kind) {
  const item = (data[kind] || []).find(x => x.id === id); if (!item) return;
  const ids = kind === 'flows' ? item.assetIds : [item.screenId];
  const shots = ids.map(x => data.screens.find(s => s.id === x)).filter(Boolean);
  $('#viewerTitle').textContent = item.title;
  const note = kind === 'flows' ? '<p class="coverage"><strong>Listing collection · interaction order unverified.</strong> Screenshots are shown in the curator\'s order.</p>' : `<p class="coverage"><strong>${esc(item.title)}</strong> · ${esc(item.description || 'Curated interface pattern')} · visual review annotation</p>`;
  $('#viewerContent').innerHTML = `${note}<p>${sourceLink(item.sourceUrl || shots[0]?.sourceUrl)}</p><div class="collection-detail">${shots.map((s, i) => `<figure><button class="screen-open" data-view="${esc(s.id)}" aria-label="Open ${esc(s.title || 'screen')} ${i + 1}">${media(s)}</button><figcaption>${i + 1}. ${esc(s.title || 'Listing screenshot')}</figcaption><div class="pinactions"><button data-save="${esc(s.id)}" aria-pressed="${board.includes(s.id)}">${board.includes(s.id) ? 'Saved' : 'Save'}</button><button data-select="${esc(s.id)}" aria-pressed="${selected.has(s.id)}">${selected.has(s.id) ? 'Selected' : 'Compare'}</button></div></figure>`).join('')}</div>`;
  syncActions();
  if (!$('#viewer').open) $('#viewer').showModal();
}
function syncActions() {
  document.querySelectorAll('[data-save],[data-select]').forEach(b => {
    const save = Boolean(b.dataset.save), on = save ? board.includes(b.dataset.save) : selected.has(b.dataset.select);
    b.textContent = on ? (save ? 'Saved' : 'Selected') : (save ? 'Save' : 'Compare');
    b.setAttribute('aria-pressed', String(on));
  });
  $('#compareCount').textContent = selected.size;
}
function download(value,name) {
  const u = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u),1000);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save],[data-select],[data-view],[data-related],[data-collection],[data-reset]'); if (!b || !data) return;
  if (b.hasAttribute('data-reset')) { $('#search').value = ''; $('#category').value = ''; limit = 48; render(); }
  else if (b.dataset.save) {
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
    const related = data.screens.filter(s => (x.assetIds || []).includes(s.id));
    $('#viewerTitle').textContent = x.name;
    $('#viewerContent').innerHTML = `<div class="app-detail-summary"><p>${sourceLink(x.url)} · <a href="/apps/${encodeURIComponent(x.id)}/">Open reference page ↗</a></p><p class="coverage">${esc(x.category)} · ${related.length} listing screenshots${Number.isFinite(x.rating) ? ` · ${x.rating.toFixed(1)} / 5 App Store rating` : ''}</p></div><div class="app-gallery">${related.map(appDetailCard).join('')}</div>`;
    if (!$('#viewer').open) $('#viewer').showModal();
  }
});
$('#compare').onclick = () => {
  if (!data) return;
  if (selected.size < 2) { $('#status').textContent = 'Select at least two screens to compare'; return; }
  $('#viewerTitle').textContent = 'Compare references';
  $('#viewerContent').innerHTML = `<div class="comparegrid">${data.screens.filter(s => selected.has(s.id)).map(screenCard).join('')}</div>`;
  if (!$('#viewer').open) $('#viewer').showModal();
};
$('#close').onclick = () => $('#viewer').close();
$('#viewer').addEventListener('click', e => { if (e.target === $('#viewer')) $('#viewer').close(); });
$('#more').onclick = () => { limit += 48; render(); };
['search','category','kind','sort'].forEach(id => $('#' + id).addEventListener('input', () => { limit = 48; render(); }));
window.addEventListener('hashchange', () => { limit = 48; $('#search').value = ''; $('#kind').value = ''; $('#category').value = ''; render(); });
$('#export').onclick = () => {
  if (!data || ['agents','plugin'].includes(route())) return;
  const items = currentItems();
  download({name:'Hugging App references',exportedAt:new Date().toISOString(),coverage:data.coverage,route:route(),records:items},`hugging-app-${route()}.json`);
};
$('#export').disabled = true;
$('#content').className = 'grid';
$('#content').innerHTML = Array(12).fill('<div class="skel" aria-hidden="true"></div>').join('');
fetch('data.json').then(r => { if (!r.ok) throw Error('Catalog unavailable'); return r.json(); }).then(d => {
  data = d;
  for (const key of ['apps','screens','flows','elements']) if (!Array.isArray(data[key])) data[key] = [];
  const cats = [...new Set([...data.apps,...data.screens,...data.flows,...data.elements].map(x => x.category).filter(Boolean))].sort();
  $('#category').innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  fillHero(); render(); $('#export').disabled = false;
  fetch('curation.json').then(r => r.ok ? r.json() : null).catch(() => null).then(curation => {
    mergeCuration(curation);
    const mergedCats = [...new Set([...data.apps,...data.screens,...data.flows,...data.elements].map(x => x.category).filter(Boolean))].sort();
    $('#category').innerHTML = '<option value="">All categories</option>' + mergedCats.map(c => `<option>${esc(c)}</option>`).join('');
    render();
  });
}).catch(() => {
  $('#hero').hidden = true; $('#coverage').textContent = 'The catalog could not load.';
  $('#content').innerHTML = '<div class="empty"><h3>We could not load the library.</h3><p>Your saved board remains on this device.</p><button onclick="location.reload()">Try again</button></div>';
});
