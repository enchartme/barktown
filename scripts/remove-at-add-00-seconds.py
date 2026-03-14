#!/usr/bin/env python3
import sys
from pathlib import Path
import re

# Matches:
# YYYY-MM-DD at HH-MM anything.ext
PATTERN = re.compile(r'^(\d{4}-\d{2}-\d{2}) at (\d{2})-(\d{2})( .+)$')

def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    if not folder.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        sys.exit(1)

    affected = []
    not_affected = []

    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue

        m = PATTERN.match(path.name)
        if not m:
            not_affected.append(path.name)
            continue

        date_part, hh, mm, rest = m.groups()
        new_name = f"{date_part} {hh}-{mm}-00{rest}"

        if new_name != path.name:
            affected.append((path, path.with_name(new_name)))

    print(f"Affected files: {len(affected)}")
    print()

    if affected:
        print("Planned renames:")
        for old_path, new_path in affected:
            print(f"  {old_path.name}")
            print(f"  -> {new_path.name}")
        print()

    print("Not affected:")
    if not_affected:
        for name in not_affected:
            print(f"  {name}")
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
            print(f"Skip, target exists: {new_path.name}")
            continue
        old_path.rename(new_path)

    print("Done.")

if __name__ == "__main__":
    main()

