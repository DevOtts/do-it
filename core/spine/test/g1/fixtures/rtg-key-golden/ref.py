# Reference rtg-key/1 assembly (stdlib only: hashlib, json, sys). Used by the Python gate plugin's own tests too.
# usage: python3 -I ref.py input.json [manifest_out]   prints the key (sha256 hex of the manifest bytes)
import hashlib
import json
import sys


def assemble(spine, adapter):
    lines = []
    for fields in list(spine) + list(adapter):
        fields = [str(f) for f in fields]
        for f in fields:
            if "\t" in f or "\n" in f or "\r" in f:
                return None, None
        lines.append("\t".join(fields))
    lines = sorted(lines, key=lambda s: s.encode("utf-8"))
    manifest = "rtg-key/1\n" + "".join(line + "\n" for line in lines)
    data = manifest.encode("utf-8")
    return data, hashlib.sha256(data).hexdigest()


def main():
    with open(sys.argv[1], encoding="utf-8") as fh:
        inp = json.load(fh)
    data, key = assemble(inp["spine"], inp["adapter"])
    if data is None:
        sys.stdout.write("null\n")
        return
    if len(sys.argv) > 2:
        with open(sys.argv[2], "wb") as out:
            out.write(data)
    sys.stdout.write(key + "\n")


main()
