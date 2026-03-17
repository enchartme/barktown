#!/usr/bin/env python3
import sys
from pathlib import Path

ZERO_WIDTH_CHARS = "\u200b\u200c\u200d\ufeff"

def strip_invisible(s):
    for ch in ZERO_WIDTH_CHARS:
        s = s.replace(ch, "")
    return s

def clean_rel_path(s):
    s = strip_invisible(s).strip().replace("\\", "/")
    while "//" in s:
        s = s.replace("//", "/")
    if s.startswith("/"):
        s = s[1:]
    return s

def parse_mapping_line(line, basename_only=False):
    if "---->" not in line:
        return None

    left, right = line.split("---->", 1)
    left = clean_rel_path(left)
    right = strip_invisible(right).strip()

    if not left or not right:
        return None

    old_key = Path(left).name if basename_only else left
    new_name = Path(right).name
    return old_key, new_name

def collect_files(folder, basename_only=False):
    files = {}
    duplicates = []

    for path in sorted(folder.rglob("*")):
        if not path.is_file():
            continue

        rel_path = clean_rel_path(path.relative_to(folder).as_posix())
        key = Path(rel_path).name if basename_only else rel_path

        if key in files:
            duplicates.append((key, files[key], path))
        else:
            files[key] = path

    return files, duplicates

def main():
    args = sys.argv[1:]
    basename_only = False

    if "--basename-only" in args:
        basename_only = True
        args.remove("--basename-only")

    if len(args) != 2:
        print(
            "Usage: {} [--basename-only] MAPPING.txt /path/to/folder".format(Path(sys.argv[0]).name),
            file=sys.stderr
        )
        sys.exit(1)

    mapping_file = Path(args[0])
    folder = Path(args[1])

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

            parsed = parse_mapping_line(line, basename_only=basename_only)
            if parsed is None:
                invalid_lines.append((i, line))
                continue

            old_key, new_name = parsed

            if old_key in mapping:
                duplicate_sources.append((i, old_key))
                continue

            if new_name in target_names_seen:
                duplicate_targets.append((i, new_name))
                continue

            mapping[old_key] = new_name
            target_names_seen[new_name] = i

    existing_files, source_key_collisions = collect_files(folder, basename_only=basename_only)

    planned = []
    missing_sources = []
    unmapped_files = []
    target_collisions = []

    for old_key, new_name in sorted(mapping.items()):
        if old_key not in existing_files:
            missing_sources.append(old_key)
            continue

        old_path = existing_files[old_key]
        new_path = old_path.with_name(new_name)

        if new_name != old_path.name and new_path.exists():
            target_collisions.append((old_path, new_path))
            continue

        planned.append((old_path, new_path))

    mapped_keys = set(mapping.keys())
    for key, path in sorted(existing_files.items(), key=lambda x: str(x[1])):
        if key not in mapped_keys:
            unmapped_files.append(path)

    print("Mode:                 {}".format("basename-only" if basename_only else "relative-path"))
    print("Mappings loaded:      {}".format(len(mapping)))
    print("Planned renames:      {}".format(len(planned)))
    print("Missing source files: {}".format(len(missing_sources)))
    print("Folder files unmapped: {}".format(len(unmapped_files)))
    print("Invalid mapping lines: {}".format(len(invalid_lines)))
    print("Duplicate sources:    {}".format(len(duplicate_sources)))
    print("Duplicate targets:    {}".format(len(duplicate_targets)))
    print("Source key collisions: {}".format(len(source_key_collisions)))
    print("Target collisions:    {}".format(len(target_collisions)))
    print()

    if planned:
        print("Rename example:")
        print("  {} -> {}".format(planned[0][0].relative_to(folder), planned[0][1].name))
        print()

    if missing_sources:
        print("Missing source example:")
        print("  {}".format(missing_sources[0]))
        print()

    if unmapped_files:
        print("Unmapped file example:")
        print("  {}".format(unmapped_files[0].relative_to(folder)))
        print()

    if invalid_lines:
        print("Invalid mapping line example:")
        print("  line {}: {}".format(invalid_lines[0][0], invalid_lines[0][1]))
        print()

    if source_key_collisions:
        key, path1, path2 = source_key_collisions[0]
        print("Source key collision example:")
        print("  key: {}".format(key))
        print("  {} ".format(path1.relative_to(folder)))
        print("  {} ".format(path2.relative_to(folder)))
        print()

    if target_collisions:
        print("Target collision example:")
        print("  {} -> {}".format(
            target_collisions[0][0].relative_to(folder),
            target_collisions[0][1].name
        ))
        print()

    if not planned:
        print("Nothing to rename.")
        return

    answer = input("Proceed with rename? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled.")
        return

    renamed = 0
    for old_path, new_path in planned:
        if new_path.exists() and new_path != old_path:
            print("Skip, target exists: {}".format(new_path))
            continue
        old_path.rename(new_path)
        renamed += 1

    print("Done.")
    print("Renamed: {}".format(renamed))

if __name__ == "__main__":
    main()