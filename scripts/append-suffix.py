#!/usr/bin/env python3
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("Usage: {} ' TEXT' [FOLDER]".format(Path(sys.argv[0]).name), file=sys.stderr)
        sys.exit(1)

    suffix_to_add = sys.argv[1]
    folder = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")

    if not folder.is_dir():
        print("Not a directory: {}".format(folder), file=sys.stderr)
        sys.exit(1)

    affected = []
    unchanged = []

    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue

        new_name = "{}{}{}".format(path.stem, suffix_to_add, path.suffix)

        if new_name == path.name:
            unchanged.append(path.name)
            continue

        affected.append((path, path.with_name(new_name)))

    print("Affected files: {}".format(len(affected)))
    print("Unchanged files: {}".format(len(unchanged)))
    print()

    if affected:
        print("Example rename:")
        print("  {} -> {}".format(affected[0][0].name, affected[0][1].name))
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
