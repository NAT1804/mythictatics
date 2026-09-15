#!/usr/bin/env python3
"""Surveys a shipped Mythic Tactics client before anything is extracted from it.

Two jobs, in order.

First, prove the file is the publisher's. It arrived from a mirror, not from Google Play, so
nothing about it is trusted yet: the package name, the version name and the signing certificate
all get read back and printed. The version name has to match what the App Store reports for the
live build (Apple's lookup API for `id6746439230`, whose `version` Hexpion writes and ships), and
the signer has to be the same certificate across every build you ever feed this. A repackaged APK
fails both.

Second, report how the game's assets are actually laid out, because that decides how the real
extractor has to be written. Unity ships art three different ways — loose in `assets/bin/Data`,
in Addressables bundles under `assets/aa`, or in an OBB / Play asset pack alongside the APK —
and the identifier a card's image carries is different in each. Nothing is exported here; this
only looks, so a wrong guess costs a rerun rather than a directory full of mislabelled PNGs.

Usage:
    tools/client/.venv/Scripts/python.exe tools/client/inspect_build.py <build> [--json OUT]

`<build>` is the .apk, .xapk, .apks or .zip you downloaded, or a directory holding the unpacked
set (base APK plus any .obb / config splits).
"""

from __future__ import annotations

import argparse
import collections
import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

# A Unity object is worth a closer look only if it can carry art or card data.
INTERESTING_TYPES = {"Texture2D", "Sprite", "TextAsset", "MonoBehaviour", "AssetBundle"}
# Sampling caps — a full pass over ~700 MB of bundles is the extractor's job, not the survey's.
MAX_BUNDLES_SAMPLED = 12
MAX_SAMPLES_PER_KIND = 15
# Anything this size is a container worth opening; smaller entries are icons and config.
BUNDLE_SUFFIXES = (".bundle", ".unity3d", ".assets", ".dat", ".resource", ".ress", ".split0")


def fmt(size: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"


# --- locating the pieces ------------------------------------------------------------------


def collect_members(target: Path) -> tuple[list[tuple[str, int]], dict[str, bytes | Path]]:
    """Returns (listing, openable) where `openable` maps a name to bytes or an on-disk path.

    An .xapk/.apks is a zip of APKs and OBBs, so it is flattened one level: the caller sees the
    inner archives directly instead of having to know which wrapper it was handed.
    """
    listing: list[tuple[str, int]] = []
    openable: dict[str, bytes | Path] = {}

    if target.is_dir():
        for path in sorted(target.rglob("*")):
            if path.is_file():
                name = str(path.relative_to(target))
                listing.append((name, path.stat().st_size))
                openable[name] = path
        return listing, openable

    if target.suffix.lower() in {".xapk", ".apks", ".zip"}:
        with zipfile.ZipFile(target) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                listing.append((info.filename, info.file_size))
                if info.filename.lower().endswith((".apk", ".obb")):
                    openable[info.filename] = archive.read(info.filename)
        if openable:
            return listing, openable
        # A plain .zip that holds no APK is most likely the APK itself, misnamed.

    listing.append((target.name, target.stat().st_size))
    openable[target.name] = target
    return listing, openable


def as_zip(blob: bytes | Path) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(blob) if isinstance(blob, bytes) else blob)


# --- provenance ---------------------------------------------------------------------------


@contextlib.contextmanager
def materialize(blob: bytes | Path):
    """Yields an on-disk path for `blob`, spilling an inner APK to a temp file if need be.

    Both readers below want a real file, and pyaxmlparser holds its handle open past the call,
    so the name has to be unique per invocation and the cleanup has to tolerate a live handle.
    """
    if isinstance(blob, Path):
        yield blob
        return
    handle = tempfile.NamedTemporaryFile(suffix=".apk", delete=False)
    try:
        handle.write(blob)
        handle.close()
        yield Path(handle.name)
    finally:
        with contextlib.suppress(OSError):
            os.unlink(handle.name)


def read_manifest(path: Path) -> dict:
    """package / versionName / versionCode, plus the permission list.

    The permissions are printed rather than checked: a repackaged APK usually has to add some
    (INTERNET plus whatever the injected payload wants), so an unexplained entry is the cheapest
    tell there is that this build is not the publisher's.
    """
    from pyaxmlparser import APK  # imported late; the survey should still list a non-APK file

    apk = APK(str(path))
    return {
        "package": apk.package,
        "versionName": apk.version_name,
        "versionCode": apk.version_code,
        "minSdk": apk.get_min_sdk_version(),
        "targetSdk": apk.get_target_sdk_version(),
        "permissions": sorted(apk.get_permissions()),
    }


def read_signer(path: Path) -> dict:
    """The v1 signing certificate, via the JDK's keytool.

    There is no published fingerprint to compare against, so this cannot prove authenticity on
    its own. What it gives you is an anchor: record it once, and every later build that differs
    was signed by someone else.
    """
    keytool = shutil.which("keytool")
    if not keytool:
        return {"error": "keytool not on PATH (needs a JDK, not just a JRE)"}
    try:
        out = subprocess.run(
            [keytool, "-printcert", "-jarfile", str(path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {"error": "keytool timed out"}
    if out.returncode != 0:
        return {"error": (out.stderr or out.stdout).strip()[:400]}

    text = out.stdout
    sha256 = re.search(r"SHA256:\s*([0-9A-F:]+)", text)
    # keytool exits 0 on a jar with no signature block and simply prints nothing useful.
    if not sha256:
        return {"error": "no v1 signature block — this APK is unsigned or was re-zipped"}
    return {
        "owner": (re.search(r"Owner:\s*(.+)", text) or [None, None])[1],
        "issuer": (re.search(r"Issuer:\s*(.+)", text) or [None, None])[1],
        "validFrom": (re.search(r"Valid from:\s*(.+)", text) or [None, None])[1],
        "sha256": sha256[1],
    }


# --- Unity layout -------------------------------------------------------------------------


def classify(names: list[str]) -> dict:
    """Which of Unity's three shipping shapes this build uses, and where each one lives."""
    layout = {
        "binData": sorted(n for n in names if "assets/bin/Data/" in n.replace("\\", "/")),
        "addressables": sorted(n for n in names if "/aa/" in n.replace("\\", "/") or n.replace("\\", "/").startswith("assets/aa")),
        "streamingAssets": sorted(
            n for n in names if "assets/StreamingAssets" in n or "StreamingAssets/" in n
        ),
        "bundles": sorted(n for n in names if n.lower().endswith(BUNDLE_SUFFIXES)),
        "catalogs": sorted(n for n in names if re.search(r"catalog.*\.(json|bin|hash)$", n, re.I)),
    }
    return {key: value for key, value in layout.items() if value}


def unity_version_and_objects(entries: list[tuple[str, bytes]]) -> dict:
    """Opens a sample of Unity files and reports what is inside them.

    `container` is the point of the whole exercise: for an Addressables build it is the original
    project path (`Assets/Art/Champions/champ004_Anu.png`), which is the stable per-image
    identifier the card data joins against. If it comes back empty, the ids have been stripped
    from the bundles and the extractor has to fall back on the card tables instead.
    """
    import UnityPy

    types = collections.Counter()
    unity_versions = collections.Counter()
    samples: dict[str, list[dict]] = collections.defaultdict(list)
    containers_seen = 0
    objects_seen = 0
    failures: list[str] = []

    for name, blob in entries:
        try:
            env = UnityPy.load(blob)
        except Exception as error:  # a non-Unity file in the sample is expected, not fatal
            failures.append(f"{name}: {type(error).__name__}: {error}")
            continue

        for obj in env.objects:
            objects_seen += 1
            kind = obj.type.name
            types[kind] += 1
            if getattr(obj.assets_file, "unity_version", None):
                unity_versions[obj.assets_file.unity_version] += 1
            if kind not in INTERESTING_TYPES:
                continue

            container = getattr(obj, "container", None)
            if container:
                containers_seen += 1
            if len(samples[kind]) >= MAX_SAMPLES_PER_KIND:
                continue
            try:
                data = obj.read()
                label = getattr(data, "m_Name", None) or getattr(data, "name", None)
            except Exception:
                label = None
            samples[kind].append(
                {"source": name, "name": label, "container": container, "pathId": obj.path_id}
            )

    return {
        "unityVersions": dict(unity_versions.most_common()),
        "objectsSeen": objects_seen,
        "objectsWithContainer": containers_seen,
        "typeHistogram": dict(types.most_common(25)),
        "samples": {k: v for k, v in samples.items()},
        "loadFailures": failures[:10],
    }


# --- main ---------------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("build", type=Path, help=".apk / .xapk / .apks / .zip, or an unpacked directory")
    parser.add_argument("--json", type=Path, help="write the full survey here")
    args = parser.parse_args()

    if not args.build.exists():
        print(f"not found: {args.build}", file=sys.stderr)
        return 2

    report: dict = {"build": str(args.build.resolve()), "sizeBytes": None, "parts": []}
    if args.build.is_file():
        report["sizeBytes"] = args.build.stat().st_size

    listing, openable = collect_members(args.build)
    print(f"{args.build.name} — {len(listing)} entries")
    if report["sizeBytes"]:
        print(f"  size {fmt(report['sizeBytes'])}")

    apks = [(n, b) for n, b in openable.items() if n.lower().endswith(".apk")]
    others = [(n, b) for n, b in openable.items() if not n.lower().endswith(".apk")]
    if not apks and args.build.is_dir():
        print("  no .apk found in the directory", file=sys.stderr)

    for name, blob in sorted(others, key=lambda item: item[0]):
        size = len(blob) if isinstance(blob, bytes) else blob.stat().st_size
        print(f"  companion: {name} ({fmt(size)})")
        report["parts"].append({"name": name, "kind": "companion", "sizeBytes": size})

    for name, blob in sorted(apks, key=lambda item: item[0]):
        size = len(blob) if isinstance(blob, bytes) else blob.stat().st_size
        part: dict = {"name": name, "kind": "apk", "sizeBytes": size}
        print(f"\n  apk: {name} ({fmt(size)})")

        with materialize(blob) as apk_path:
            try:
                part["manifest"] = read_manifest(apk_path)
                m = part["manifest"]
                print(f"    package {m['package']}  versionName {m['versionName']}  versionCode {m['versionCode']}")
                print(f"    permissions: {', '.join(m['permissions']) or '(none)'}")
            except Exception as error:
                part["manifest"] = {"error": f"{type(error).__name__}: {error}"}
                print(f"    manifest unreadable: {part['manifest']['error']}")

            part["signer"] = read_signer(apk_path)
            signer = part["signer"]
            if "error" in signer:
                print(f"    signer: {signer['error']}")
            else:
                print(f"    signer: {signer['owner']}")
                print(f"    sha256: {signer['sha256']}")

        with as_zip(blob) as archive:
            names = archive.namelist()
            part["entryCount"] = len(names)
            part["layout"] = classify(names)
            for key, values in part["layout"].items():
                print(f"    {key}: {len(values)} — e.g. {', '.join(values[:3])}")

            candidates = [n for n in names if n.lower().endswith(BUNDLE_SUFFIXES)]
            candidates += [n for n in names if "assets/bin/Data/" in n and n.count("/") == 3]
            # Biggest first: the card tables and the art atlases are never in the small files.
            candidates = sorted(set(candidates), key=lambda n: -archive.getinfo(n).file_size)
            picked = candidates[:MAX_BUNDLES_SAMPLED]
            part["sampled"] = picked
            if picked:
                print(f"    sampling {len(picked)} of {len(candidates)} Unity files")
                entries = [(n, archive.read(n)) for n in picked]
                part["unity"] = unity_version_and_objects(entries)
                u = part["unity"]
                print(f"    unity {', '.join(u['unityVersions']) or 'unknown'}")
                print(f"    {u['objectsSeen']} objects, {u['objectsWithContainer']} carry a container path")
                for kind, count in u["typeHistogram"].items():
                    print(f"      {kind}: {count}")
                for kind, rows in u["samples"].items():
                    for row in rows[:5]:
                        print(f"      [{kind}] {row['name']!r} container={row['container']!r}")
            else:
                print("    no Unity containers in this APK (probably a config split)")

        report["parts"].append(part)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"\nfull survey -> {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
