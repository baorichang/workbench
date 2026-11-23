# -*- coding: utf-8 -*-
"""阶段 0 测试：项目骨架与运行通道。"""
import os
import re
import sys
import threading
import unittest
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import server  # noqa: E402

EXPECTED_ROUTES = ["home", "plan", "media", "dev", "consult", "fitness", "diet", "games", "settings"]


class Stage0Test(unittest.TestCase):
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

    def _get(self, path):
        try:
            with urllib.request.urlopen(self.base + path, timeout=5) as resp:
                return resp.status, resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")

    def test_directory_skeleton(self):
        for rel in ["data", os.path.join("web", "css"), os.path.join("web", "js"),
                    os.path.join("web", "js", "views"), "tests"]:
            self.assertTrue(os.path.isdir(os.path.join(BASE_DIR, rel)), f"缺少目录 {rel}")
        for fname in ["server.py", os.path.join("web", "index.html"),
                      os.path.join("web", "css", "style.css"), "启动工作台.bat"]:
            self.assertTrue(os.path.isfile(os.path.join(BASE_DIR, fname)), f"缺少文件 {fname}")

    def test_health_check(self):
        status, body = self._get("/api/health")
        self.assertEqual(status, 200)
        self.assertIn('"ok": true', body)
        self.assertIn("up", body)

    def test_index_has_nine_nav_routes(self):
        status, body = self._get("/")
        self.assertEqual(status, 200)
        self.assertIn("<title>我的工作台</title>", body)
        routes = re.findall(r'data-route="([^"]+)"', body)
        self.assertEqual(sorted(routes), sorted(EXPECTED_ROUTES))
        self.assertEqual(len(routes), 9)

    def test_static_assets_served(self):
        for path in ["/css/style.css", "/js/app.js", "/js/api.js", "/js/components.js",
                     "/js/views/home.js", "/js/views/settings.js"]:
            status, _ = self._get(path)
            self.assertEqual(status, 200, f"静态资源 {path} 应可访问")

    def test_missing_static_returns_404(self):
        status, _ = self._get("/no-such-file.js")
        self.assertEqual(status, 404)

    def test_unknown_resource_returns_json_404(self):
        status, body = self._get("/api/no-such-resource")
        self.assertEqual(status, 404)
        self.assertIn('"ok": false', body)

    def test_known_resource_api_available(self):
        status, body = self._get("/api/plans")
        self.assertEqual(status, 200)
        self.assertIn('"ok": true', body)


if __name__ == "__main__":
    unittest.main()
