#!/usr/bin/env python3
import re
import sys
from pathlib import Path

MONTHS = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}

ZERO_WIDTH = "\u200b"

# Examples matched:
# 13 Aug, 9.06 bark bark.aac
# 2 Jun, 16.39 barks .aac
# 2 Jun, 6.3.aac   <- no, this one is not matched because comments/extensions should still be sane
PATTERN = re.compile(
    r"""^
    (\d{1,2})              # day
    \s+
    (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)
    ,\s+
    (\d{1,2})\.(\d{1,2})   # hour.minute
    (.*)                   # rest: optional weird char/comment/ext
    $
    """,
    re.VERBOSE
)

def clean_rest(rest):
    rest = rest.replace(ZERO_WIDTH, "")
    rest = re.sub(r"\s+", " ", rest)
    rest = rest.strip()

    # Split into comment + extension, where extension is the final dot-suffix.
    m = re.match(r"^(.*?)(\.[^. ]+)$", rest)
    if not m:
        return None, None

    comment = m.group(1).strip()
    ext = m.group(2)
    return comment, ext

def normalise_name(filename, year):
    m = PATTERN.match(filename)
    if not m:
        return None

    day, mon_txt, hour, minute, rest = m.groups()
    comment, ext = clean_rest(rest)
    if ext is None:
        return None

    month = MONTHS[mon_txt]
    day = day.zfill(2)
    hour = hour.zfill(2)
    minute = minute.zfill(2)

    if comment:
        return "{}-{}-{} {}-{}-00 {}{}".format(year, month, day, hour, minute, comment, ext)
    else:
        return "{}-{}-{} {}-{}-00{}".format(year, month, day, hour, minute, ext)

def sample_or_none(items):
    return items[0] if items else None

def main():
    if len(sys.argv) < 2:
        print("Usage: {} YEAR [FOLDER]".format(Path(sys.argv[0]).name), file=sys.stderr)
        sys.exit(1)

    year = sys.argv[1]
    if not re.match(r"^\d{4}$", year):
        print("Refusing to run: YEAR parameter is required and must be 4 digits.", file=sys.stderr)
        print("Example: {} 2025 /path/to/folder".format(Path(sys.argv[0]).name), file=sys.stderr)
        sys.exit(1)

    folder = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
    if not folder.is_dir():
        print("Not a directory: {}".format(folder), file=sys.stderr)
        sys.exit(1)

    total_files = 0
    matched = 0
    unchanged = []
    invalid = []
    planned = []
    collisions = []

    seen_targets = set()

    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue

        total_files += 1
        old_name = path.name
        new_name = normalise_name(old_name, year)

        if new_name is None:
            invalid.append(old_name)
            continue

        matched += 1

        if new_name == old_name:
            unchanged.append(old_name)
            continue

        new_path = path.with_name(new_name)

        if new_name in seen_targets or (new_path.exists() and new_path != path):
            collisions.append((old_name, new_name))
            continue

        seen_targets.add(new_name)
        planned.append((path, new_path))

    print("Scanned:    {}".format(total_files))
    print("Matched:    {}".format(matched))
    print("To rename:  {}".format(len(planned)))
    print("Unchanged:  {}".format(len(unchanged)))
    print("Invalid:    {}".format(len(invalid)))
    print("Collisions: {}".format(len(collisions)))
    print()

    example = sample_or_none(planned)
    if example:
        print("Rename example:")
        print("  {} -> {}".format(example[0].name, example[1].name))
        print()

    example = sample_or_none(unchanged)
    if example:
        print("Unchanged example:")
        print("  {}".format(example))
        print()

    example = sample_or_none(invalid)
    if example:
        print("Invalid example:")
        print("  {}".format(example))
        print()

    example = sample_or_none(collisions)
    if example:
        print("Collision example:")
        print("  {} -> {}".format(example[0], example[1]))
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
