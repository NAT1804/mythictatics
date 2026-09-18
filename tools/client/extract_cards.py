#!/usr/bin/env python3
"""Extracts card art and card text from a shipped Mythic Tactics client into `data/client/`.

Run `inspect_build.py` first — it is what establishes the file is the publisher's and that the
build is laid out the way this script assumes.

Where the identifiers come from
-------------------------------
Every card image is a Sprite inside one per-realm atlas bundle, and the game names those sprites
itself: `babylon_card_character_5001`, `gods_card_character_09`, `spell-art_42`. That name is the
identifier — it is what the client ships, so it is exact by construction rather than by anyone's
reading of a card.

Card *text* is keyed separately, in the localization tables: `m05001_name`, `champ009_name`,
`s_042_name`, across English, Vietnamese, both Chinese scripts, Korean and Japanese. Those keys
are the game's own card ids.

Binding the two is arithmetic, and the build proves the rule rather than the rule being assumed:
a unit sprite's number is the numeric tail of its `m` id (`5001` -> `m05001`), a god's is its
`champ` id (`09` -> `champ009`), a spell's is its `s_` id (`42` -> `s_042`). Spells come in two
families and the width of the padding is what separates them: a plain spell is three digits
(`s_042`), while a realm's own spells carry the realm number in front and run to five
(`spell-art_4001` -> `s_04001`, a Shenzhou Medicine). The realm numbers are not hardcoded here;
they are read back off the unit sprites, which state them (`babylon_card_character_5001` is what
makes Babylon realm 5).

A god carries two more pictures that are not its card — the icon for its Power and the tall banner
the game stands it up in — and the game numbers both the way it numbers the card, so both bind by
the same arithmetic: `icon_power_16` and `icon_god-flag_16` are Erlang Shen's. Each ships in a
bundle of its own and is extracted in a pass of its own; see `extract_god_art` for why neither can
ride along with the card art.

What does not bind is reported rather than guessed at, in `unresolved.json`. In v1.5.7 that is
art the game still ships for content it no longer lists — one Olympus unit and seven spells with
no entry in any localization table. An id bound to the wrong picture is worse than an id openly
left unbound.

Usage:
    tools/client/.venv/Scripts/python.exe tools/client/extract_cards.py <build> [--out data/client]
    ... --no-images     tables and card text only, skip the PNG export
"""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import UnityPy

# The pack the art and the data tables live in; the base APK carries only code and boot assets.
DATA_PACK = "UnityDataAssetPack.apk"
DATAPACK_BUNDLE = "assets/bin/Data/datapack.unity3d"
# `medicine` is Shenzhou's own spell atlas; it sits outside the shared `spells` one.
ART_BUNDLE = re.compile(r"caelus_assets_(unit_[a-z]+|spells|medicine)_[0-9a-f]{32}\.bundle$")

# Icons the site needs but no card owns: the realm marks that card text embeds as
# `<sprite name=icon_babylon>`, and the ladder badges. Kept apart from the card atlases so they
# never look like art that failed to bind.
ICON_BUNDLES = {
    # Everything card text can embed: the eight realm marks, every keyword icon, and the stat
    # and currency glyphs.
    "description": re.compile(r"^icon-descriptionicons_assets_all_[0-9a-f]{32}\.bundle$"),
    "rank": re.compile(r"^caelus_assets_icon_player_rank_[0-9a-f]{32}\.bundle$"),
    # A card's Tier, drawn as that many stars. The game files these under "rarity".
    "tier": re.compile(r"^caelus_assets_rarity_[0-9a-f]{32}\.bundle$"),
}

# Art that belongs to a god but is not the god's card: the Power's icon, and the tall banner the
# game stands the god up in. Both are in bundles of their own and both are numbered the way the
# god's card is — `icon_power_16` and `icon_god-flag_16` are Erlang Shen's — so both bind by the
# same arithmetic, and neither is a card.
#
# They are not entries in ICON_BUNDLES, because those are icons no card owns, and not in
# ART_BUNDLE, because binding them there would leave every god holding three sprites with nothing
# to say which of them is the card.
#
# The two do not cover the same gods, which is why each is asked for separately rather than
# assumed from the other: 1.5.7 ships a Power icon for exactly the twenty gods the game offers,
# and a banner for twenty-four — four of them for gods that have no card at all.
GOD_ART = {
    "power": (
        re.compile(r"^caelus_assets_icon_power_[0-9a-f]{32}\.bundle$"),
        re.compile(r"^icon_power_(\d+)$"),
    ),
    "banner": (
        re.compile(r"^caelus_assets_icon_god_flag_[0-9a-f]{32}\.bundle$"),
        re.compile(r"^icon_god-flag_(\d+)$"),
    ),
}

# `rarity-star_05-2` is Tier 5 in its second layout; `rarity-star_06` has only one. The layouts
# are arrangements of the same star count — `-2` is the single row, which is what a card list
# wants — so the tier is recorded separately from the variant rather than left in the name.
TIER_SPRITE = re.compile(r"^rarity-star_(\d{2})(?:-(\d))?(_\w+)?$")

# `Vietnamese (Vietnam)(vi-VN)` -> `vi-VN`. The tables carry the locale in the column header.
LOCALE_COLUMN = re.compile(r"\(([a-z]{2}(?:-[A-Za-z]{2,4})?)\)\s*$")

SPRITE_PATTERNS = (
    # (regex over the sprite name, how to build the card id from the captured number)
    (re.compile(r"^gods_card_character_(\d+)$"), lambda n: f"champ{int(n):03d}"),
    (re.compile(r"^[a-z]+_card_character_(\d+)$"), lambda n: f"m{int(n):05d}"),
    # Four digits or more means the leading ones are a realm number, and the id pads to five.
    (re.compile(r"^spell-art_(\d+)$"), lambda n: f"s_{int(n):05d}" if int(n) >= 1000 else f"s_{int(n):03d}"),
)

UNIT_SPRITE = re.compile(r"^([a-z]+)_card_character_(\d+)$")

# Which table holds which kind of card. The field name is whatever follows the id rather than an
# allow-list, so a patch that adds a field to a card carries through instead of being dropped.
TABLES = {
    "unit": ("MinionLocalize", re.compile(r"^(m\d+)_(.+)$")),
    "god": ("ChampionLocalize", re.compile(r"^(champ\d+)_(.+)$")),
    "spell": ("SpellLocalize", re.compile(r"^(s_\d+)_(.+)$")),
}

# The `*Format` tables compose each card's final string, and they name every keyword the text
# leans on as `keyword_translator#<key>`. That is the game stating a card's keywords, so it beats
# re-reading them out of the rendered text.
FORMAT_TABLES = {"unit": "MinionFormat", "god": "ChampionFormat", "spell": "SpellFormat"}
KEYWORD_REF = re.compile(r"keyword_translator#([a-z0-9_]+)")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def open_data_pack(build: Path) -> tuple[zipfile.ZipFile, dict]:
    """Returns the asset pack as a zip, plus whatever the base APK says about the version."""
    if build.suffix.lower() in {".xapk", ".apks", ".zip"}:
        with zipfile.ZipFile(build) as outer:
            names = outer.namelist()
            if DATA_PACK not in names:
                raise SystemExit(f"{build.name} has no {DATA_PACK} — run inspect_build.py on it")
            pack = zipfile.ZipFile(io.BytesIO(outer.read(DATA_PACK)))
            base = next((n for n in names if n.endswith(".apk") and n != DATA_PACK), None)
            meta = read_version(outer.read(base)) if base else {}
        return pack, meta

    pack = zipfile.ZipFile(build)
    if DATAPACK_BUNDLE not in pack.namelist():
        raise SystemExit(f"{build.name} holds no {DATAPACK_BUNDLE} — is this the base APK only?")
    return pack, read_version(build.read_bytes())


def read_version(apk_bytes: bytes) -> dict:
    import tempfile
    import os
    import contextlib

    from pyaxmlparser import APK

    handle = tempfile.NamedTemporaryFile(suffix=".apk", delete=False)
    try:
        handle.write(apk_bytes)
        handle.close()
        apk = APK(handle.name)
        return {
            "package": apk.package,
            "versionName": apk.version_name,
            "versionCode": apk.version_code,
        }
    except Exception as error:
        return {"error": f"{type(error).__name__}: {error}"}
    finally:
        with contextlib.suppress(OSError):
            os.unlink(handle.name)


# --- localization tables ------------------------------------------------------------------


def read_tables(pack: zipfile.ZipFile) -> dict[str, bytes]:
    env = UnityPy.load(pack.read(DATAPACK_BUNDLE))
    tables: dict[str, bytes] = {}
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        data = obj.read()
        script = data.m_Script
        raw = script.encode("utf-8", "surrogateescape") if isinstance(script, str) else bytes(script)
        # Spine skeletons and atlases ship as TextAssets too; they are art, not data.
        if raw[:1] == b"{" or data.m_Name.endswith(".atlas"):
            continue
        tables[data.m_Name] = raw
    return tables


def parse_table(raw: bytes) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """Returns (locale by column header, rows keyed by the table's Key column)."""
    reader = csv.reader(io.StringIO(raw.decode("utf-8", "replace")))
    header = next(reader, None)
    if not header:
        return {}, {}

    locales = {}
    for index, column in enumerate(header):
        if match := LOCALE_COLUMN.search(column.strip()):
            locales[index] = match.group(1)

    rows: dict[str, dict[str, str]] = {}
    for row in reader:
        if not row or not row[0].strip():
            continue
        rows[row[0].strip()] = {
            locale: row[index].strip() for index, locale in locales.items() if index < len(row)
        }
    return locales, rows


def parse_raw_rows(raw: bytes) -> dict[str, list[str]]:
    """Key column -> every other column, for tables whose columns are not locales."""
    reader = csv.reader(io.StringIO(raw.decode("utf-8", "replace")))
    next(reader, None)
    return {
        row[0].strip(): [cell for cell in row[1:]]
        for row in reader
        if row and row[0].strip()
    }


def build_cards(tables: dict[str, bytes]) -> tuple[dict[str, dict], list[str]]:
    cards: dict[str, dict] = {}
    locales_used: set[str] = set()
    keyword_keys = declared_keywords(tables)

    for kind, (table_name, key_shape) in TABLES.items():
        if table_name not in tables:
            print(f"  WARN {table_name} is missing from the build", file=sys.stderr)
            continue
        locales, rows = parse_table(tables[table_name])
        locales_used.update(locales.values())

        for key, values in rows.items():
            match = key_shape.match(key)
            if not match:
                continue
            card_id, field = match.groups()
            card = cards.setdefault(card_id, {"id": card_id, "kind": kind, "text": {}})
            card["text"][field] = values

        # Keywords, from the format table that sits behind the same ids. Its one data column is
        # headed `Format`, not a locale, so it needs the raw reader rather than parse_table.
        format_name = FORMAT_TABLES.get(kind)
        if format_name in tables:
            for key, columns in parse_raw_rows(tables[format_name]).items():
                match = key_shape.match(key)
                if not match or match.group(1) not in cards:
                    continue
                refs = KEYWORD_REF.findall(" ".join(columns))
                if refs:
                    found = cards[match.group(1)].setdefault("keywords", set())
                    found.update(r for r in refs if r in keyword_keys)

    # Descend quests are keyed by champion id in their own table.
    if "DescendQuestLocalize" in tables:
        _, rows = parse_table(tables["DescendQuestLocalize"])
        for key, values in rows.items():
            if (match := re.match(r"^(champ\d+)_quest$", key)) and match.group(1) in cards:
                cards[match.group(1)]["descendQuest"] = values

    for card in cards.values():
        card["keywords"] = sorted(card.get("keywords", ()))

    return cards, sorted(locales_used)


def declared_keywords(tables: dict[str, bytes]) -> set[str]:
    """Keys that KeywordLocalize actually defines, as `<key>_kt` (title) / `<key>_kd` (detail)."""
    if "KeywordLocalize" not in tables:
        return set()
    _, rows = parse_table(tables["KeywordLocalize"])
    return {key[:-3] for key in rows if key.endswith("_kt")}


def build_keywords(tables: dict[str, bytes]) -> list[dict]:
    if "KeywordLocalize" not in tables:
        return []
    _, rows = parse_table(tables["KeywordLocalize"])
    keys = sorted(key[:-3] for key in rows if key.endswith("_kt"))
    return [
        {"key": key, "title": rows[f"{key}_kt"], "description": rows.get(f"{key}_kd")}
        for key in keys
    ]


def build_realms(tables: dict[str, bytes], realms: dict[int, str]) -> list[dict]:
    if "RealmLocalize" not in tables:
        return []
    _, rows = parse_table(tables["RealmLocalize"])
    by_code = {name: number for number, name in realms.items()}
    # The plain keys are the realm names; `<code>_icon` rows are the same name with art markup.
    return [
        {"code": code, "number": by_code[code], "name": values}
        for code, values in rows.items()
        if code in by_code
    ]


# --- art ------------------------------------------------------------------------------------


def extract_art(pack: zipfile.ZipFile, out_dir: Path, write_images: bool) -> list[dict]:
    images: list[dict] = []

    for name in sorted(pack.namelist()):
        base = name.split("/")[-1]
        match = ART_BUNDLE.search(base)
        if not match:
            continue
        group = match.group(1)
        env = UnityPy.load(pack.read(name))

        for obj in env.objects:
            if obj.type.name != "Sprite":
                continue
            data = obj.read()
            record = {
                "sprite": data.m_Name,
                "group": group,
                "bundle": base,
                "pathId": obj.path_id,
                "container": obj.container,
                "cardId": bind(data.m_Name),
            }

            if write_images:
                destination = out_dir / "images" / group / f"{data.m_Name}.png"
                destination.parent.mkdir(parents=True, exist_ok=True)
                buffer = io.BytesIO()
                data.image.save(buffer, format="PNG")
                payload = buffer.getvalue()
                destination.write_bytes(payload)
                record["file"] = str(destination.relative_to(out_dir)).replace("\\", "/")
                record["bytes"] = len(payload)
                record["sha256"] = sha256(payload)
                record["width"], record["height"] = data.image.size

            images.append(record)

    images.sort(key=lambda row: (row["group"], row["sprite"]))
    return images


def extract_icons(pack: zipfile.ZipFile, out_dir: Path, write_images: bool) -> list[dict]:
    icons: list[dict] = []

    for name in sorted(pack.namelist()):
        base = name.split("/")[-1]
        kind = next((k for k, pattern in ICON_BUNDLES.items() if pattern.match(base)), None)
        if not kind:
            continue
        env = UnityPy.load(pack.read(name))

        for obj in env.objects:
            if obj.type.name != "Sprite":
                continue
            data = obj.read()
            record = {"sprite": data.m_Name, "kind": kind, "bundle": base, "pathId": obj.path_id}
            if kind == "tier" and (match := TIER_SPRITE.match(data.m_Name)):
                record["tier"] = int(match.group(1))
                record["variant"] = int(match.group(2)) if match.group(2) else None
            if write_images:
                destination = out_dir / "icons" / kind / f"{data.m_Name}.png"
                destination.parent.mkdir(parents=True, exist_ok=True)
                buffer = io.BytesIO()
                data.image.save(buffer, format="PNG")
                payload = buffer.getvalue()
                destination.write_bytes(payload)
                record["file"] = str(destination.relative_to(out_dir)).replace("\\", "/")
                record["sha256"] = sha256(payload)
                record["width"], record["height"] = data.image.size
            icons.append(record)

    icons.sort(key=lambda row: (row["kind"], row["sprite"]))
    return icons


def extract_god_art(pack: zipfile.ZipFile, kind: str, out_dir: Path, write_images: bool) -> list[dict]:
    """Art that belongs to a god rather than being its card — see GOD_ART for which kinds exist.

    A pass of its own rather than a group inside `extract_art`, because it binds to the same
    `champ` id the god's card art does: run through the card-art pass it would come out as extra
    sprites on every god, and which of them was the card would be down to ordering. These are
    fields of a god, so they are extracted as fields.
    """
    bundle_pattern, sprite_pattern = GOD_ART[kind]
    found: list[dict] = []

    for name in sorted(pack.namelist()):
        base = name.split("/")[-1]
        if not bundle_pattern.match(base):
            continue
        env = UnityPy.load(pack.read(name))

        for obj in env.objects:
            if obj.type.name != "Sprite":
                continue
            data = obj.read()
            match = sprite_pattern.match(data.m_Name)
            if not match:
                continue
            record = {
                "sprite": data.m_Name,
                "kind": kind,
                "bundle": base,
                "pathId": obj.path_id,
                "container": obj.container,
                "cardId": f"champ{int(match.group(1)):03d}",
            }

            if write_images:
                destination = out_dir / "images" / kind / f"{data.m_Name}.png"
                destination.parent.mkdir(parents=True, exist_ok=True)
                buffer = io.BytesIO()
                data.image.save(buffer, format="PNG")
                payload = buffer.getvalue()
                destination.write_bytes(payload)
                record["file"] = str(destination.relative_to(out_dir)).replace("\\", "/")
                record["bytes"] = len(payload)
                record["sha256"] = sha256(payload)
                record["width"], record["height"] = data.image.size

            found.append(record)

    found.sort(key=lambda row: row["sprite"])
    return found


def bind(sprite_name: str) -> str | None:
    for pattern, to_id in SPRITE_PATTERNS:
        if match := pattern.match(sprite_name):
            return to_id(match.group(1))
    return None


def realm_numbers(images: list[dict]) -> dict[int, str]:
    """Which number the game gives each realm, read off the unit sprites themselves.

    `babylon_card_character_5001` is the build stating that Babylon is realm 5. Nothing here is
    a fixed table, so a realm added in a later patch is picked up without an edit.
    """
    found: dict[int, str] = {}
    for image in images:
        match = UNIT_SPRITE.match(image["sprite"])
        if not match or match.group(1) == "gods":
            continue
        realm, number = match.group(1), int(match.group(2))
        found.setdefault(number // 1000, realm)
    return found


def realm_of(card_id: str, realms: dict[int, str]) -> str | None:
    """Units and a realm's own spells both carry the realm number in their id; gods do not."""
    match = re.match(r"^(?:m|s_)(\d+)$", card_id)
    return realms.get(int(match.group(1)) // 1000) if match else None


# --- main -------------------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("build", type=Path, help="the .xapk / .apks / .apk to extract from")
    parser.add_argument("--out", type=Path, default=Path("data/client"), help="output root")
    parser.add_argument("--no-images", action="store_true", help="tables and card text only")
    args = parser.parse_args()

    if not args.build.exists():
        print(f"not found: {args.build}", file=sys.stderr)
        return 2

    pack, version_info = open_data_pack(args.build)
    version = version_info.get("versionName") or "unknown"
    out_dir = args.out / version
    print(f"{args.build.name} -> {out_dir}  (v{version}, {version_info.get('package')})")

    tables = read_tables(pack)
    table_dir = out_dir / "tables"
    table_dir.mkdir(parents=True, exist_ok=True)
    for name, raw in sorted(tables.items()):
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
        (table_dir / f"{safe}.csv").write_bytes(raw)
    print(f"  {len(tables)} tables -> {table_dir}")

    cards, locales = build_cards(tables)
    print(f"  {len(cards)} cards, locales: {', '.join(locales)}")

    images = extract_art(pack, out_dir, not args.no_images)
    icons = extract_icons(pack, out_dir, not args.no_images)
    god_art = {
        kind: extract_god_art(pack, kind, out_dir, not args.no_images) for kind in GOD_ART
    }
    write_json(out_dir / "icons.json", icons)
    write_json(out_dir / "god-art.json", god_art)
    counted = ", ".join(f"{len(rows)} {kind}" for kind, rows in god_art.items())
    print(
        f"  {len(images)} sprites, {len(icons)} icons, {counted}"
        f"{'' if args.no_images else ' exported'}"
    )

    # Attach art to cards, and keep both directions of the leftovers.
    by_card: dict[str, list[dict]] = collections.defaultdict(list)
    for image in images:
        if image["cardId"]:
            by_card[image["cardId"]].append(image)

    realms = realm_numbers(images)
    print(f"  realms: {', '.join(f'{n}={name}' for n, name in sorted(realms.items()))}")

    god_art_by_card = {
        kind: {row["cardId"]: row for row in rows} for kind, rows in god_art.items()
    }

    for card_id, card in cards.items():
        art = by_card.get(card_id, [])
        card["sprites"] = [image["sprite"] for image in art]
        card["realm"] = realm_of(card_id, realms)
        # Only a god has a Power or a banner, so only a god is asked for them; a god missing one
        # shows up in unresolved.json rather than as a silently absent field.
        if card["kind"] == "god":
            for kind, by_god in god_art_by_card.items():
                if found := by_god.get(card_id):
                    card[kind] = found
        # Which atlas a spell's art came out of is the game's own split between the shared
        # Sanctum spells and a realm's Medicine.
        if card["kind"] == "spell" and art:
            card["subtype"] = "medicine" if art[0]["group"] == "medicine" else "sanctum"

    keywords = build_keywords(tables)
    write_json(out_dir / "keywords.json", keywords)
    realm_rows = build_realms(tables, realms)
    write_json(out_dir / "realms.json", realm_rows)
    print(f"  {len(keywords)} keywords, {len(realm_rows)} realms")

    art_without_card = [i for i in images if not i["cardId"] or i["cardId"] not in cards]
    cards_without_art = [cid for cid, card in cards.items() if not card["sprites"]]
    god_art_without_god = [
        row for rows in god_art.values() for row in rows if row["cardId"] not in cards
    ]
    gods_missing_art = {
        kind: [
            cid for cid, card in cards.items() if card["kind"] == "god" and kind not in card
        ]
        for kind in GOD_ART
    }

    write_json(out_dir / "meta.json", {
        "source": args.build.name,
        "sourceSha256": sha256(args.build.read_bytes()) if args.build.is_file() else None,
        **version_info,
        "locales": locales,
        "cardCount": len(cards),
        "spriteCount": len(images),
        "unboundSprites": len(art_without_card),
        "cardsWithoutArt": len(cards_without_art),
        "godArtCounts": {kind: len(rows) for kind, rows in god_art.items()},
        "godsMissingArt": {kind: len(ids) for kind, ids in gods_missing_art.items()},
    })
    write_json(out_dir / "cards.json", sorted(cards.values(), key=lambda c: (c["kind"], c["id"])))
    write_json(out_dir / "images.json", images)
    write_json(out_dir / "unresolved.json", {
        "note": "Sprites the build ships that no localization table lists, and card ids with no "
                "art. Both should normally be empty. A sprite listed here is usually content "
                "that was cut while its art stayed in the atlas — check it against the studio's "
                "patch notes before treating it as a card.",
        "spritesWithoutCard": [
            {"sprite": i["sprite"], "group": i["group"], "wouldBe": i["cardId"]} for i in art_without_card
        ],
        "cardsWithoutSprite": cards_without_art,
        # God art for a god the tables do not list is the same story as unbound card art: a god
        # the game has not released yet, or one it has withdrawn. In 1.5.7 this is four banners
        # and nothing else, which is why a banner is never taken as proof a god exists.
        "godArtWithoutGod": [
            {"sprite": row["sprite"], "kind": row["kind"], "wouldBe": row["cardId"]}
            for row in god_art_without_god
        ],
        "godsMissingArt": {kind: ids for kind, ids in gods_missing_art.items() if ids},
    })

    missing = sum(len(ids) for ids in gods_missing_art.values())
    print(
        f"  unbound: {len(art_without_card)} sprites, {len(cards_without_art)} cards, "
        f"{len(god_art_without_god)} god art, {missing} god fields -> unresolved.json"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
