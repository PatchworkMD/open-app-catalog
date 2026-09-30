import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CurationAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "site/data.json").read_text())
        cls.curation = json.loads((ROOT / "site/curation.json").read_text())
        cls.catalog_ids = {screen["id"] for screen in cls.data["screens"]}
        cls.supplemental = {screen["id"]: screen for screen in cls.curation.get("screens", [])}
        cls.available_ids = cls.catalog_ids | set(cls.supplemental)

    def test_curated_flows_and_elements_resolve_to_screenshots(self):
        for flow in self.curation["flows"]:
            with self.subTest(flow=flow["title"]):
                self.assertGreaterEqual(len(flow["assetIds"]), 2)
                self.assertTrue(set(flow["assetIds"]) <= self.available_ids)

        for element in self.curation["elements"]:
            with self.subTest(element=element["title"]):
                self.assertIn(element["screenId"], self.available_ids)

    def test_curated_screens_are_valid_catalog_assets(self):
        # A pinned screenshot can re-enter a tracked chart without changing its record.
        self.assertGreaterEqual(len(self.supplemental), 22)
        for screen in self.supplemental.values():
            with self.subTest(screen=screen["id"]):
                if screen["id"] not in self.catalog_ids:
                    self.assertTrue(screen.get("curatedOnly"))
                self.assertRegex(screen["id"], r"^[a-f0-9]{64}$")
                self.assertRegex(screen["path"], rf"^assets/{screen['id']}\.[a-z0-9]+$")
                self.assertRegex(screen["sourceUrl"], r"^https://(apps|itunes)\.apple\.com/")


if __name__ == "__main__":
    unittest.main()
