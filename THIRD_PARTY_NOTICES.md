# Third-party notices

The plugin browser bundle includes marked (MIT), DOMPurify (distributed under Apache-2.0), fast-xml-parser (MIT), and entities (BSD-2-Clause). Source parsing dependencies are bundled with the plugin, not installed in EdgeEver.

The build copies the complete license texts of all bundled packages, including transitive runtime dependencies into `dist/THIRD_PARTY_NOTICES.txt`. Exact versions are recorded in `bun.lock`; development dependencies are not bundled. The plugin is AGPL-3.0-or-later. Last30Days inspired the workflow; none of its runtime code is vendored or required.

插件浏览器包包含 marked（MIT）、DOMPurify（本项目选择 Apache-2.0）、fast-xml-parser（MIT）、entities（BSD-2-Clause）。来源解析依赖随插件打包，不安装到 EdgeEver。构建将所有打包依赖（含传递运行依赖）的完整许可证写入 `dist/THIRD_PARTY_NOTICES.txt`，准确版本见锁文件，开发依赖不打包。插件采用 AGPL-3.0-or-later，未打包或依赖 Last30Days 运行代码。
