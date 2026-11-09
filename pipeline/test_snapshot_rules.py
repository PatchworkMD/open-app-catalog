import json
import unittest
from pathlib import Path

import snapshot_rules

CASES = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/snapshot-rule-cases.json').read_text())
RULES = {
    'assetPath': snapshot_rules.is_asset_path,
    'screenshotId': snapshot_rules.is_screenshot_id,
    'appleSourceUrl': snapshot_rules.is_apple_source_url,
    'fullSizeUrl': snapshot_rules.is_full_size_url,
    'reviewedScreenshot': snapshot_rules.is_reviewed_screenshot,
}


class SnapshotRulesTest(unittest.TestCase):
    def test_every_shared_case_matches_the_browser_rules(self):
        self.assertEqual(set(CASES), set(RULES))
        for name, rule in RULES.items():
            for value in CASES[name]['valid']:
                with self.subTest(rule=name, value=value):
                    self.assertTrue(rule(value))
            for value in CASES[name]['invalid']:
                with self.subTest(rule=name, value=value):
                    self.assertFalse(rule(value))


if __name__ == '__main__':
    unittest.main()
