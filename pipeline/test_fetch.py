import importlib.util
import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("fetch.py")
SPEC = importlib.util.spec_from_file_location("fetch", MODULE_PATH)
fetch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fetch)


class BuildTest(unittest.TestCase):
    def test_curated_screens_remain_supplemental_across_refresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "data.json").write_text(json.dumps({"apps": [], "screens": []}))
            (root / "curation.json").write_text(json.dumps({"screens": [
                {"id": "in-snapshot", "path": "assets/in-snapshot.png", "curatedOnly": True},
                {"id": "curated-only", "path": "assets/curated-only.png"},
            ]}))
            snapshot = {
                "apps": [{"id": "a", "assetIds": ["in-snapshot"]}],
                "screens": [
                    {"id": "in-snapshot", "path": "assets/in-snapshot.png"},
                    {"id": "fresh", "path": "assets/fresh.png"},
                ],
                "coverage": {"screens": 2},
            }
            with patch.object(fetch, "SITE_DIR", root), patch.object(fetch, "build", return_value=snapshot), \
                 patch.dict(fetch.os.environ, {"CATALOG_R2_UPLOAD": ""}):
                fetch.main()
            data = json.loads((root / "data.json").read_text())
            screens = json.loads((root / "curation.json").read_text())["screens"]
            self.assertEqual({screen["id"] for screen in data["screens"]}, {"fresh"})
            self.assertEqual(data["coverage"]["screens"], 1)
            self.assertEqual(data["apps"][0]["assetIds"], ["in-snapshot"])
            self.assertTrue(screens[0]["curatedOnly"])
            self.assertTrue(screens[1]["curatedOnly"])

    def test_curated_supplemental_assets_are_uploaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp)
            (assets / "curated.png").write_bytes(b"image")
            with patch.object(fetch, "ASSETS_DIR", assets), \
                 patch.dict(fetch.os.environ, {"CATALOG_R2_UPLOAD": "1"}), \
                 patch.object(fetch.subprocess, "run") as run:
                run.return_value.returncode = 0
                fetch.upload_new_assets(
                    {"apps": [], "screens": []},
                    {},
                    {"screens": [{"path": "assets/curated.png"}]},
                )
            run.assert_called_once()
            self.assertIn("open-app-catalog-assets/assets/curated.png", run.call_args.args[0])

    def test_screenshot_keeps_stable_id_and_adds_full_resolution_source(self):
        saved = {"id": "stable", "path": "assets/stable.jpg"}
        with patch.object(fetch, "save_image", return_value=saved.copy()):
            result = fetch.save_screenshot("https://is1-ssl.mzstatic.com/image/thumb/Purple/a.png/320x480bb.jpg")
        self.assertEqual(result["id"], "stable")
        self.assertTrue(result["fullSizeUrl"].endswith("/a.png/1290x2796bb.png"))
        with patch.object(fetch, "save_image", return_value=saved.copy()):
            self.assertNotIn("fullSizeUrl", fetch.save_screenshot("https://example.com/image.jpg"))

    def test_overlapping_feeds_keep_original_category_rank(self):
        feeds = {"one": ["a", "b"], "two": ["b", "c", "d"]}
        details = {
            app_id: {"trackId": app_id, "trackName": app_id}
            for app_id in ("a", "b", "c", "d")
        }

        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(fetch, "GENRES", {"one": ("One", 1), "two": ("Two", 1)}), \
                 patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
                 patch.object(fetch, "fetch_chart_ids", side_effect=lambda genre: feeds[genre]), \
                 patch.object(fetch, "lookup_apps", side_effect=lambda ids: [details[i] for i in ids]), \
                 patch.object(fetch, "save_screenshot", return_value=None), \
                 patch.object(fetch, "save_image", return_value=None), \
                 patch.object(fetch.time, "sleep"):
                result = fetch.build()

        self.assertEqual([(app["id"], app["chartRank"]) for app in result["apps"]],
                         [("a", 1), ("b", 2), ("c", 2), ("d", 3)])
        overlapping = next(app for app in result["apps"] if app["id"] == "b")
        self.assertEqual(overlapping["categories"], ["One", "Two"])
        self.assertEqual(overlapping["chartRanks"], {"One": 2, "Two": 1})
        self.assertEqual([item["catalogApps"] for item in result["coverage"]["categoryCoverage"]], [2, 3])
        self.assertEqual(result["coverage"]["rankBasis"], "original-category-feed")
        self.assertEqual(result["coverage"]["chartStore"], "us")
        self.assertEqual(result["coverage"]["chartType"], "topfreeapplications")

    def test_overlapping_full_charts_retain_one_hundred_apps_per_category(self):
        feeds = {"one": [str(i) for i in range(100)], "two": [str(i) for i in range(99, 199)]}
        details = {app_id: {"trackId": app_id, "trackName": app_id}
                   for app_id in {app_id for ids in feeds.values() for app_id in ids}}

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(fetch, "GENRES", {"one": ("One", 1), "two": ("Two", 1)}), \
             patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
             patch.object(fetch, "fetch_chart_ids", side_effect=lambda genre: feeds[genre]), \
             patch.object(fetch, "lookup_apps", side_effect=lambda ids: [details[i] for i in ids]), \
             patch.object(fetch, "save_screenshot", return_value=None), \
             patch.object(fetch, "save_image", return_value=None), \
             patch.object(fetch.time, "sleep"):
            result = fetch.build()

        self.assertEqual(len(result["apps"]), 199)
        self.assertEqual([item["catalogApps"] for item in result["coverage"]["categoryCoverage"]], [100, 100])
        shared = next(app for app in result["apps"] if app["id"] == "99")
        self.assertEqual(shared["chartRanks"], {"One": 100, "Two": 1})

    def test_empty_category_aborts_refresh(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(fetch, "GENRES", {"one": ("One", 1)}), \
             patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
             patch.object(fetch, "fetch_chart_ids", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "Empty chart"):
                fetch.build()

    def test_empty_later_chart_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "data.json"
            previous = '{"prior": "snapshot"}\n'
            out.write_text(previous)
            feeds = iter([["first-app"], []])
            details = [{"trackId": "first-app", "trackName": "First app"}]
            with patch.object(fetch, "SITE_DIR", root), \
                 patch.object(fetch, "ASSETS_DIR", root / "assets"), \
                 patch.object(fetch, "GENRES", {"one": ("One", 1), "two": ("Two", 1)}), \
                 patch.object(fetch, "fetch_chart_ids", side_effect=lambda _genre: next(feeds)), \
                 patch.object(fetch, "lookup_apps", return_value=details), \
                 patch.object(fetch, "save_screenshot", return_value={"id": "screen", "path": "assets/screen.png"}), \
                 patch.object(fetch, "save_image", return_value={"path": "assets/icon.png"}), \
                 patch.object(fetch.time, "sleep"):
                with self.assertRaisesRegex(RuntimeError, "Empty chart for Two"):
                    fetch.main()

            self.assertEqual(out.read_text(), previous)
            self.assertFalse(out.with_suffix(".json.tmp").exists())

    def test_refresh_keeps_all_ten_listing_screens(self):
        details = [{"trackId": "a", "trackName": "App", "screenshotUrls": [str(i) for i in range(10)]}]

        def saved_screenshot(url):
            return {
                "id": url,
                "path": f"assets/{url}.png",
                "fullSizeUrl": f"https://is1-ssl.mzstatic.com/image/thumb/Purple/{url}.png/1290x2796bb.png",
            }

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(fetch, "GENRES", {"one": ("One", 1)}), \
             patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
             patch.object(fetch, "fetch_chart_ids", return_value=["a"]), \
             patch.object(fetch, "lookup_apps", return_value=details), \
             patch.object(fetch, "save_screenshot", side_effect=saved_screenshot), \
             patch.object(fetch.time, "sleep"):
            result = fetch.build()
        self.assertEqual(len(result['apps'][0]['assetIds']), 10)
        self.assertTrue(all(s['fullSizeUrl'].endswith('/1290x2796bb.png') for s in result['screens']))
        self.assertEqual(result['coverage']['categoryCoverage'][0]['chartEntries'], 1)
        self.assertEqual(result['coverage']['chartLimit'], 100)

    def test_refresh_uploads_only_media_not_in_the_published_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ['old.png','new.png']:
                (root / name).write_bytes(b'image')
            data = {'apps': [], 'screens': [{'path':'assets/old.png'}, {'path':'assets/new.png'}]}
            previous = {'apps': [], 'screens': [{'path':'assets/old.png'}]}
            with patch.object(fetch, 'ASSETS_DIR', root), \
                 patch.dict(fetch.os.environ, {'CATALOG_R2_UPLOAD':'1'}), \
                 patch.object(fetch.subprocess, 'run') as run:
                run.return_value.returncode = 0
                fetch.upload_new_assets(data, previous)
            self.assertEqual(run.call_count, 1)
            self.assertIn('open-app-catalog-assets/assets/new.png', run.call_args.args[0])

    def test_partial_lookup_keeps_earlier_category_membership_and_coverage(self):
        feeds = iter([["a", "shared"], ["shared", "b"]])
        lookups = iter([
            [{"trackId": "a", "trackName": "A"}],
            [{"trackId": "shared", "trackName": "Shared"},
             {"trackId": "b", "trackName": "B"}],
        ])
        with patch.object(fetch, "GENRES", {"one": ("One", 1), "two": ("Two", 1)}), \
             patch.object(fetch, "fetch_chart_ids", side_effect=lambda _genre: next(feeds)), \
             patch.object(fetch, "lookup_apps", side_effect=lambda _ids: next(lookups)), \
             patch.object(fetch, "save_image", return_value=None), \
             patch.object(fetch.time, "sleep"):
            result = fetch.build()

        shared = next(app for app in result["apps"] if app["id"] == "shared")
        self.assertEqual(shared["categories"], ["One", "Two"])
        self.assertEqual(shared["chartRanks"], {"One": 2, "Two": 1})
        self.assertEqual([row["catalogApps"] for row in result["coverage"]["categoryCoverage"]], [2, 2])

    def test_upload_error_does_not_replace_dataset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "data.json"
            out.write_text('{"old": true}')
            with patch.object(fetch, "SITE_DIR", root), \
                 patch.object(fetch, "build", return_value={"apps": [{"id": "a"}], "screens": [{"path": "assets/a.jpg"}]}), \
                 patch.object(fetch, "upload_new_assets", side_effect=RuntimeError("upload failed")):
                with self.assertRaises(RuntimeError):
                    fetch.main()
            self.assertEqual(json.loads(out.read_text()), {"old": True})

    def test_missing_referenced_asset_fails_before_upload(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = {"apps": [], "screens": [{"path": "assets/missing.jpg"}]}
            with patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
                 patch.dict(fetch.os.environ, {"CATALOG_R2_UPLOAD": "1"}), \
                 patch.object(fetch.subprocess, "run") as run:
                with self.assertRaises(RuntimeError):
                    fetch.upload_new_assets(data)
            run.assert_not_called()

    def test_empty_snapshot_preserves_prior_dataset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "data.json"
            out.write_text('{"old": true}')
            with patch.object(fetch, "SITE_DIR", root), \
                 patch.object(fetch, "build", return_value={"apps": [], "screens": []}):
                with self.assertRaises(RuntimeError):
                    fetch.main()
            self.assertEqual(json.loads(out.read_text()), {"old": True})

    def test_uploads_all_present_referenced_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("screen.jpg", "icon.jpg"):
                (root / name).write_bytes(b"asset")
            data = {
                "apps": [{"iconPath": "assets/icon.jpg"}],
                "screens": [{"path": "assets/screen.jpg"}],
            }
            calls = []

            def run(command, **kwargs):
                calls.append(command[5])
                return type("Result", (), {"returncode": 0})()

            with patch.object(fetch, "ASSETS_DIR", root), \
                 patch.dict(fetch.os.environ, {"CATALOG_R2_UPLOAD": "1"}), \
                 patch.object(fetch.subprocess, "run", side_effect=run):
                fetch.upload_new_assets(data)
            self.assertEqual(set(calls), {"open-app-catalog-assets/assets/icon.jpg",
                                          "open-app-catalog-assets/assets/screen.jpg"})


if __name__ == "__main__":
    unittest.main()
