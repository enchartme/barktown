#!/usr/bin/env python3
import sys
from pathlib import Path

ZERO_WIDTH_CHARS = "\u200b\u200c\u200d\ufeff"

def strip_invisible(s):
    for ch in ZERO_WIDTH_CHARS:
        s = s.replace(ch, "")
    return s

def parse_mapping_line(line):
    if "---->" not in line:
        return None

    left, right = line.split("---->", 1)
    left = strip_invisible(left).strip()
    right = strip_invisible(right).strip()

    if not left or not right:
        return None

    old_name = Path(left).name
    new_name = Path(right).name
    return old_name, new_name

def main():
    if len(sys.argv) < 3:
        print(
            "Usage: {} MAPPING.txt /path/to/folder".format(Path(sys.argv[0]).name),
            file=sys.stderr
        )
        sys.exit(1)

    mapping_file = Path(sys.argv[1])
    folder = Path(sys.argv[2])

    if not mapping_file.is_file():
        print("Mapping file not found: {}".format(mapping_file), file=sys.stderr)
        sys.exit(1)

    if not folder.is_dir():
        print("Not a directory: {}".format(folder), file=sys.stderr)
        sys.exit(1)

    mapping = {}
    invalid_lines = []
    duplicate_sources = []
    duplicate_targets = []

    target_names_seen = {}

    with mapping_file.open("r", encoding="utf-8") as f:
        for i, raw_line in enumerate(f, start=1):
            line = raw_line.rstrip("\n")
            if not line.strip():
                continue

            parsed = parse_mapping_line(line)
            if parsed is None:
                invalid_lines.append((i, line))
                continue

            old_name, new_name = parsed

            if old_name in mapping:
                duplicate_sources.append((i, old_name))
                continue

            if new_name in target_names_seen:
                duplicate_targets.append((i, new_name))
                continue

            mapping[old_name] = new_name
            target_names_seen[new_name] = i

    planned = []
    not_in_mapping = []
    missing_sources = []
    collisions = []

    existing_files = sorted([p for p in folder.iterdir() if p.is_file()])

    existing_names = {strip_invisible(p.name): p for p in existing_files}

    for old_name, new_name in sorted(mapping.items()):
        if old_name not in existing_names:
            missing_sources.append(old_name)
            continue

        old_path = existing_names[old_name]
        new_path = old_path.with_name(new_name)

        if new_name != old_path.name and new_path.exists():
            collisions.append((old_path.name, new_name))
            continue

        planned.append((old_path, new_path))

    mapped_source_names = set(mapping.keys())
    for p in existing_files:
        clean_name = strip_invisible(p.name)
        if clean_name not in mapped_source_names:
            not_in_mapping.append(p.name)

    print("Mappings loaded:      {}".format(len(mapping)))
    print("Planned renames:      {}".format(len(planned)))
    print("Missing source files: {}".format(len(missing_sources)))
    print("Folder files unmapped: {}".format(len(not_in_mapping)))
    print("Invalid mapping lines: {}".format(len(invalid_lines)))
    print("Duplicate sources:    {}".format(len(duplicate_sources)))
    print("Duplicate targets:    {}".format(len(duplicate_targets)))
    print("Target collisions:    {}".format(len(collisions)))
    print()

    if planned:
        print("Rename example:")
        print("  {} -> {}".format(planned[0][0].name, planned[0][1].name))
        print()

    if missing_sources:
        print("Missing source example:")
        print("  {}".format(missing_sources[0]))
        print()

    if not_in_mapping:
        print("Unmapped file example:")
        print("  {}".format(not_in_mapping[0]))
        print()

    if invalid_lines:
        print("Invalid mapping line example:")
        print("  line {}: {}".format(invalid_lines[0][0], invalid_lines[0][1]))
        print()

    if collisions:
        print("Collision example:")
        print("  {} -> {}".format(collisions[0][0], collisions[0][1]))
        print()

    if not planned:
        print("Nothing to rename.")
        return

    answer = input("Proceed with rename? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled.")
        return

    for old_path, new_path in planned:
        if new_path.exists() and new_path != old_path:
            print("Skip, target exists: {}".format(new_path.name))
            continue
        old_path.rename(new_path)

    print("Done.")
    print("Renamed: {}".format(len(planned)))

if __name__ == "__main__":
    main()