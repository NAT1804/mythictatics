# Extracting from the shipped client

`data/canonical/` is the project's dataset, and this is where its contents came from — and the
way to refresh them after a game patch. There is no other pipeline: no community data source,
no network step. The publisher's own website carries no card ids (its art is content-addressed
with no alt text) and no Hexpion-owned API or asset CDN resolves in DNS, so the full
card-id-to-image mapping exists only inside the game build.

That build is Hexpion's copyrighted binary. Keep it out of the repo (`tools/client/builds/` is
gitignored), extract identifiers and art from it the way a fan wiki does, and credit the game.

## Setup

```powershell
python -m venv tools\client\.venv
tools\client\.venv\Scripts\python.exe -m pip install -r tools\client\requirements.txt
```

`keytool` from a JDK also has to be on PATH; it reads the signing certificate.

## 1. Get a build

The mirrors (apkpure, apkcombo, apkfab) block automated requests, so download by hand in a
browser and drop the file in `tools/client/builds/`. Package name is `com.Hepxion.hex05` —
note the typo in `Hepxion`, it is the publisher's, not ours. A `.xapk` or `.apks` is fine; it
is a zip holding the base APK plus an OBB or config splits, and the tooling unwraps it.

Downloading from a mirror means the bytes are not trusted yet, which is what step 2 is for.

## 2. Survey it before extracting anything

```powershell
tools\client\.venv\Scripts\python.exe tools\client\inspect_build.py tools\client\builds\<file> --json tools\client\builds\survey.json
```

Check three things in the output before going further:

- **`package`** is `com.Hepxion.hex05` and **`versionName`** is the version you meant to get.
  Apple's lookup API for `id6746439230` says which build is live — `version` in its JSON is
  written by Hexpion and shipped with the build, so it settles whether a mirror is serving
  something stale.
- **`signer`** names Hexpion. There is no published fingerprint to compare against, so record
  the SHA-256 the first time and treat any later build that differs as a different publisher.
- **`permissions`** holds nothing a card-battler has no use for. A repackaged APK usually has to
  add some, and that is the cheapest tell available.

The rest of the report describes the Unity layout — `binData` vs `addressables` vs an OBB, and
whether the sampled objects carry a `container` path. That last number decides the extraction
strategy: a non-zero count means the bundles still hold the original project paths
(`Assets/Art/Champions/champ004_Anu.png`), which are the per-image identifiers we are after. A
zero means they were stripped at build time and the ids have to be recovered from the card
tables instead.

## 3. Extract

```powershell
tools\client\.venv\Scripts\python.exe tools\client\extract_cards.py tools\client\builds\<file> --out data\client
```

Writes `data/client/<versionName>/`:

|                                 |                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `images/<group>/<sprite>.png`   | every card sprite, cut from its atlas, named as the game names it            |
| `icons/<kind>/<sprite>.png`     | the icons card text embeds, plus the ladder badges                           |
| `images.json` / `icons.json`    | sprite -> bundle, PathID, container path, sha256, bound card id              |
| `cards.json`                    | card id, kind, realm, sprites, keywords, descend quests, text in six locales |
| `keywords.json` / `realms.json` | the game's own keyword and realm vocabulary, localized                       |
| `tables/*.csv`                  | the localization tables verbatim, as the client ships them                   |
| `meta.json`                     | package, versionName, versionCode, sha256 of the build it came from          |
| `unresolved.json`               | anything that did not bind — should normally be empty on both sides          |

On v1.5.7 that is 268 cards (184 units, 64 spells, 20 gods), 276 sprites, 52 icons, 47 keywords
and locales `en, vi-VN, zh, zh-TW, ko-KR, ja-JP`. Eight sprites do not bind: seven spells and one
Olympus unit whose art still ships but which no localization table lists any more.

## 4. Fold it into the dataset, by hand

`data/client/` is scratch output and is gitignored. The two things the repo keeps are
`data/canonical/` and `apps/web/public/images/`, and moving one into the other is a manual step
— there is no build script for it any more.

Art goes to `apps/web/public/images`, renamed from the sprite name to the card id, in the layout
`cards.json` already records in each card's `image`:

| card kind | destination                        |
| --------- | ---------------------------------- |
| unit      | `images/units/<realm>/<id>.png`    |
| god       | `images/gods/<id>.png`             |
| spell     | `images/spells/<id>.png`           |
| icons     | `images/icons/<kind>/<sprite>.png` |

Then update `data/canonical/` from the extraction: `cards.json` takes the names, rules text,
keywords, realms and descend quests, and each card's `sprite`, `imageWidth`, `imageHeight` and
`imageSha256`; `keywords.json` and `realms.json` are the client's own files.

**Four fields are not in the client and must be carried across by hand**: `tier`, `cost`, and
each rank's `attack` and `health`. They are generated C# constants inside `libil2cpp.so`, behind
an encrypted `global-metadata.dat`, so no extraction reaches them — read them off the game and
keep `meta.json`'s note honest about it.

Leave the `{0}`-style placeholders in the Shenzhou rules text alone. Those numbers are not fixed
values the extraction failed to resolve — cards in play change what a Medicine is worth, so the
game works them out at runtime. `meta.json`'s `conventions` records this and the other two
deliberate nulls (Medicine and gods have no cost).

Re-apply `meta.json`'s `excluded` list too. Those cards are in the client's tables but not in the
game, so every extraction produces them again; drop each one unless the game has since added it.

`npx nx test shared-domain` is the check. It validates every card against the schema and
re-hashes every served image against `imageSha256`, so a mismatch between the dataset and the
art fails there rather than in the browser.

### Checking a run

`unresolved.json` is the signal. `cardsWithoutSprite` should always be empty — an entry there
means a binding rule stopped matching, usually because a patch added a card family the numeric
rule does not cover, and it needs a look rather than a workaround. Growth in
`spritesWithoutCard` is normal and just means more content was retired.

The realm numbers printed by the run (`1=niles … 10=neutral`) are read off the unit sprites, not
configured, so they are worth a glance after a patch that adds a realm.
