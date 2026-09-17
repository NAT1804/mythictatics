"""Import the community comp sheet into data/canonical/comps.json.

The sheet is a Google Sheets workbook: a `Start` tab lists every comp under Basic or Advanced, and
each comp has a tab of its own laid out by the `Constructor` template. This reads that layout cell
by cell, resolves every unit and god name against data/canonical/cards.json, and fails loudly on a
name the dataset does not know — a typo in the sheet should stop the import, not turn into a hole.

Standard library only. Usage:

    python3 tools/comps/import_sheet.py                 # download the sheet and import it
    python3 tools/comps/import_sheet.py path/to/book.xlsx
"""

from __future__ import annotations

import io
import json
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

SHEET_ID = "1N5rRWMOt8_MsDWu2YeL8Qt8Mw1bTZ3qaKMhXAeZQ094"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid=518855883"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

ROOT = Path(__file__).resolve().parents[2]
CANONICAL = ROOT / "data" / "canonical"
OUTPUT = CANONICAL / "comps.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

# The Constructor template. Boards are 3 columns x 2 rows with a spacer row between them; the top
# row of the sheet is the front row, which is also slot 0-2 in the site's board.
PATRON_GOD = "B4"
REALMS = ["G4", "H4", "I4"]  # E4 is always Neutral, which every draft has anyway.
WHEN_TO_COMMIT = "K3"
HOW_TO_PLAY = "K13"
IDEAL_BOARD = ["B8", "C8", "D8", "B10", "C10", "D10"]
ALTERNATIVE_BOARD = ["B14", "C14", "D14", "B16", "C16", "D16"]
CORE_UNITS = ["G8", "H8", "I8", "G10", "H10", "I10"]
ENABLERS = ["K8", "L8", "M8", "K10", "L10", "M10"]
ADD_ONS = ["G14", "H14", "I14", "G16", "H16", "I16"]

# "Any" is the sheet's own word for a flexible pick.
ANY = "any"

# Names the sheet's unit list carries that are not a unit card in the dataset. They are imported as
# a flexible slot — the comp's own text still names them — rather than stopping the import.
NOT_A_UNIT_CARD = {
    "xiaotian quan": "granted by Erlang Shen's Power; the game has no unit card for it",
}


def load_workbook(source: str | None) -> zipfile.ZipFile:
    if source:
        return zipfile.ZipFile(source)
    with urllib.request.urlopen(EXPORT_URL) as response:  # noqa: S310 - fixed https URL
        return zipfile.ZipFile(io.BytesIO(response.read()))


def read_sheets(book: zipfile.ZipFile) -> dict[str, dict[str, str]]:
    strings = []
    if "xl/sharedStrings.xml" in book.namelist():
        for item in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS):
            strings.append("".join(node.text or "" for node in item.iter(f"{{{NS['m']}}}t")))

    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    rels = {
        rel.get("Id"): rel.get("Target")
        for rel in ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    }

    sheets: dict[str, dict[str, str]] = {}
    for sheet in workbook.find("m:sheets", NS):
        target = rels[sheet.get(f"{{{NS['r']}}}id")].lstrip("/")
        path = target if target.startswith("xl/") else f"xl/{target}"
        cells: dict[str, str] = {}
        for cell in ET.fromstring(book.read(path)).iter(f"{{{NS['m']}}}c"):
            value = cell.find("m:v", NS)
            if cell.get("t") == "inlineStr":
                text = "".join(node.text or "" for node in cell.iter(f"{{{NS['m']}}}t"))
            elif value is None or value.text is None:
                continue
            elif cell.get("t") == "s":
                text = strings[int(value.text)]
            else:
                text = value.text
            if text.strip():
                cells[cell.get("r")] = text
        sheets[sheet.get("name")] = cells
    return sheets


def comp_order(start: dict[str, str]) -> list[tuple[str, str]]:
    """(tab name, difficulty) in the order the Start tab lists them."""

    def column(letter: str) -> list[str]:
        rows = sorted(
            (int(ref[len(letter):]), name)
            for ref, name in start.items()
            if re.fullmatch(rf"{letter}\d+", ref)
        )
        # Row 2 is the column header ("Basic", "Advanced").
        return [name.strip() for row, name in rows if row > 2]

    return [(name, "basic") for name in column("D")] + [(name, "advanced") for name in column("J")]


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def clean_text(text: str | None) -> str | None:
    if text is None:
        return None
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    joined = "\n".join(lines).strip()
    # Paragraphs are separated by one blank line; the sheet sometimes has more.
    return re.sub(r"\n{3,}", "\n\n", joined) or None


class Resolver:
    def __init__(self, cards: list[dict]):
        self.units = {c["name"]["en"].casefold(): c["id"] for c in cards if c["kind"] == "unit"}
        self.gods = {c["name"]["en"].casefold(): c["id"] for c in cards if c["kind"] == "god"}
        self.errors: list[str] = []

    def unit(self, tab: str, ref: str, name: str) -> str | None:
        key = name.strip().casefold()
        if key in NOT_A_UNIT_CARD:
            print(f"{tab}!{ref}: {name} left as a flexible slot ({NOT_A_UNIT_CARD[key]})")
            return None
        unit_id = self.units.get(key)
        if not unit_id:
            self.errors.append(f"{tab}!{ref}: no unit named {name!r}")
        return unit_id

    def god(self, tab: str, name: str) -> str | None:
        god_id = self.gods.get(name.strip().casefold())
        if not god_id:
            self.errors.append(f"{tab}!{PATRON_GOD}: no god named {name!r}")
        return god_id


def is_any(value: str | None) -> bool:
    return value is None or value.strip().casefold() == ANY


def build_comp(
    tab: str, difficulty: str, cells: dict[str, str], resolve: Resolver, game_version: str
) -> dict:
    def board(refs: list[str]) -> list[dict | None]:
        slots = []
        for ref in refs:
            name = cells.get(ref)
            unit_id = None if is_any(name) else resolve.unit(tab, ref, name)
            # The sheet does not say what Rank a unit should be at, so every slot is Rank 1.
            slots.append({"unitId": unit_id, "rank": 0} if unit_id else None)
        return slots

    def units(refs: list[str]) -> list[str]:
        ids: list[str] = []
        for ref in refs:
            name = cells.get(ref)
            if is_any(name):
                continue
            unit_id = resolve.unit(tab, ref, name)
            if unit_id and unit_id not in ids:
                ids.append(unit_id)
        return ids

    god = cells.get(PATRON_GOD)
    patrons = [] if is_any(god) else [resolve.god(tab, god)]
    realms: list[str] = []
    for ref in REALMS:
        realm = cells.get(ref)
        if realm and not is_any(realm) and realm.strip().lower() != "neutral":
            code = realm.strip().lower()
            if code not in realms:
                realms.append(code)

    alternative = board(ALTERNATIVE_BOARD)
    slug = slugify(tab)
    return {
        "id": slug,
        "slug": slug,
        "name": tab,
        "difficulty": difficulty,
        "patronGodIds": [god_id for god_id in patrons if god_id],
        "realms": realms,
        "whenToCommit": clean_text(cells.get(WHEN_TO_COMMIT)),
        "idealBoard": board(IDEAL_BOARD),
        "alternativeBoards": [alternative] if any(alternative) else [],
        "coreUnitIds": units(CORE_UNITS),
        "enablerUnitIds": units(ENABLERS),
        "addOnUnitIds": units(ADD_ONS),
        "howToPlay": clean_text(cells.get(HOW_TO_PLAY)) or "",
        "tags": [],
        "gameVersion": game_version,
        "source": {"type": "sheet", "url": SHEET_URL},
    }


def main() -> int:
    source = sys.argv[1] if len(sys.argv) > 1 else None
    sheets = read_sheets(load_workbook(source))
    cards = json.loads((CANONICAL / "cards.json").read_text(encoding="utf-8"))
    game_version = json.loads((CANONICAL / "meta.json").read_text(encoding="utf-8"))["gameVersion"]
    resolve = Resolver(cards)

    previous = {}
    if OUTPUT.exists():
        previous = {c["id"]: c for c in json.loads(OUTPUT.read_text(encoding="utf-8"))}
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    comps = []
    for tab, difficulty in comp_order(sheets["Start"]):
        if tab not in sheets:
            resolve.errors.append(f"Start lists {tab!r} but the workbook has no such tab")
            continue
        comp = build_comp(tab, difficulty, sheets[tab], resolve, game_version)
        # updatedAt only moves when the comp itself changed, so re-running is a no-op.
        old = previous.get(comp["id"])
        unchanged = old and {k: v for k, v in old.items() if k != "updatedAt"} == comp
        comp["updatedAt"] = old["updatedAt"] if unchanged else now
        comps.append(comp)

    if resolve.errors:
        print("\n".join(resolve.errors), file=sys.stderr)
        return 1

    OUTPUT.write_text(json.dumps(comps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(comps)} comps to {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
