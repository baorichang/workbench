# -*- coding: utf-8 -*-
"""阶段 6 测试：数据设置与备份恢复。"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import server  # noqa: E402
import storage  # noqa: E402

WEB_JS = os.path.join(BASE_DIR, "web", "js", "views")
TODAY = date.today().isoformat()


class Stage6Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.make_server(0)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = storage.DATA_DIR
        storage.DATA_DIR = self.tmp.name

    def tearDown(self):
        storage.DATA_DIR = self._old
        self.tmp.cleanup()

    def _req(self, method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    def test_js_syntax_and_structure(self):
        path = os.path.join(WEB_JS, "settings.js")
        proc = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        with open(path, encoding="utf-8") as f:
            src = f.read()
        for keyword in ["/api/system/info", "/api/backup/export", "/api/backup/import",
                        "/api/backup/restore", "/clear", "导出备份", "覆盖恢复"]:
            self.assertIn(keyword, src)

    def test_system_info_counts(self):
        self._req("POST", "/api/memos", {"text": "a"})
        self._req("POST", "/api/plans", {"title": "b", "date": TODAY})
        self._req("POST", "/api/games", {"name": "g", "status": "在玩"})
        status, body = self._req("GET", "/api/system/info")
        self.assertEqual(status, 200)
        info = body["data"]
        self.assertEqual(info["counts"]["memos"], 1)
        self.assertEqual(info["counts"]["plans"], 1)
        self.assertEqual(info["counts"]["games"], 1)
        self.assertTrue(info["dataDir"])
        self.assertTrue(info["lastSavedAt"])

    def test_export_contains_all_resources(self):
        self._req("POST", "/api/plans", {"title": "x", "date": TODAY})
        _, body = self._req("GET", "/api/backup/export")
        backup = body["data"]
        for res in storage.all_resources():
            self.assertIn(res, backup["data"])
        self.assertTrue(backup["exportedAt"])

    def test_preview_then_restore(self):
        self._req("POST", "/api/plans", {"title": "要保留", "date": TODAY})
        _, body = self._req("GET", "/api/backup/export")
        backup = body["data"]
        status, preview = self._req("POST", "/api/backup/import", backup)
        self.assertEqual(status, 200)
        self.assertEqual(preview["data"]["plans"], 1)

        self._req("POST", "/api/plans/clear")
        _, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"], [])

        status, _ = self._req("POST", "/api/backup/restore", backup)
        self.assertEqual(status, 200)
        _, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"][0]["title"], "要保留")

    def test_clear_single_resource_keeps_others(self):
        self._req("POST", "/api/memos", {"text": "备忘"})
        self._req("POST", "/api/games", {"name": "游戏", "status": "待玩"})
        self._req("POST", "/api/memos/clear")
        _, memos = self._req("GET", "/api/memos")
        _, games = self._req("GET", "/api/games")
        self.assertEqual(memos["data"], [])
        self.assertEqual(len(games["data"]), 1)


if __name__ == "__main__":
    unittest.main()
