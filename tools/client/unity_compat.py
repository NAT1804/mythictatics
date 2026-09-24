"""Teaches UnityPy the serialized-file format Unity 6000.5 writes, until UnityPy learns it itself.

The 1.6.0 client is built with Unity 6000.5, which bumped the serialized-file format to 23. UnityPy
1.25.3 reads up to 22, and fails every bundle with `IndexError` in `TypeTreeNode.parse_blob`.

Format 23 changes one thing on the path this tooling uses: each type's tree is preceded by a second
16-byte hash, and the blob itself is wrapped in a small header —

    u32 size | b"mhtt" | u32 format version | <the format-22 blob: node count, string size, nodes, strings>

— where `size` counts everything after itself. The nodes inside are laid out exactly as in format
22, so the wrapper is read here and the rest is handed to UnityPy unchanged. `size` is checked
against where UnityPy stopped reading, so a format that changes more than this fails loudly rather
than producing a mis-read tree.

Importing this module applies the patch; it is a no-op for files older than format 23.
"""

from __future__ import annotations

import importlib

# The module, not the class of the same name that `UnityPy.helpers` re-exports.
_module = importlib.import_module("UnityPy.helpers.TypeTreeNode")

_WRAPPER_MAGIC = b"mhtt"
_parse_blob = _module.TypeTreeNode.parse_blob.__func__


def _parse_blob_v23(cls, reader, version: int):
    if version < 23:
        return _parse_blob(cls, reader, version)

    reader.read_bytes(16)  # the second type hash format 23 adds
    size = reader.read_u_int()
    start = reader.Position
    magic = reader.read_bytes(4)
    if magic != _WRAPPER_MAGIC:
        raise ValueError(f"format {version} type tree: expected {_WRAPPER_MAGIC!r}, found {magic!r}")
    reader.read_u_int()  # the format version again

    node = _parse_blob(cls, reader, version)
    if reader.Position != start + size:
        raise ValueError(
            f"format {version} type tree: header says {size} bytes, read {reader.Position - start}"
        )
    return node


_module.TypeTreeNode.parse_blob = classmethod(_parse_blob_v23)
