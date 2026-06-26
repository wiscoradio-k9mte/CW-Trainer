#!/usr/bin/env python3
"""
Extract release notes for a given version from the AppStream metainfo XML.

Usage:
    VERSION=2.0.0 python3 extract_release_notes.py

Reads the VERSION environment variable and the metainfo XML at a path relative
to the repository root. Prints plain-text release notes to stdout.

Falls back to a minimal "CW Trainer vX.Y.Z" line if the version entry is
absent or the file cannot be parsed.
"""

import os
import sys
import xml.etree.ElementTree as ET

version = os.environ.get("VERSION", "").strip()
metainfo_path = os.path.join(
    os.environ.get("GITHUB_WORKSPACE", "."),
    "build",
    "io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml",
)

try:
    tree = ET.parse(metainfo_path)
    root = tree.getroot()
    for rel in root.findall(".//release"):
        if rel.get("version") == version:
            desc = rel.find("description")
            if desc is not None:
                lines = []
                for child in desc:
                    if child.tag == "p":
                        lines.append((child.text or "").strip())
                    elif child.tag == "ul":
                        for li in child.findall("li"):
                            lines.append("- " + (li.text or "").strip())
                output = "\n".join(line for line in lines if line)
                print(output)
                sys.exit(0)
    # Version entry not found — fall through to minimal message.
    print(f"CW Trainer v{version}")
except Exception as exc:
    sys.stderr.write(f"Warning: could not parse metainfo: {exc}\n")
    print(f"CW Trainer v{version}")
