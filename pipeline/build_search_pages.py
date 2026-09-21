"""Build public, source-linked HTML references from the same catalog snapshot."""
import html
import json
import re
from pathlib import Path
from urllib.parse import urlparse

BASE = 'https://catalog.patchworkmd.dev'
ROOT = Path(__file__).resolve().parents[1] / 'site'

def esc(value):
    return html.escape(str(value), quote=True)

def apple_url(value):
    u = urlparse(value or '')
    return value if u.scheme == 'https' and u.hostname in {'apps.apple.com', 'itunes.apple.com'} else ''

def image_path(value):
    return value if re.fullmatch(r'assets/[a-f0-9]{64}\.[a-z0-9]{2,4}', value or '') else ''

def curated_screen(record):
    if not isinstance(record, dict):
        return False
    screen_id = record.get('id', '')
    path = image_path(record.get('path'))
    return bool(
        re.fullmatch(r'[a-f0-9]{64}', screen_id)
        and path
        and path.rsplit('/', 1)[-1].rsplit('.', 1)[0] == screen_id
        and apple_url(record.get('sourceUrl'))
    )

def document(title, description, path, body, modified):
    schema = {'@context':'https://schema.org','@type':'CollectionPage','name':title,'description':description,'url':BASE+path,'dateModified':modified,'isPartOf':{'@type':'WebSite','name':'Hugging App','url':BASE+'/'}}
    encoded = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | Hugging App</title><meta name="description" content="{esc(description)}"><link rel="canonical" href="{BASE}{path}">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(title)} | Hugging App"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{BASE}{path}"><meta property="og:image" content="{BASE}/brand/hugging-app.png"><meta name="twitter:card" content="summary"><meta name="twitter:image" content="{BASE}/brand/hugging-app.png">
<link rel="icon" href="/brand/hugging-app.png"><link rel="stylesheet" href="/style.css?v=20260921-search"><link rel="stylesheet" href="/references.css?v=20260921-search"><script type="application/ld+json">{encoded}</script></head>
<body><header><a class="brand" href="/"><img class="brandmark" src="/brand/hugging-app.png" width="34" height="34" alt="">Hugging App</a><nav aria-label="Main navigation"><a href="/apps/">Apps</a><a href="/ui-elements/">UI elements</a><a href="/flows/">Collections</a><a href="/about/">About &amp; sources</a><a href="/#apps">Interactive catalog</a></nav></header>
<main class="reference-page">{body}</main><footer>By PatchworkMD · Snapshot {esc(modified)} · Screenshots and trademarks belong to their owners. <a href="/about/">Sources and limitations</a> · <a href="https://github.com/PatchworkMD/open-app-catalog">Source code</a></footer></body></html>'''

def build(root=ROOT):
    data = json.loads((root/'data.json').read_text())
    if not data.get('apps') or not data.get('screens'):
        raise ValueError('Refusing to generate an empty reference library')
    modified = data.get('coverage',{}).get('generatedAt','')[:10]
    curation = json.loads((root/'curation.json').read_text()) if (root/'curation.json').exists() else {}
    screens = {s['id']:s for s in data['screens'] if image_path(s.get('path'))}
    curated = {s['id']:s for s in curation.get('screens',[]) if curated_screen(s)}
    screens.update(curated)
    sources = json.loads((root/"image-sources.json").read_text()) if (root/"image-sources.json").exists() else {}
    pages = {}
    def shot(s):
        full = s.get('fullSizeUrl') or sources.get(s['id'], '')
        if not re.fullmatch(r'https://is[0-9]+-ssl\.mzstatic\.com/image/thumb/[^?#]+/1290x2796bb\.png', full):
            full = '/' + s['path']
        return f'<a href="{esc(full)}"><img src="{esc(full)}" alt="{esc(s.get("title","App"))} App Store screenshot" loading="lazy" onerror="this.onerror=null;this.src=&#39;/{esc(s["path"])}&#39;;this.parentElement.href=this.src"></a>'
    entries = []
    for app in data['apps']:
        app_id = str(app['id'])
        if not app_id.isdecimal():
            raise ValueError('App reference IDs must be numeric')
        source = apple_url(app.get('url'))
        related = [screens[sid] for sid in app.get('assetIds',[]) if sid in screens]
        if not source or not related:
            continue
        name, category = app['name'], app.get('category','App Store')
        path = f'/apps/{app_id}/'
        title = f'{name}: iOS app screenshots'
        description = f'Explore {len(related)} developer-published {name} screenshots in {category}. Compare interface references and view the original App Store listing.'
        gallery = ''.join(f'<figure>{shot(s)}<figcaption>Screenshot {i+1} of {len(related)}</figcaption></figure>' for i,s in enumerate(related))
        patterns = [e for e in curation.get('elements',[]) if e.get('screenId') in app.get('assetIds',[])]
        notes = ''.join(f'<li><strong>{esc(e["title"])}</strong>: {esc(e["description"])}</li>' for e in patterns)
        body = f'<p class="coverage"><a href="/apps/">App directory</a> / {esc(category)}</p><h1>{esc(name)}</h1><p class="reference-intro">{esc(description)}</p><p><a href="{esc(source)}" rel="noopener noreferrer">View on the App Store ↗</a> · <a href="/#apps">Browse and compare references</a></p><h2>Listing screenshots</h2><div class="reference-gallery">{gallery}</div>'
        if notes:
            body += f'<h2>Observed UI patterns</h2><p>Visual annotations of these listing images; current in-app behavior is unverified.</p><ul class="reference-notes">{notes}</ul>'
        body += '<h2>What do these screenshots show?</h2><p>These are developer-published App Store images. They can include promotional text and device frames. Screenshot order does not establish a complete interaction flow. Public availability does not grant a reuse licence.</p>'
        pages[path] = document(title,description,path,body,modified)
        entries.append((name,category,path))
    directory = ''.join(f'<li><a href="{path}">{esc(name)}</a><span>{esc(cat)}</span></li>' for name,cat,path in sorted(entries))
    pages['/apps/'] = document('iOS app screenshot directory','Browse source-linked iOS app screenshots by app name and category. Explore public App Store design references without an account.','/apps/',f'<h1>iOS app screenshot directory</h1><p class="reference-intro">{len(entries)} apps with developer-published screenshots. Each reference page links to its App Store source.</p><ul class="reference-directory">{directory}</ul>',modified)
    for key,path,title in [('elements','/ui-elements/','iOS UI element examples'),('flows','/flows/','App screen collections')]:
        cards = []
        for item in curation.get(key,[]):
            ids = item.get('assetIds',[]) if key == 'flows' else [item.get('screenId')]
            related = [screens[sid] for sid in ids if sid in screens]
            if not related or (key == 'flows' and len(related)<2):
                continue
            source = apple_url(item.get('sourceUrl'))
            cards.append(f'<section><h2>{esc(item["title"])}</h2><p>{esc(item.get("description",""))}</p><p>Reviewed {esc(item.get("reviewedAt",""))} · <a href="{esc(source)}">App Store source ↗</a></p><div class="reference-gallery">'+''.join(f'<figure>{shot(s)}</figure>' for s in related)+'</div></section>')
        description = 'Visually reviewed UI patterns from public App Store screenshots.' if key == 'elements' else 'Related app screenshots grouped for design research. These are editorial collections, not verified recordings of interaction flows.'
        pages[path] = document(title,description,path,f'<h1>{title}</h1><p class="reference-intro">{description}</p>'+''.join(cards),modified)
    about = '''<h1>About Hugging App</h1><p class="reference-intro">Hugging App is a free, open-source iOS app design reference catalog by PatchworkMD. Browse developer-published screenshots, visually reviewed UI patterns, and related screen collections.</p><h2>Where do the screenshots come from?</h2><p>App metadata and screenshots come from Apple's public Lookup API. App discovery uses category-level US App Store charts. Images are cached on this catalog's domain. Each app page links to its original listing.</p><h2>Are these complete app flows?</h2><p>No. The collections group listing screenshots. They are not recordings of actual user journeys, and their order is not verified.</p><h2>How current is the catalog?</h2><p>A scheduled pipeline refreshes the catalog daily. Each page shows the snapshot date; a schedule does not guarantee that every run succeeded. UI annotations are reviewed separately and show their review dates.</p><h2>Can I save and compare screenshots?</h2><p>Use the interactive catalog to save references on your device, compare up to four screenshots, and export a JSON board. There is no account sync.</p><h2>What does the ChatGPT plugin do?</h2><p>Hugging App reviews screenshots, interface text, and code you supply and guides original iOS app work. It does not automatically fetch this library or independently publish apps.</p><p><a href="https://chatgpt.com/plugins/plugins_6a9e2172a0608191ad0b9dc952483df3">Hugging App in ChatGPT</a></p><h2>Who owns the images?</h2><p>The catalog code is MIT licensed. Third-party screenshots and trademarks remain their owners' property; public availability is not a reuse licence. Hugging App is an independent PatchworkMD project.</p><h2>Sources</h2><ul><li><a href="https://rss.marketingtools.apple.com/">Apple chart feeds</a></li><li><a href="https://performance-partners.apple.com/search-api">Apple Search API</a></li><li><a href="https://github.com/PatchworkMD/open-app-catalog">Catalog source and issue tracker</a></li></ul>'''
    pages['/about/'] = document('About, sources and common questions','Learn what Hugging App contains, where its iOS screenshots come from, how collections are reviewed, and how to save design references.','/about/',about,modified)
    # Generated paths are rebuilt in a clean CI checkout; source images stay in R2.
    for path, content in pages.items():
        target = root/path.lstrip('/')/'index.html'
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(content)
    urls = ['/',*pages]
    (root/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{BASE}{path}</loc></url>' for path in urls)+'</urlset>\n')
    (root/'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n')
    (root/'llms.txt').write_text(f'# Hugging App\n\n> Free iOS app design references by PatchworkMD, sourced from public Apple listings.\n\nSnapshot: {modified}. {len(entries)} apps with screenshots.\n\n- [App directory]({BASE}/apps/): per-app HTML pages and source links.\n- [UI elements]({BASE}/ui-elements/): visually reviewed screenshot annotations.\n- [Screen collections]({BASE}/flows/): editorial groupings; interaction order unverified.\n- [About and sources]({BASE}/about/): provenance, freshness, rights, and limitations.\n- [Catalog data]({BASE}/data.json): public metadata and screenshot references.\n\nImages may include marketing text and do not establish current in-app behavior. The plugin reviews supplied material and does not automatically retrieve this catalog.\n')
    return len(pages)

if __name__ == '__main__':
    print(f'Built {build()} crawlable reference pages')
