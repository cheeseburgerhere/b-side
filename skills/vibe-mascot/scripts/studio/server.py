"""Mascot studio: watch all four moods animate and hand-edit pixels, for any mascot.

    python server.py --svg ~/.claude/vibe/mascots/<name>.svg --build ~/.claude/vibe/mascot-src/make_<name>.py
    python server.py --svg some-mascot.svg        # a mascot with no builder

Then open http://127.0.0.1:8765/ (moods) or /editor.html (pixel editor).

With --build, the builder (called as `python <builder> <out.svg>`, with the
kit's folder on PYTHONPATH so it can sit anywhere) must end
with `apply_overrides(...)` from pixel_overrides.py; hand edits live in
`<name>_overrides.json` next to it and survive every rebuild. Without a builder,
the studio keeps the untouched SVG and the edits in ~/.claude/vibe/studio/<name>/
and writes the edited result back into the SVG on save.

Local only: it binds 127.0.0.1, and a save must carry the X-Mascot-Studio
header, which a page from another site cannot send.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
sys.path.insert(0, KIT)
from pixel_overrides import apply_overrides  # noqa: E402

NAME = re.compile(r"^[A-Za-z0-9_ |-]{1,80}$")


def run_builder(build, out, **env):
    """Runs a builder with the kit importable, wherever the builder lives."""
    path = os.pathsep.join(p for p in (KIT, os.environ.get("PYTHONPATH")) if p)
    subprocess.run([sys.executable, build, out], check=True, capture_output=True,
                   env=dict(os.environ, PYTHONPATH=path, **env))


class Mascot:
    def __init__(self, svg, build=None, overrides=None):
        self.svg = os.path.abspath(svg)
        self.name = os.path.splitext(os.path.basename(self.svg))[0]
        self.build = os.path.abspath(build) if build else None
        if self.build:
            self.overrides = overrides or os.path.join(os.path.dirname(self.build), f"{self.name}_overrides.json")
            self.base_file = None
        else:
            work = os.path.join(os.path.expanduser("~/.claude/vibe/studio"), self.name)
            os.makedirs(work, exist_ok=True)
            self.overrides = overrides or os.path.join(work, "overrides.json")
            self.base_file = os.path.join(work, "base.svg")
            if not os.path.exists(self.base_file):
                shutil.copyfile(self.svg, self.base_file)
            elif self.edited(self.read(self.base_file)) != self.read(self.svg):
                sys.exit(f"{self.svg} changed outside the studio since its edits were saved.\n"
                         f"To start over from the current file, delete {work}.")

    @staticmethod
    def read(path):
        with open(path, encoding="utf-8") as f:
            return f.read()

    def edits(self):
        return json.loads(self.read(self.overrides)) if os.path.exists(self.overrides) else {}

    def edited(self, base):
        return apply_overrides(base, self.overrides) if self.edits() else base

    def base(self):
        """The mascot without hand edits: what the editor paints on."""
        if not self.build:
            return self.read(self.base_file)
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "base.svg")
            run_builder(self.build, out, NO_PIXEL_OVERRIDES="1")
            return self.read(out)

    def save(self, edits):
        with open(self.overrides, "w", encoding="utf-8") as f:
            json.dump(edits, f, indent=1, sort_keys=True)
        if self.build:
            run_builder(self.build, self.svg)
        else:
            with open(self.svg, "w", encoding="utf-8") as f:
                f.write(self.edited(self.read(self.base_file)))


def valid(edits):
    if not isinstance(edits, dict):
        return False
    for key, cells in edits.items():
        if not NAME.match(key) or not isinstance(cells, dict):
            return False
        for xy, cls in cells.items():
            if not re.match(r"^\d{1,3},\d{1,3}$", xy):
                return False
            if cls is not None and not (isinstance(cls, str) and NAME.match(cls)):
                return False
    return True


def handler(mascot):
    class Studio(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=os.path.join(HERE, "site"), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def reply(self, code, body, kind="application/json"):
            data = (body if isinstance(body, str) else json.dumps(body)).encode()
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            routes = {
                "/api/info": lambda: (json.dumps({"name": mascot.name, "builder": bool(mascot.build)}), "application/json"),
                "/api/base": lambda: (mascot.base(), "image/svg+xml"),
                "/api/working": lambda: (mascot.read(mascot.svg), "image/svg+xml"),
                "/api/overrides": lambda: (json.dumps(mascot.edits()), "application/json"),
            }
            if self.path in routes:
                try:
                    body, kind = routes[self.path]()
                except subprocess.CalledProcessError as e:
                    return self.reply(500, {"error": e.stderr.decode(errors="replace")[-400:]})
                return self.reply(200, body, kind)
            return super().do_GET()

        def do_POST(self):
            if self.path != "/api/save" or self.headers.get("X-Mascot-Studio") != "1":
                return self.reply(403, {"error": "forbidden"})
            try:
                edits = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            except ValueError:
                return self.reply(400, {"error": "bad json"})
            if not valid(edits):
                return self.reply(400, {"error": "bad edits"})
            edits = {k: v for k, v in edits.items() if v}
            try:
                mascot.save(edits)
            except subprocess.CalledProcessError as e:
                return self.reply(500, {"error": e.stderr.decode(errors="replace")[-400:]})
            return self.reply(200, {"ok": True, "pixels": sum(len(v) for v in edits.values())})

    return Studio


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--svg", required=True, help="the mascot SVG the pane loads")
    ap.add_argument("--build", help="its builder script, called as `python <builder> <out.svg>`")
    ap.add_argument("--overrides", help="where hand edits live (default: next to the builder)")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    mascot = Mascot(args.svg, args.build, args.overrides)
    print(f"{mascot.name} studio on http://127.0.0.1:{args.port}/  (pixel editor: /editor.html)")
    print(f"hand edits: {mascot.overrides}")
    ThreadingHTTPServer(("127.0.0.1", args.port), handler(mascot)).serve_forever()


if __name__ == "__main__":
    main()
