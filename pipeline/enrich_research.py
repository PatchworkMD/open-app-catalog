"""Refresh public listing text for research without changing the live catalog."""
import argparse
import json
import time
from pathlib import Path

from fetch import lookup_apps


def enrich(catalog, details):
    by_id = {str(item['trackId']): item for item in details if item.get('trackId')}
    apps = []
    observed = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    for original in catalog['apps']:
        app = dict(original)
        detail = by_id.get(str(app['id']))
        if detail:
            app.update(description=detail.get('description', ''),
                       seller=detail.get('sellerName'),
                       version=detail.get('version'),
                       minimumOsVersion=detail.get('minimumOsVersion'),
                       genres=detail.get('genres', []),
                       price=detail.get('price'), currency=detail.get('currency'),
                       contentAdvisoryRating=detail.get('contentAdvisoryRating'),
                       listingObservedAt=observed,
                       listingSource=f"https://itunes.apple.com/lookup?id={app['id']}&country=us")
        else:
            app['researchStatus'] = 'listing-unavailable'
        apps.append(app)
    return {**catalog, 'apps': apps, 'researchObservedAt': observed}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=Path('site/data.json'))
    parser.add_argument('--output', type=Path, default=Path('research/catalog.json'))
    args = parser.parse_args()
    if args.catalog.resolve() == args.output.resolve():
        parser.error('Research output must not overwrite the input catalog')
    catalog = json.loads(args.catalog.read_text())
    details = lookup_apps([str(app['id']) for app in catalog['apps']])
    if not details:
        raise SystemExit('No listings returned; existing research output preserved')
    result = enrich(catalog, details)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False))
    temporary.replace(args.output)
    print(json.dumps({'apps': len(result['apps']), 'withDescription': sum(bool(a.get('description')) for a in result['apps'])}))
