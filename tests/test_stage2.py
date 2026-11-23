# -*- coding: utf-8 -*-
"""阶段 2 测试：前端外壳与通用组件。"""
import os
import re
import subprocess
import sys
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

JS_FILES = [
    "js/app.js", "js/api.js", "js/components.js",
    "js/views/home.js", "js/views/plan.js", "js/views/media.js",
    "js/views/dev.js", "js/views/consult.js", "js/views/fitness.js",
    "js/views/diet.js", "js/views/games.js", "js/views/settings.js",
]


class Stage2Test(unittest.TestCase):
    def test_index_shell_structure(self):
        with open(os.path.join(WEB_DIR, "index.html"), encoding="utf-8") as f:
            html = f.read()
        for anchor in ['id="view"', 'id="page-title"', 'class="sidebar"', 'class="topbar"',
                       'id="today-date"', 'id="quick-memo-btn"']:
            self.assertIn(anchor, html, f"外壳缺少 {anchor}")
        # 引用的本地资源都存在
        for ref in re.findall(r'(?:src|href)="(/[^"]+)"', html):
            if ref.startswith("/css/") or ref.startswith("/js/"):
                self.assertTrue(os.path.isfile(os.path.join(WEB_DIR, ref.lstrip("/"))),
                                f"引用资源不存在 {ref}")

    def test_js_syntax_valid(self):
        for rel in JS_FILES:
            path = os.path.join(WEB_DIR, rel)
            self.assertTrue(os.path.isfile(path), f"缺少 {rel}")
            proc = subprocess.run(["node", "--check", path], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, f"{rel} 语法错误：{proc.stderr}")

    def test_components_expose_methods(self):
        with open(os.path.join(WEB_DIR, "js", "components.js"), encoding="utf-8") as f:
            src = f.read()
        for method in ["escape", "toast", "confirm", "openForm", "emptyState", "statusLabel"]:
            self.assertIn(method, src, f"组件缺少方法 {method}")

    def test_router_titles_match_routes(self):
        with open(os.path.join(WEB_DIR, "js", "app.js"), encoding="utf-8") as f:
            src = f.read()
        for route in ["home", "plan", "media", "dev", "consult", "fitness", "diet", "games", "settings"]:
            self.assertIn(route, src)


if __name__ == "__main__":
    unittest.main()
