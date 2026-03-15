#!/usr/bin/env python3
import sys
from pathlib import Path

def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")

    if not folder.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        sys.exit(1)

    affected = []
    skipped = []

    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue

        stem = path.stem
        suffix = path.suffix

        new_stem = stem.rstrip()
        new_name = new_stem + suffix

        if new_name == path.name:
            skipped.append(path.name)
            continue

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
    if skipped:
        for name in skipped:
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
