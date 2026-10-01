import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("fetch.py")
SPEC = importlib.util.spec_from_file_location("fetch", MODULE_PATH)
fetch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fetch)


class ResolutionSourceTest(unittest.TestCase):
    def test_build_keeps_full_size_source_on_each_screen(self):
        screenshot_url = "https://is1-ssl.mzstatic.com/image/thumb/test/640x1136bb.jpg"
        full_size_url = "https://is1-ssl.mzstatic.com/image/thumb/test/1290x2796bb.png"
        details = [{
            "trackId": "6446901002",
            "trackName": "Threads",
            "trackViewUrl": "https://apps.apple.com/us/app/threads/id6446901002",
            "screenshotUrls": [screenshot_url],
        }]
        saved = {"id": "stable", "path": "assets/stable.jpg"}

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(fetch, "GENRES", {"6005": ("Social Networking", 1)}), \
             patch.object(fetch, "ASSETS_DIR", Path(tmp)), \
             patch.object(fetch, "fetch_chart_ids", return_value=["6446901002"]), \
             patch.object(fetch, "lookup_apps", return_value=details), \
             patch.object(fetch, "save_image", return_value=saved), \
             patch.object(fetch.time, "sleep"):
            data = fetch.build()

        self.assertEqual(data["screens"][0]["fullSizeUrl"], full_size_url)


if __name__ == "__main__":
    unittest.main()
