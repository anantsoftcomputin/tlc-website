import json
import tempfile
import unittest
from pathlib import Path
from build_corpus import build
from train_local import verify_dataset
from evaluate_local import check


class CorpusTests(unittest.TestCase):
    def test_evidence_splits_and_private_field_projection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [{"version": "tbo-facts-v1", "source": "tbo-static", "hotelCode": str(index), "name": f"Property {index}", "city": "Dubai", "country": "UAE", "stars": 4, "facilities": ["Pool", f"Facility {index}"], "contentHash": f"hash-{index}", "retrievedAt": "2026-10-07", "secret": "NEVER-EXPORT", "customerEmail": "private@example.com", "bookingCode": "PRIVATE-BOOKING"} for index in range(20)]
            source = root / "source.jsonl"
            source.write_text("\n".join(json.dumps(record) for record in records))
            output = root / "dataset"
            manifest = build(source, output)
            self.assertFalse(manifest["productionEligible"])
            self.assertEqual(verify_dataset(output), manifest)
            groups = []
            for split in ("train", "valid", "test"):
                text = (output / f"{split}.jsonl").read_text()
                self.assertNotIn("NEVER-EXPORT", text)
                self.assertNotIn("private@example.com", text)
                self.assertNotIn("PRIVATE-BOOKING", text)
                expected = set(manifest["splits"][split]["hotels"])
                for line in text.splitlines():
                    row = json.loads(line)
                    self.assertTrue(set(item["id"] for item in row["provenance"]["evidence"]) <= expected)
                    self.assertFalse(row["provenance"]["customerOutcome"])
                    json.loads(row["messages"][-1]["content"])
                    self.assertEqual(check(row, row["messages"][-1]["content"]), {"json": True, "task": True})
                groups.append(expected)
            self.assertEqual(sum(map(len, groups)), len(set.union(*groups)))
            with (output / "train.jsonl").open("a") as stream:
                stream.write("{}\n")
            with self.assertRaisesRegex(ValueError, "Dataset changed"):
                verify_dataset(output)

    def test_rejects_unprovenanced_input(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.jsonl"
            source.write_text('{"source":"unknown","hotelCode":"1"}')
            with self.assertRaisesRegex(ValueError, "allowlisted"):
                build(source, Path(directory) / "out")


if __name__ == "__main__":
    unittest.main()
