"""Release-manifest contract regressions; no installed files or services touched."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from argparse import Namespace
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "sidebar-release.py"
SPEC = importlib.util.spec_from_file_location("sidebar_release", SCRIPT)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class UiManifestTests(unittest.TestCase):
    def test_vite_diagnostic_maps_do_not_weaken_runtime_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "assets").mkdir()
            for name in ("index.html", "sw.js", "manifest.webmanifest"):
                (root / name).write_text("")
            runtime = b"export const sidebar = true;\n"
            (root / "assets/sidebar.js").write_bytes(runtime)
            runtime_sha = hashlib.sha256(runtime).hexdigest()
            generation = hashlib.sha256(
                f"assets/sidebar.js\0{len(runtime)}\0{runtime_sha}\n".encode()
            ).hexdigest()
            (root / "asset-manifest.json").write_text(json.dumps({
                "version": 1,
                "generation": generation,
                "assets": [{"path": "assets/sidebar.js", "sha256": runtime_sha,
                            "size": len(runtime)}],
            }))
            # Actual Vite producer excludes maps from the runtime manifest.
            (root / "assets/sidebar.js.map").write_text('{"version":3}')
            files = release.inventory(root)
            self.assertIn("assets/sidebar.js.map", files)
            self.assertEqual(release.validate_ui(root, files), generation)

            # The diagnostic exception must not admit unlisted executable code.
            (root / "assets/unlisted.js").write_text("throw new Error('unlisted');")
            with self.assertRaisesRegex(RuntimeError, "unlisted UI assets"):
                release.validate_ui(root, release.inventory(root))


class PublicationTests(unittest.TestCase):
    """Exercise real staging/writes only in synthetic, temporary code packages."""

    def setUp(self):
        (release.PROJECT / "tmp").mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=release.PROJECT / "tmp")
        self.root = Path(self.directory.name)
        self.target = self.root / "installed"
        self.build = self.root / "build"
        self.output = self.root / "stage"
        self.talk_path = "dist/talk-KEEP.js"
        self.backend_path = "dist/routes-OLD.js"
        old_index = (
            f"//#region {release.INDEX}\n"
            "function registerBrowserRoutes(app, ctx) {\n\treturn ctx;\n}\n//#endregion"
        )
        new_index = old_index.replace(
            "\treturn ctx;", "\tregisterBrowserInteractionRoutes(app, ctx);\n\treturn ctx;"
        )
        interaction = (
            f"//#region {release.NEW_REGIONS[0]}\n"
            "class BrowserInteractionStreams {}\n//#endregion\n"
            f"//#region {release.NEW_REGIONS[1]}\n"
            "const interactionStreamsByState = new WeakMap();\n"
            "function registerBrowserInteractionRoutes(app, ctx) {}\n//#endregion\n"
        )
        guard = (f"//#region {release.GUARD}\n"
                 "function withPageNavigationRequestGuard() {}\n//#endregion\n"
                 "export { withPageNavigationRequestGuard as b };\n")
        for package in (self.target, self.build):
            (package / "dist").mkdir(parents=True)
            (package / "package.json").write_text(json.dumps({"version": "2026.9.2", "type": "module"}))
            (package / "dist/guard-KEEP.js").write_text(guard)
            (package / "dist/dependency-KEEP.js").write_text("export const untouched = true;\n")
        prefix = 'import { untouched } from "./dependency-KEEP.js";\n'
        suffix = '\nexport { registerBrowserRoutes as r };\n'
        (self.target / self.backend_path).write_text(prefix + old_index + suffix)
        (self.build / "dist/routes-NEW.js").write_text(prefix + interaction + new_index + suffix)
        (self.target / self.talk_path).write_text("// installed Talk fix must survive\n")
        for source in [*release.NEW_REGIONS, release.INDEX]:
            path = self.build / source
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("// frozen source fixture\n")
        self.talk_manifest = self.root / "talk-manifest.json"
        self.talk_manifest.write_text(json.dumps({
            "status": "applied", "version": "2026.9.2", "files": [{
                "file": "talk-KEEP.js", "after_sha256": release.digest_at(self.target, self.talk_path),
            }],
        }))
        self.write_ui(self.target, "old")
        self.write_ui(self.build, "new")
        self.original = release.inventory(self.target / "dist")
        self.manifest = release.stage(Namespace(
            target_root=self.target, build_root=self.build, output=self.output,
            talk_manifest=self.talk_manifest,
        ))

    def tearDown(self):
        self.directory.cleanup()

    @staticmethod
    def write_ui(package, marker):
        root = package / "dist/control-ui"
        (root / "assets").mkdir(parents=True)
        contents = {"index.html": f'<script src="assets/{marker}.js"></script>',
                    "sw.js": f"// {marker}", "manifest.webmanifest": "{}",
                    f"assets/{marker}.js": f"// {marker} asset", "assets/common.js": f"// common {marker}"}
        assets, lines = [], []
        for name, text in sorted(contents.items()):
            data = text.encode()
            (root / name).write_bytes(data)
            digest = release.sha(data)
            assets.append({"path": name, "size": len(data), "sha256": digest})
            lines.append(f"{name}\0{len(data)}\0{digest}\n")
        (root / "asset-manifest.json").write_text(json.dumps({
            "version": 1, "generation": release.sha("".join(lines).encode()), "assets": assets,
        }))

    def test_stage_preserves_installed_graph_and_original_imports(self):
        self.assertEqual(release.inventory(self.target / "dist"), self.original)
        candidate = (self.output / "candidate" / self.backend_path).read_text()
        self.assertIn('from "./dependency-KEEP.js";', candidate)
        self.assertIn('from "./guard-KEEP.js";', candidate)
        self.assertIn("interactionStreamsByState = new WeakMap()", candidate)
        self.assertEqual(release.read_json(self.manifest)["phases"], {"backend": "staged", "ui": "staged"})

    def test_hash_fenced_publication_and_rollback_preserve_talk_and_old_assets(self):
        with self.assertRaisesRegex(RuntimeError, "apply backend before UI"):
            release.apply(self.manifest, self.target, "ui")
        release.apply(self.manifest, self.target, "backend")
        self.assertEqual((self.target / "dist/control-ui/index.html").read_text(),
                         '<script src="assets/old.js"></script>')
        written = []
        atomic = release.atomic

        def observe(destination, data, mode=0o600):
            if destination.is_relative_to(self.target):
                written.append(destination.relative_to(self.target).as_posix())
            return atomic(destination, data, mode)

        with mock.patch.object(release, "atomic", side_effect=observe):
            release.apply(self.manifest, self.target, "ui")
        self.assertEqual(written[-1], "dist/control-ui/index.html")
        self.assertTrue((self.target / "dist/control-ui/assets/old.js").exists())
        self.assertEqual(release.digest_at(self.target, self.talk_path), self.original["talk-KEEP.js"])
        release.verify(self.manifest, self.target)
        release.apply(self.manifest, self.target, None)
        for name, expected in self.original.items():
            self.assertEqual(release.digest_at(self.target / "dist", name), expected)
        self.assertTrue((self.target / "dist/control-ui/assets/new.js").exists())
        self.assertEqual(release.read_json(self.manifest)["phases"]["ui"], "rolled_back")

    def test_candidate_tampering_refuses_before_any_write(self):
        (self.output / "candidate" / self.backend_path).write_text("// tampered")
        with self.assertRaisesRegex(RuntimeError, "candidate drift"):
            release.apply(self.manifest, self.target, "backend")
        self.assertEqual(release.inventory(self.target / "dist"), self.original)

    def test_talk_drift_refuses_before_any_write(self):
        (self.target / self.talk_path).write_text("// separate later Talk patch")
        drifted = release.inventory(self.target / "dist")
        with self.assertRaisesRegex(RuntimeError, "preserved dependency/Talk patch drift"):
            release.apply(self.manifest, self.target, "backend")
        self.assertEqual(release.inventory(self.target / "dist"), drifted)

    def test_partial_failure_restores_overwrites_and_prevents_retry(self):
        release.apply(self.manifest, self.target, "backend")
        atomic = release.atomic

        def fail_index(destination, data, mode=0o600):
            if destination == self.target / "dist/control-ui/index.html":
                raise OSError("simulated index publication failure")
            return atomic(destination, data, mode)

        with mock.patch.object(release, "atomic", side_effect=fail_index):
            with self.assertRaisesRegex(OSError, "simulated index"):
                release.apply(self.manifest, self.target, "ui")
        for name, expected in self.original.items():
            if name.startswith("control-ui/"):
                self.assertEqual(release.digest_at(self.target / "dist", name), expected)
        self.assertEqual(release.read_json(self.manifest)["phases"]["ui"], "failed")
        with self.assertRaisesRegex(RuntimeError, "phase already attempted"):
            release.apply(self.manifest, self.target, "ui")

    def test_rollback_refuses_to_overwrite_concurrent_change(self):
        release.apply(self.manifest, self.target, "backend")
        release.apply(self.manifest, self.target, "ui")
        (self.target / "dist/control-ui/assets/common.js").write_text("// concurrent fix")
        before = release.inventory(self.target / "dist")
        with self.assertRaisesRegex(RuntimeError, "refusing rollback over concurrent change"):
            release.apply(self.manifest, self.target, None)
        after = release.inventory(self.target / "dist")
        after.pop(".sidebar-release.lock")
        self.assertEqual(after, before)
        self.assertTrue((self.target / "dist/.sidebar-release.lock").exists())

    def test_stale_build_is_rejected_without_changing_target(self):
        built = self.build / "dist/routes-NEW.js"
        built.write_text(built.read_text().replace("interactionStreamsByState = new WeakMap()", "streams = new Map()"))
        with self.assertRaisesRegex(RuntimeError, "stale build"):
            release.transplant(self.target, self.build)
        self.assertEqual(release.inventory(self.target / "dist"), self.original)


if __name__ == "__main__":
    unittest.main()
