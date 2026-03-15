#!/usr/bin/env python3
import re
import sys
from pathlib import Path
from typing import Optional

# Matches:
# YYYY-MM-DD HH-MM-S barky name.ext
PATTERN = re.compile(
    r'^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2})-(\d{1,2})( .+)$'
)

def normalise_name(filename: str) -> Optional[str]:
    m = PATTERN.match(filename)
    if not m:
        return None

    date_part, hh, mm, sec, rest = m.groups()
    sec = sec.zfill(2)
    rest = re.sub(r' +', ' ', rest).strip()
    return f"{date_part} {hh}-{mm}-{sec} {rest}"

def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")

    if not folder.is_dir():
        print("Not a directory: {}".format(folder), file=sys.stderr)
        sys.exit(1)

    affected = []
    not_affected = []

    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue

        new_name = normalise_name(path.name)
        if new_name is None:
            not_affected.append(path.name)
            continue

        if new_name != path.name:
            affected.append((path, path.with_name(new_name)))

    print("Affected files: {}".format(len(affected)))
    print()

    if affected:
        print("Planned renames:")
        for old_path, new_path in affected:
            print("  {}".format(old_path.name))
            print("  -> {}".format(new_path.name))
        print()

    print("Not affected:")
    if not_affected:
        for name in not_affected:
            print("  {}".format(name))
    else:
        print("  (none)")
    print()

    if not affected:
        print("Nothing to rename.")
        return

    answer = input("Proceed with rename? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled.")
        return

    for old_path, new_path in affected:
        if new_path.exists():
            print("Skip, target exists: {}".format(new_path.name))
            continue
        old_path.rename(new_path)

    print("Done.")

if __name__ == "__main__":
    main()
