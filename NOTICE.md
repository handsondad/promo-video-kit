# 致谢与第三方

## 参考过做法的项目

只学了方法，没有复制它们的代码或文字。

- **HyperFrames**（heygen-com/hyperframes，Apache-2.0）：机检的思路（阅读时间、字号下限、对比度、空镜与静止、
  安全区）、审片图与分级修改清单、SPEC 和默认值黑名单、节拍与动效的数、音效要有画面原因。
- **lemo-opuscar**（MIT）：一个片子可切换多种视觉风格的组织方式（风格目录、风格规格书、风格对照图）。

## 运行时依赖

由 `setup.mjs` 按 `skill/product-promo-video/deps/` 里锁定的版本装进工具目录，不随本仓库分发。

| 包 | 许可 | 用途 |
|---|---|---|
| playwright-core | Apache-2.0 | 驱动本机已装的 Edge / Chrome 逐帧截图 |
| imageio-ffmpeg | BSD-2-Clause；内含的 ffmpeg 是 GPL-3.0 构建（`--enable-gpl --enable-version3`） | 编码 H.264 + AAC、测响度 |
| edge-tts | LGPL-3.0 | 中文旁白，合成时调用在线语音服务 |

离线包（`setup.mjs --pack`）里是这些包的原样文件，各自带着许可证文件。把离线包交给别人等于分发这些包，
其中 ffmpeg 适用 GPL-3.0 的分发条件（提供对应源码或获取方式）；对外发之前先确认。
