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
        self.assertEqual(result["coverage"]["rankBasis"], "original-category-feed")
        self.assertEqual(result["coverage"]["chartStore"], "us")
        self.assertEqual(result["coverage"]["chartType"], "topfreeapplications")

    def test_empty_category_aborts_refresh(self):
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(fetch, "GENRES", {"one": ("One", 1)}), \
             patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
             patch.object(fetch, "fetch_chart_ids", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "Empty chart"):
                fetch.build()

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
