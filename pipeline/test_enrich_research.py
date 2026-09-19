import unittest

from enrich_research import enrich


class EnrichmentTest(unittest.TestCase):
    def test_preserves_input_and_reports_missing_listing(self):
        source = {'apps': [{'id': '1'}, {'id': '2'}], 'screens': []}
        result = enrich(source, [{'trackId': 1, 'description': 'Track habits'}])
        self.assertEqual(result['apps'][0]['description'], 'Track habits')
        self.assertIn('lookup?id=1', result['apps'][0]['listingSource'])
        self.assertEqual(result['apps'][1]['researchStatus'], 'listing-unavailable')
        self.assertNotIn('description', source['apps'][0])
