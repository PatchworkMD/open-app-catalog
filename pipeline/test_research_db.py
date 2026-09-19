import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from research_db import import_catalog, search


def catalog():
    screens = [{"id": "s1", "path": "a.png", "title": "Shared", "sourceUrl": "https://x"}]
    apps = [
        {"id": "a1", "name": "Alpha Notes", "category": "Productivity", "url": "https://a", "description": "write notes", "assetIds": ["s1"]},
        {"id": "a2", "name": "Beta Notes", "category": "Productivity", "url": "https://b", "assetIds": ["s1"]},
    ]
    return {"apps": apps, "screens": screens, "coverage": {"generatedAt": "2026-09-18T00:00:00Z"}}


class ResearchDbTest(unittest.TestCase):
    def test_shared_screen_and_fts(self):
        with tempfile.TemporaryDirectory() as d:
            c, db = Path(d) / "c.json", Path(d) / "x.db"
            c.write_text(json.dumps(catalog()))
            self.assertEqual(import_catalog(c, db), 2)
            self.assertEqual(len(search(db, "Alpha")), 1)
            with sqlite3.connect(db) as conn:
                self.assertEqual(conn.execute("select count(*) from app_screens").fetchone()[0], 2)

    def test_invalid_import_rolls_back(self):
        with tempfile.TemporaryDirectory() as d:
            c, db = Path(d) / "c.json", Path(d) / "x.db"
            c.write_text(json.dumps(catalog()))
            import_catalog(c, db)
            bad = catalog(); bad["apps"][0]["assetIds"] = ["missing"]
            c.write_text(json.dumps(bad))
            with self.assertRaises(ValueError): import_catalog(c, db)
            self.assertEqual(len(search(db, "Alpha")), 1)

    def test_empty_import_rolls_back_and_missing_search_db_stays_missing(self):
        with tempfile.TemporaryDirectory() as d:
            c, db = Path(d) / "c.json", Path(d) / "x.db"
            c.write_text(json.dumps(catalog()))
            import_catalog(c, db)
            empty = catalog(); empty["apps"] = []
            c.write_text(json.dumps(empty))
            with self.assertRaises(ValueError): import_catalog(c, db)
            self.assertEqual(len(search(db, "Alpha")), 1)
            missing = Path(d) / "missing.db"
            with self.assertRaises(sqlite3.OperationalError): search(missing, "Alpha")
            self.assertFalse(missing.exists())


if __name__ == "__main__": unittest.main()
