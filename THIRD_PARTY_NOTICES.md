# Third-party notices

The browser bundle includes marked (MIT) and DOMPurify (Apache-2.0 or MPL-2.0; distributed under Apache-2.0 here). The host source adapter uses fast-xml-parser (MIT) and entities (BSD-2-Clause), installed through the host dependency manager.

The build copies the complete license texts of these four packages into `dist/THIRD_PARTY_NOTICES.txt`. Exact dependency versions are recorded in `bun.lock`. Development-only dependencies are not included in the browser bundle.

EdgeEver host integration follows EdgeEver's AGPL-3.0-or-later license. Last30Days inspired the workflow; none of its runtime code is vendored or required.

浏览器包包含 marked（MIT）和 DOMPurify（本项目选择 Apache-2.0 授权）；宿主来源适配使用 fast-xml-parser（MIT）、entities（BSD-2-Clause）。构建将四个依赖的完整许可证写入 `dist/THIRD_PARTY_NOTICES.txt`，准确版本见锁文件。开发依赖不打包。宿主适配采用与 EdgeEver 一致的 AGPL-3.0-or-later，未打包 Last30Days 运行代码。
