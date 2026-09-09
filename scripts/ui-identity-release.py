#!/usr/bin/env python3
"""Stage/publish a complete UI graph matching the installed Gateway build identity.

No builds, config edits, backend writes or service actions. Stage is read-only for
the target. Apply is explicit, hash-fenced and atomic per file, with index last.
Old hashed assets remain available. The shared release lock is never bypassed.
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import re

SPEC = importlib.util.spec_from_file_location("sidebar_release", Path(__file__).with_name("sidebar-release.py"))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
KIND = "ui-build-identity-only-v1"


def identity(target: Path, ui: Path) -> str:
    expected = release.read_json(target / "dist/build-info.json").get("buildId")
    release.check(isinstance(expected, str) and bool(re.fullmatch(r"[A-Za-z0-9._-]+", expected)),
                  "installed build identity missing or invalid")
    # These are emitted by Vite's compiled build-info object, not source maps or
    # comments. Refuse ambiguous/missing owners instead of guessing from filenames.
    compiled = []
    for path in sorted((ui / "assets").glob("control-ui-core-*.js")):
        compiled.extend(re.findall(r"\bbuildId\s*:\s*([\"'`])([A-Za-z0-9._-]+)\1", path.read_text()))
    release.check(len(compiled) == 1 and compiled[0][1] == expected,
                  "compiled frontend build identity does not match installed Gateway")
    worker = re.findall(r"\bconst\s+EMBEDDED_CACHE_VERSION\s*=\s*([\"'`])([A-Za-z0-9._-]+)\1",
                        (ui / "sw.js").read_text())
    release.check(len(worker) == 1 and worker[0][1] == expected,
                  "service worker build identity does not match installed Gateway")
    document = re.findall(r'data-openclaw-control-ui-build-id=["\']([^"\']+)["\']',
                          (ui / "index.html").read_text())
    release.check(len(document) == 1 and bool(re.fullmatch(re.escape(expected) + r"(?:-[a-f0-9]{64})?", document[0])),
                  "HTML build identity does not match installed Gateway")
    return expected


def verify(path: Path, target: Path) -> dict:
    manifest = release.read_json(path)
    release.check(manifest.get("kind") == KIND, "not a UI-only identity release")
    release.check(all(e["phase"] == "ui" and e["path"].startswith("dist/control-ui/")
                      for e in manifest["files"]), "UI-only publisher rejects backend write targets")
    result = release.verify(path, target)
    release.check(identity(target, path.parent / "candidate/dist/control-ui") == manifest["build_id"],
                  "release build identity drift")
    return result


def stage(args: argparse.Namespace) -> Path:
    target, ui, output = args.target_root.resolve(), args.ui_root.resolve(), args.output.resolve()
    release.check(output.is_relative_to(release.PROJECT) and not output.exists(),
                  "new stage must be inside this project")
    release.check(not output.is_relative_to(target) and not target.is_relative_to(output)
                  and not output.is_relative_to(ui) and not ui.is_relative_to(output), "stage overlaps input")
    files = release.inventory(ui)
    generation = release.validate_ui(ui, files)
    build_id = identity(target, ui)  # Admission gate runs before even staging writes.
    backend_path, backend_code = release.owner_bundle(target / "dist", release.INDEX)
    backend = "dist/" + backend_path.name
    preserved = {"dist/" + p.name: release.sha(p.read_bytes())
                 for p in sorted((target / "dist").glob("*.js"))}
    for name in ("package.json", "dist/build-info.json"):
        preserved[name] = release.digest_at(target, name)
    before_ui = release.inventory(target / "dist/control-ui")
    records = []
    output.mkdir(parents=True)
    # Read-only backend snapshot satisfies the shared verifier; it is preserved,
    # never a write record, and never published by this wrapper.
    snapshot = release.safe(output / "candidate", backend)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    release.atomic(snapshot, backend_code.encode(), 0o644)
    for name, after in files.items():
        relative = "dist/control-ui/" + name
        old = release.safe(target, relative)
        before = release.digest_at(target, relative)
        data = release.safe(ui, name).read_bytes()
        release.check(release.sha(data) == after, f"UI build changed while staging: {name}")
        mode = old.stat().st_mode & 0o777 if old.exists() else 0o644
        candidate = release.safe(output / "candidate", relative)
        candidate.parent.mkdir(parents=True, exist_ok=True)
        release.atomic(candidate, data, mode)
        if before == after:
            continue
        if before is not None:
            data = old.read_bytes()
            release.check(release.sha(data) == before, f"target changed while backing up: {name}")
            backup = release.safe(output / "original", relative)
            backup.parent.mkdir(parents=True, exist_ok=True)
            release.atomic(backup, data, mode)
        records.append({"path": relative, "phase": "ui", "before": before, "after": after,
                        "mode": mode, "current": "before"})
    manifest = {"format": 1, "kind": KIND, "target_root": str(target),
                "version": release.read_json(target / "package.json")["version"], "build_id": build_id,
                "backend": backend, "ui_root": str(ui), "preserved": preserved,
                "ui_before": before_ui, "ui_candidate": files, "ui_generation": generation,
                "files": records, "phases": {"backend": "applied", "ui": "staged"}}
    path = output / "manifest.json"
    release.save(path, manifest)
    verify(path, target)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["stage", "verify", "apply-ui", "rollback"])
    parser.add_argument("--target-root", type=Path, required=True)
    parser.add_argument("--ui-root", type=Path, help="complete frozen Vite output directory")
    parser.add_argument("--output", type=Path, help="new project-local stage; target remains untouched")
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    if args.mode == "stage":
        release.check(bool(args.ui_root and args.output), "stage needs ui-root and output")
        path = stage(args)
    else:
        release.check(args.manifest is not None, "manifest is required")
        path, target = args.manifest.resolve(), args.target_root.resolve()
        verify(path, target)
        if args.mode != "verify":
            release.apply(path, target, None if args.mode == "rollback" else "ui")
            verify(path, target)
    print(path)


if __name__ == "__main__":
    main()
