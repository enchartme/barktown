#!/usr/bin/env python3
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

MAX_SIZE_WIDTH = len("999 999 999 999 B")
FILE_COUNT_WIDTH = len("100 000")

def format_bytes(n):
    s = str(int(n))
    parts = []
    while s:
        parts.append(s[-3:])
        s = s[:-3]
    return " ".join(reversed(parts)) + " B"

def pad_size(n):
    return format_bytes(n).rjust(MAX_SIZE_WIDTH)

def pad_count(n):
    s = str(int(n))
    parts = []
    while s:
        parts.append(s[-3:])
        s = s[:-3]
    return " ".join(reversed(parts)).rjust(FILE_COUNT_WIDTH)

def iso_utc(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M+00")

def get_cdate(stat_result):
    if hasattr(stat_result, "st_birthtime"):
        return stat_result.st_birthtime
    return stat_result.st_ctime

def main():
    if len(sys.argv) < 2:
        print("Usage: {} /path/to/folder".format(Path(sys.argv[0]).name), file=sys.stderr)
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print("Not a directory: {}".format(root), file=sys.stderr)
        sys.exit(1)

    script_dir = Path(__file__).resolve().parent
    output_path = script_dir / "folder-info.txt"

    dir_stats = {}   # rel_path -> {level, size, count}
    file_records = []

    for current_dir, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()

        current_path = Path(current_dir)
        rel_dir = current_path.relative_to(root)
        rel_dir_str = "/" if str(rel_dir) == "." else "/" + rel_dir.as_posix()
        level = 0 if rel_dir_str == "/" else len(rel_dir.parts)

        total_size = 0
        total_count = 0

        for filename in filenames:
            file_path = current_path / filename
            try:
                st = file_path.stat()
            except OSError:
                continue

            size = st.st_size
            cdate = iso_utc(get_cdate(st))
            mdate = iso_utc(st.st_mtime)

            rel_file = file_path.relative_to(root)
            rel_file_str = "/" + rel_file.as_posix()

            file_records.append({
                "path": rel_file_str,
                "line": "{} -- cdate {} -- mdate {} -- {}".format(
                    pad_size(size), cdate, mdate, rel_file_str
                )
            })

            total_size += size
            total_count += 1

        dir_stats[rel_dir_str] = {
            "level": level,
            "size": total_size,
            "count": total_count,
        }

    # Roll up child folder totals into parents
    all_dirs = sorted(dir_stats.keys(), key=lambda p: p.count("/"), reverse=True)
    for dir_path in all_dirs:
        if dir_path == "/":
            continue
        parent = str(Path(dir_path).parent).replace("\\", "/")
        if parent == ".":
            parent = "/"
        if not parent.startswith("/"):
            parent = "/" + parent
        dir_stats[parent]["size"] += dir_stats[dir_path]["size"]
        dir_stats[parent]["count"] += dir_stats[dir_path]["count"]

    levels = {}
    for dir_path, info in dir_stats.items():
        levels.setdefault(info["level"], []).append((dir_path, info))

    with output_path.open("w", encoding="utf-8") as f:
        f.write("folders\n")
        for level in sorted(levels.keys()):
            f.write("level {}\n".format(level))
            for dir_path, info in sorted(levels[level], key=lambda x: x[0]):
                if dir_path == "/":
                    f.write(
                        "  {} in {} files\n".format(
                            pad_size(info["size"]), pad_count(info["count"])
                        )
                    )
                else:
                    f.write(
                        "  {} in {} files -- {}\n".format(
                            pad_size(info["size"]), pad_count(info["count"]), dir_path
                        )
                    )
            f.write("\n")

        f.write("files\n")
        for record in sorted(file_records, key=lambda x: x["path"]):
            f.write(record["line"] + "\n")

    print(output_path)

if __name__ == "__main__":
    main()
