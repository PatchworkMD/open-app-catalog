import json
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

WORKER_BASE = 'https://open-app-catalog.austinwise-ev1e.workers.dev/'
PUBLIC_BASE = 'https://catalog.patchworkmd.dev/'


def fetch(url):
    request = Request(url, headers={'User-Agent': 'HuggingAppCatalog-CI/1.0'})
    try:
        with urlopen(request, timeout=20) as response:
            if response.headers.get('cf-mitigated') == 'challenge':
                return None
            return response.read()
    except HTTPError as error:
        if error.headers.get('cf-mitigated') == 'challenge':
            return None
        raise


def required(fetcher, url):
    content = fetcher(url)
    if content is None:
        raise RuntimeError(f'Cloudflare challenged the deployed Worker endpoint: {url}')
    return content


def verify(fetcher=fetch):
    data = json.loads(required(fetcher, WORKER_BASE + 'data.json'))
    if not data.get('apps') or not data.get('screens'):
        raise RuntimeError('The deployed Worker catalog is empty')
    path = data['screens'][0].get('path', '')
    if not re.fullmatch(r'assets/[a-f0-9]{64}\.[a-z0-9]{2,4}', path):
        raise RuntimeError('The deployed Worker catalog has an invalid media path')
    media = required(fetcher, WORKER_BASE + path)
    if not media:
        raise RuntimeError('The deployed Worker returned an empty media object')
    reference = 'apps/' + str(data['apps'][0].get('id', '')) + '/'
    if not re.fullmatch(r'apps/[0-9]+/', reference):
        raise RuntimeError('The deployed Worker catalog has an invalid app ID')
    page = required(fetcher, WORKER_BASE + reference).decode('utf-8')
    canonical = f'<link rel="canonical" href="{PUBLIC_BASE}{reference}">'
    if canonical not in page:
        raise RuntimeError('The deployed Worker reference page has the wrong canonical URL')
    print('Deployed Worker snapshot, representative media, and canonical page verified.')

    consistency_data_bytes = fetcher(WORKER_BASE + 'data.json')
    if consistency_data_bytes is None:
        print('Worker consistency check not verified: Cloudflare returned a challenge.')
        return False
    consistency_data = json.loads(consistency_data_bytes)
    if consistency_data.get('coverage', {}).get('generatedAt') != data.get('coverage', {}).get('generatedAt'):
        raise RuntimeError('The deployed Worker changed catalog snapshots during verification')
    consistency_media = fetcher(WORKER_BASE + path)
    if consistency_media is None:
        print('Worker consistency check not verified: Cloudflare returned a challenge.')
        return False
    if not consistency_media:
        raise RuntimeError('The deployed Worker representative media is missing or empty on repeat fetch')
    consistency_page_bytes = fetcher(WORKER_BASE + reference)
    if consistency_page_bytes is None:
        print('Worker consistency check not verified: Cloudflare returned a challenge.')
        return False
    consistency_page = consistency_page_bytes.decode('utf-8')
    if canonical not in consistency_page:
        raise RuntimeError('The deployed Worker reference page has the wrong canonical URL on repeat fetch')
    print('Worker snapshot, representative media, and canonical page verified on repeat fetch.')
    return True


if __name__ == '__main__':
    verify()
