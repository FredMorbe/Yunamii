"""Static dev server without caching, so edits show up on every reload.

Usage: python tools/dev-server.py [directory] [port]
"""
import functools
import http.server
import sys

directory = sys.argv[1] if len(sys.argv) > 1 else "prototype"
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(NoCacheHandler, directory=directory)
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
