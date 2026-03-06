#!/usr/bin/env python3
import os
import re
import sys
from pathlib import Path

pattern = re.compile(r'^(\d{2})-(\d{2})-(\d{4})( at \d{2}-\d{2} .+)$')

def main(folder="."):
    folder = Path(folder)

    if not folder.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        sys.exit(1)

    for path in folder.iterdir():
        if not path.is_file():
            continue

        m = pattern.match(path.name)
        if not m:
            continue

        dd, mm, yyyy, rest = m.groups()
        new_name = f"{yyyy}-{mm}-{dd}{rest}"
        new_path = path.with_name(new_name)

        if new_path.exists():
            print(f"Skip, target exists: {new_path.name}")
            continue

        print(f"{path.name}  ->  {new_name}")
        path.rename(new_path)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")