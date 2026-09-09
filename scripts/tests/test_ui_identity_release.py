"""Synthetic UI-only release identity/publication regressions; no real installation."""
import importlib.util
import json
from argparse import Namespace
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("ui_identity_release", Path(__file__).resolve().parents[1] / "ui-identity-release.py")
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)
release = publisher.release


class IdentityPublicationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=release.PROJECT / "tmp")
        self.root = Path(self.directory.name)
        self.target, self.ui = self.root / "installed", self.root / "ui"
        self.output = self.root / "stage"
        (self.target / "dist").mkdir(parents=True)
        (self.target / "package.json").write_text(json.dumps({"version": "2026.9.2"}))
        (self.target / "dist/build-info.json").write_text(json.dumps({"buildId": "2026.9.2-test"}))
        (self.target / "dist/routes-KEEP.js").write_text(f"//#region {release.INDEX}\nconst a = 1;\n//#endregion\n")
        (self.target / "dist/talk-KEEP.js").write_text("// preserved Talk repair\n")
        self.write_ui(self.target / "dist/control-ui", "old")
        self.write_ui(self.ui, "new")
        self.before = release.inventory(self.target)

    def tearDown(self):
        self.directory.cleanup()

    def write_ui(self, root, marker, compiled="2026.9.2-test", worker="2026.9.2-test", html="2026.9.2-test"):
        (root / "assets").mkdir(parents=True, exist_ok=True)
        contents = {"index.html": f'<html data-openclaw-control-ui-build-id="{html}">{marker}</html>',
                    "sw.js": f'const EMBEDDED_CACHE_VERSION = "{worker}";',
                    "manifest.webmanifest": "{}",
                    f"assets/control-ui-core-{marker}.js": f'const a={{buildId:`{compiled}`}};',
                    "assets/common.js": f"// {marker}"}
        assets, lines = [], []
        for name, text in sorted(contents.items()):
            data = text.encode()
            (root / name).write_bytes(data)
            digest = release.sha(data)
            assets.append({"path": name, "size": len(data), "sha256": digest})
            lines.append(f"{name}\0{len(data)}\0{digest}\n")
        (root / "asset-manifest.json").write_text(json.dumps({
            "version": 1, "generation": release.sha("".join(lines).encode()), "assets": assets}))

    def stage(self):
        return publisher.stage(Namespace(target_root=self.target, ui_root=self.ui, output=self.output))

    def test_identity_mismatches_reject_before_staging_or_target_writes(self):
        for field in ("compiled", "worker", "html"):
            with self.subTest(field=field):
                self.write_ui(self.ui, "new", **{field: "wrong"})
                with self.assertRaisesRegex(RuntimeError, "identity does not match"):
                    self.stage()
                self.assertFalse(self.output.exists())
                self.assertEqual(release.inventory(self.target), self.before)

    def test_ui_only_publication_index_last_and_rollback_retains_old_and_new_assets(self):
        path = self.stage()
        self.assertEqual(release.inventory(self.target), self.before)
        manifest = publisher.verify(path, self.target)
        self.assertTrue(all(e["phase"] == "ui" for e in manifest["files"]))
        written, atomic = [], release.atomic

        def observe(destination, data, mode=0o600):
            if destination.is_relative_to(self.target):
                written.append(destination.relative_to(self.target).as_posix())
            return atomic(destination, data, mode)

        with mock.patch.object(release, "atomic", side_effect=observe):
            release.apply(path, self.target, "ui")
        self.assertEqual(written[-1], "dist/control-ui/index.html")
        self.assertTrue(all(name.startswith("dist/control-ui/") for name in written))
        publisher.verify(path, self.target)
        release.apply(path, self.target, None)
        publisher.verify(path, self.target)
        for name, digest in self.before.items():
            self.assertEqual(release.digest_at(self.target, name), digest)
        self.assertTrue((self.target / "dist/control-ui/assets/control-ui-core-new.js").exists())

    def test_backend_or_identity_drift_blocks_before_ui_write(self):
        path = self.stage()
        (self.target / "dist/talk-KEEP.js").write_text("// independently updated")
        changed = release.inventory(self.target)
        with self.assertRaisesRegex(RuntimeError, "preserved dependency"):
            publisher.verify(path, self.target)
        self.assertEqual(release.inventory(self.target), changed)

    def test_candidate_tampering_blocks_before_ui_write(self):
        path = self.stage()
        (path.parent / "candidate/dist/control-ui/sw.js").write_text("// tampered")
        with self.assertRaisesRegex(RuntimeError, "candidate drift|staged UI graph changed"):
            publisher.verify(path, self.target)
        self.assertEqual(release.inventory(self.target), self.before)


if __name__ == "__main__":
    unittest.main()
