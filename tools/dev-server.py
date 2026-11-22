"""Static dev server without caching, so edits show up on every reload.

Usage: python tools/dev-server.py [directory] [port]
The PORT environment variable overrides the port, as a tool that has to move the server sets it.

Like the deployed site, it serves the design concepts (the concepts/ folder) under /sandbox/ next to the
directory it was given, so the links of the concepts' design switcher work locally.
An address that does not exist gets the 404.html of the site with status 404, as on GitHub Pages.
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

    def send_error(self, code, message=None, explain=None):
        page = pathlib.Path(self.directory) / "404.html"
        if code == 404 and page.is_file():
            body = page.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def translate_path(self, path):
        url_path = urllib.parse.urlsplit(path).path
        if url_path.startswith("/sandbox/") and CONCEPTS.is_dir():
            served, self.directory = self.directory, str(CONCEPTS)
            try:
                return super().translate_path(url_path[len("/sandbox"):])
            finally:
                self.directory = served
        return super().translate_path(path)


handler = functools.partial(NoCacheHandler, directory=directory)
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
