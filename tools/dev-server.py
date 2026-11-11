"""Static dev server without caching, so edits show up on every reload.

Usage: python tools/dev-server.py [directory] [port]
The PORT environment variable overrides the port, as a tool that has to move the server sets it.

Like the deployed site, it serves the design concepts under /concepts/ next to the directory it
was given, so the links of the site's design switcher work locally.
"""
import functools
import http.server
import os
import pathlib
import sys
import urllib.parse

CONCEPTS = pathlib.Path(__file__).resolve().parent.parent / "concepts"

directory = sys.argv[1] if len(sys.argv) > 1 else "prototype"
port = int(os.environ.get("PORT") or (sys.argv[2] if len(sys.argv) > 2 else 5173))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        url_path = urllib.parse.urlsplit(path).path
        if url_path.startswith("/concepts/") and CONCEPTS.is_dir():
            served, self.directory = self.directory, str(CONCEPTS)
            try:
                return super().translate_path(url_path[len("/concepts"):])
            finally:
                self.directory = served
        return super().translate_path(path)


handler = functools.partial(NoCacheHandler, directory=directory)
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
