import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

import verify_deployment


class VerifyDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.path = 'assets/' + ('a' * 64) + '.jpg'
        self.data = json.dumps({
            'coverage': {'generatedAt': '2026-10-01T12:00:00Z'},
            'apps': [{'id': 123}],
            'screens': [{'path': self.path}],
        }).encode()
        self.page = f'<link rel="canonical" href="{verify_deployment.PUBLIC_BASE}apps/123/">'.encode()

    def test_worker_is_verified_without_fetching_challenged_custom_domain(self):
        responses = {
            verify_deployment.WORKER_BASE + 'data.json': self.data,
            verify_deployment.WORKER_BASE + self.path: b'image',
            verify_deployment.WORKER_BASE + 'apps/123/': self.page,
        }
        self.assertTrue(verify_deployment.verify(responses.__getitem__))

    def test_challenged_repeat_fetch_is_reported_unverified(self):
        calls = []

        def fetcher(url):
            calls.append(url)
            if url == verify_deployment.WORKER_BASE + 'data.json' and calls.count(url) > 1:
                return None
            return {
                verify_deployment.WORKER_BASE + 'data.json': self.data,
                verify_deployment.WORKER_BASE + self.path: b'image',
                verify_deployment.WORKER_BASE + 'apps/123/': self.page,
            }[url]

        self.assertFalse(verify_deployment.verify(fetcher))

    def test_worker_and_public_domain_snapshot_media_and_page_are_verified(self):
        responses = {
            verify_deployment.WORKER_BASE + 'data.json': self.data,
            verify_deployment.WORKER_BASE + self.path: b'image',
            verify_deployment.WORKER_BASE + 'apps/123/': self.page,
            verify_deployment.PUBLIC_BASE + 'data.json': self.data,
            verify_deployment.PUBLIC_BASE + self.path: b'image',
            verify_deployment.PUBLIC_BASE + 'apps/123/': self.page,
        }
        self.assertTrue(verify_deployment.verify(responses.__getitem__))

    def test_only_cloudflare_challenge_responses_are_treated_as_unverified(self):
        challenge = HTTPError('https://example.test', 403, 'challenge', {'cf-mitigated': 'challenge'}, None)
        with patch.object(verify_deployment, 'urlopen', side_effect=challenge):
            self.assertIsNone(verify_deployment.fetch('https://example.test'))
        denied = HTTPError('https://example.test', 403, 'forbidden', {}, None)
        with patch.object(verify_deployment, 'urlopen', side_effect=denied):
            with self.assertRaises(HTTPError):
                verify_deployment.fetch('https://example.test')


if __name__ == '__main__':
    unittest.main()
