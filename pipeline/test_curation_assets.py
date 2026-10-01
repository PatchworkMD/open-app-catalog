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

    def test_preserved_screens_are_valid_catalog_assets(self):
        preserved = [screen for screen_id, screen in self.supplemental.items() if screen_id not in self.catalog_ids]
        curated_only = {screen_id for screen_id, screen in self.supplemental.items() if screen.get("curatedOnly")}
        self.assertGreaterEqual(len(preserved), 22)
        self.assertEqual(curated_only, {screen["id"] for screen in preserved})
        for screen in preserved:
            with self.subTest(screen=screen["id"]):
                self.assertTrue(screen.get("curatedOnly"))
                self.assertRegex(screen["id"], r"^[a-f0-9]{64}$")
                self.assertRegex(screen["path"], rf"^assets/{screen['id']}\.[a-z0-9]+$")
                self.assertRegex(screen["sourceUrl"], r"^https://(apps|itunes)\.apple\.com/")


if __name__ == "__main__":
    unittest.main()
