#!/usr/bin/env python3
import sys
from pathlib import Path

def load_names(path):
    names = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if name:
                names.append(name)
    return names

def main():
    if len(sys.argv) != 3:
        print("Usage: {} LIST1.txt LIST2.txt".format(Path(sys.argv[0]).name), file=sys.stderr)
        sys.exit(1)

    file1 = Path(sys.argv[1])
    file2 = Path(sys.argv[2])

    if not file1.is_file():
        print("Not a file: {}".format(file1), file=sys.stderr)
        sys.exit(1)

    if not file2.is_file():
        print("Not a file: {}".format(file2), file=sys.stderr)
        sys.exit(1)

    names1 = set(load_names(file1))
    names2 = set(load_names(file2))

    matching = sorted(names1 & names2)
    only1 = names1 - names2
    only2 = names2 - names1

    print("Matching names: {}".format(len(matching)))
    print()

    for name in matching:
        print(name)

    print()
    print("Unique to {}: {}".format(file1.name, len(only1)))
    print("Unique to {}: {}".format(file2.name, len(only2)))

if __name__ == "__main__":
    main()