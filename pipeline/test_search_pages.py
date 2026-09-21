import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from build_search_pages import build


class SearchPagesTest(unittest.TestCase):
    def test_crawlable_pages_preserve_source_and_escape_untrusted_titles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sid = 'a' * 64
            title = 'Example </script><script>alert(1)</script>'
            data = {'coverage': {'generatedAt': '2026-09-21T10:00:00Z'}, 'apps': [
                {'id': '123', 'name': title, 'category': 'Productivity', 'assetIds': [sid], 'url': 'https://apps.apple.com/us/app/example/id123'}
            ], 'screens': [{'id': sid, 'title': title, 'path': f'assets/{sid}.jpg'}]}
            (root / 'data.json').write_text(json.dumps(data))
            self.assertEqual(build(root), 5)
            page = (root / 'apps/123/index.html').read_text()
            self.assertIn('https://apps.apple.com/us/app/example/id123', page)
            self.assertIn('rel="canonical" href="https://catalog.patchworkmd.dev/apps/123/"', page)
            self.assertNotIn('<script>alert(1)</script>', page)
            self.assertIn('&lt;script&gt;', page)
            sitemap = ET.fromstring((root / 'sitemap.xml').read_text())
            urls = [item.text for item in sitemap.findall('.//{*}loc')]
            self.assertIn('https://catalog.patchworkmd.dev/apps/123/', urls)
            self.assertTrue(all('#' not in url for url in urls))
            self.assertIn('href="/apps/123/"', (root / 'apps/index.html').read_text())
            self.assertIn('Sitemap:', (root / 'robots.txt').read_text())

    def test_empty_input_does_not_replace_existing_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'sitemap.xml').write_text('previous snapshot')
            (root / 'data.json').write_text('{"apps": [], "screens": []}')
            with self.assertRaises(ValueError):
                build(root)
            self.assertEqual((root / 'sitemap.xml').read_text(), 'previous snapshot')
