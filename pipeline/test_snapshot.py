import json
import unittest
from pathlib import Path

import snapshot

FIXTURES = Path(__file__).resolve().parents[1] / 'tests/fixtures'
RULE_CASES = json.loads((FIXTURES / 'snapshot-rule-cases.json').read_text())
INTAKE_CASES = json.loads((FIXTURES / 'snapshot-intake-cases.json').read_text())
RULES = {
    'assetPath': snapshot.is_asset_path,
    'screenshotId': snapshot.is_screenshot_id,
    'appleSourceUrl': snapshot.is_apple_source_url,
    'fullSizeUrl': snapshot.is_full_size_url,
    'reviewedScreenshot': snapshot.is_reviewed_screenshot,
}


def intake(case):
    result = snapshot.read_snapshot(case['snapshot'])
    return snapshot.merge_reviewed_library(result, case['reviewed']) if 'reviewed' in case else result


class SnapshotTest(unittest.TestCase):
    def test_every_shared_rule_case_matches_the_browser(self):
        self.assertEqual(set(RULE_CASES), set(RULES))
        for name, rule in RULES.items():
            for value in RULE_CASES[name]['valid']:
                with self.subTest(rule=name, value=value):
                    self.assertTrue(rule(value))
            for value in RULE_CASES[name]['invalid']:
                with self.subTest(rule=name, value=value):
                    self.assertFalse(rule(value))

    def test_every_shared_intake_case_matches_the_browser(self):
        for case in INTAKE_CASES:
            with self.subTest(case=case['name']):
                if case.get('error'):
                    with self.assertRaises(TypeError):
                        intake(case)
                else:
                    self.assertEqual(intake(case), case['expected'])


if __name__ == '__main__':
    unittest.main()
