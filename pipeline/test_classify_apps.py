import json, tempfile, unittest, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from classify_apps import evidence_hash, main, validate_answers

class ClassifyTests(unittest.TestCase):
    def test_malformed(self):
        with self.assertRaises(ValueError): validate_answers({"answers": {}})
    def test_hash(self): self.assertNotEqual(evidence_hash({"description": "a"}), evidence_hash({"description": "b"}))
    def test_dry_run_skips_missing_description(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / "data.json"; source.write_text(json.dumps({"apps": [{"id": "1"}, {"id": "2", "description": "works"}]}))
            self.assertEqual(main(["--input", str(source), "--db", str(Path(d) / "x.db")]), 0)

if __name__ == "__main__": unittest.main()
