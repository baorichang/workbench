# -*- coding: utf-8 -*-
"""阶段 5 测试：健身 / 饮食 / 游戏娱乐。"""
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


class Stage5Test(unittest.TestCase):
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

    def _read(self, name):
        with open(os.path.join(WEB_JS, name), encoding="utf-8") as f:
            return f.read()

    def test_js_syntax_valid(self):
        for name in ["fitness.js", "diet.js", "games.js"]:
            proc = subprocess.run(["node", "--check", os.path.join(WEB_JS, name)],
                                   capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, f"{name} 语法错误：{proc.stderr}")

    def test_fitness_structure(self):
        src = self._read("fitness.js")
        for tab in ["plans", "logs", "body"]:
            self.assertIn(tab, src)
        self.assertIn("/api/fitness/", src)

    def test_diet_structure(self):
        src = self._read("diet.js")
        for meal in ["早餐", "午餐", "晚餐", "加餐"]:
            self.assertIn(meal, src)
        self.assertIn("/api/diet/", src)
        self.assertIn("recipes", src)

    def test_games_structure(self):
        src = self._read("games.js")
        for status in ["待玩", "在玩", "已通关", "弃坑"]:
            self.assertIn(status, src)
        self.assertIn("wishlist", src)

    def test_fitness_blocks_api(self):
        _, body = self._req("POST", "/api/fitness/plans", {"day": "胸", "name": "卧推"})
        pid = body["data"]["id"]
        self._req("PUT", f"/api/fitness/plans/{pid}", {"sets": "4"})
        _, body = self._req("POST", "/api/fitness/logs", {"date": TODAY, "content": "胸推"})
        lid = body["data"]["id"]
        self._req("POST", "/api/fitness/body", {"date": TODAY, "weight": "70"})
        _, data = self._req("GET", "/api/fitness")
        self.assertEqual(len(data["data"]["plans"]), 1)
        self.assertEqual(len(data["data"]["logs"]), 1)
        self.assertEqual(len(data["data"]["body"]), 1)
        self._req("DELETE", f"/api/fitness/logs/{lid}")
        _, data = self._req("GET", "/api/fitness")
        self.assertEqual(data["data"]["logs"], [])

    def test_diet_meals_and_recipes_api(self):
        self._req("POST", "/api/diet/meals", {"date": TODAY, "meal": "午餐", "food": "沙拉"})
        _, body = self._req("POST", "/api/diet/recipes", {"name": "快手晚餐", "content": "鸡胸 + 蔬菜"})
        rid = body["data"]["id"]
        _, data = self._req("GET", "/api/diet")
        self.assertEqual(len(data["data"]["meals"]), 1)
        self.assertEqual(len(data["data"]["recipes"]), 1)
        self._req("DELETE", f"/api/diet/recipes/{rid}")
        _, data = self._req("GET", "/api/diet")
        self.assertEqual(data["data"]["recipes"], [])

    def test_games_status_and_wishlist_api(self):
        _, body = self._req("POST", "/api/games", {"name": "游戏X", "status": "在玩", "wishlist": True})
        gid = body["data"]["id"]
        self._req("PUT", f"/api/games/{gid}", {"status": "已通关", "wishlist": False})
        _, body = self._req("GET", f"/api/games/{gid}")
        self.assertEqual(body["data"]["status"], "已通关")
        self.assertFalse(body["data"]["wishlist"])


if __name__ == "__main__":
    unittest.main()
