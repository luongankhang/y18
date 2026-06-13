# y18

<div align="center">

<!-- 第一行：核心状态 - CI/版本/许可证/平台 -->

[![Build Status](https://img.shields.io/github/actions/workflow/status/buxuku/SmartSub/release.yml?style=flat-square&logo=githubactions&logoColor=white&label=Build)](https://github.com/buxuku/SmartSub/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/buxuku/SmartSub?style=flat-square&logo=github&color=blue&label=Release)](https://github.com/buxuku/SmartSub/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](https://github.com/buxuku/SmartSub/blob/master/LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square&logo=electron&logoColor=white)](https://github.com/buxuku/SmartSub/releases)
[![i18n](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-orange?style=flat-square&logo=googletranslate&logoColor=white)](https://github.com/buxuku/SmartSub)

<!-- 第二行：功能特性 - 模型/翻译服务/硬件加速 -->

[![Whisper](https://img.shields.io/badge/Whisper-Speech%20Recognition-4B8BBE?style=flat-square&logo=openai&logoColor=white)](https://github.com/openai/whisper)
[![Translation](https://img.shields.io/badge/Translation-7%2B%20Services-9cf?style=flat-square&logo=translate&logoColor=white)](https://github.com/buxuku/SmartSub#翻译服务)
[![CUDA](https://img.shields.io/badge/CUDA-11.8%20%7C%2012.x%20%7C%2013.x-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://developer.nvidia.com/cuda-downloads)
[![CoreML](https://img.shields.io/badge/Core%20ML-Apple%20Silicon-000000?style=flat-square&logo=apple&logoColor=white)](https://developer.apple.com/documentation/coreml)
[![Offline](https://img.shields.io/badge/Offline-Local%20Processing-success?style=flat-square&logo=shieldsdotio&logoColor=white)](https://github.com/buxuku/SmartSub)

<!-- 第三行：技术栈 -->

[![Electron](https://img.shields.io/badge/Electron-30-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

<!-- 第四行：社区指标 -->

[![Downloads](https://img.shields.io/github/downloads/buxuku/SmartSub/total?style=flat-square&logo=github&label=Downloads&color=brightgreen)](https://github.com/buxuku/SmartSub/releases)
[![Stars](https://img.shields.io/github/stars/buxuku/SmartSub?style=flat-square&logo=github&label=Stars)](https://github.com/buxuku/SmartSub/stargazers)
[![Forks](https://img.shields.io/github/forks/buxuku/SmartSub?style=flat-square&logo=github&label=Forks)](https://github.com/buxuku/SmartSub/network/members)
[![Issues](https://img.shields.io/github/issues/buxuku/SmartSub?style=flat-square&logo=github&label=Issues)](https://github.com/buxuku/SmartSub/issues)
[![Last Commit](https://img.shields.io/github/last-commit/buxuku/SmartSub?style=flat-square&logo=github&label=Last%20Commit)](https://github.com/buxuku/SmartSub/commits)

<br/>

[ 🇨🇳 中文](README.md) | [ 🌏 English](README_EN.md) | [ 🇯🇵 日本語](README_JA.md)

</div>

**让每一帧画面都能美妙地表达**

智能音视频字幕生成与多语言翻译批量化解决方案（**y18** 定制版，Fork 自 [SmartSub](https://github.com/buxuku/SmartSub)）

> **Dev vs Release**：`yarn dev` 为开发模式（标题栏显示 DEV 徽章，数据目录独立）；打包安装为正式版。详见 [Y18.md](./Y18.md)。

![preview](./resources/preview.png)

![proofread](./resources/proofread.png)

## 💥特性

它保留了之前 [VideoSubtitleGenerator](https://github.com/buxuku/VideoSubtitleGenerator) 这个命令行工具的全部特性，并新增了以下功能:

- 支持多种视频/音频格式生成字幕
- 支持对生成的字幕，或者导入的字幕进行翻译
- 本地化处理，无须上传视频，保护隐私的同时也拥有更快的处理速度
- 支持多种翻译服务:
  - 火山引擎翻译
  - 百度翻译
  - 微软翻译器
  - DeepLX 翻译 （批量翻译容易存在被限流的情况）
  - 本地模型 Ollama 翻译
  - AI聚合平台 [DeerAPI](https://api.deerapi.com/register?aff=QvHM)
  - 支持 OpenAI 风格 API 翻译，如 [deepseek](https://www.deepseek.com/), [azure](https://azure.microsoft.com) 等
- **🎯 自定义参数配置**: 无需代码修改，直接在界面配置 AI 模型参数 [v2.5.3-release-brief.md](./Changelog/v2.5.3-release-brief.md)
  - 支持自定义请求头和请求体参数
  - 支持多种参数类型（文本、数字、开关、JSON对象等）
  - 实时参数验证和错误提示
  - 参数配置导出导入功能
- 自定义字幕文件名，方便兼容不同的播放器挂载字幕识别
- 自定义翻译后的字幕文件内容，支持纯翻译结果或原字幕+翻译结果
- 支持硬件加速
  - NVIDIA CUDA（Windows/Linux）
  - Apple Core ML（macOS M系列芯片）
- 支持运行本地安装的 `whisper` 命令
- 支持自定义并发任务数量

## 关于 CUDA 的支持

软件已内置 GPU 加速包管理功能，无须手动安装 CUDA Toolkit。

- 安装软件后，在「设置 → GPU 加速」中，软件会自动检测你的显卡并推荐合适的加速包版本
- 点击下载对应的加速包即可启用 GPU 加速，支持 CUDA 11.8.0 / 12.2.0 / 12.4.0 / 13.0.2
- 如果启用加速后出现闪退，请尝试切换其他版本的加速包或关闭 GPU 加速

## 关于 Core ML 的支持

从 1.20.0 版本开始，在苹果芯片上，支持使用 Core ML 加速语音识别。如果是苹果芯片，请下载 mac arm64 版本的 release 包。将会自动启动 Core ML 加速。

## 翻译服务

本项目支持多种翻译服务，包括百度翻译、火山引擎翻译、DeepLX、Ollama 本地模型、 DeepSeek 以及 OpenAI 风格的 API。使用这些服务需要相应的 API 密钥或配置。

对于百度翻译、火山引擎等服务的 API 申请方法，可以参考 https://bobtranslate.com/service/ ，感谢 [Bob](https://bobtranslate.com/) 这款优秀的软件提供的信息。

对于 AI 翻译，翻译结果受模型和提示词的影响比较大，你可以尝试不同的模型和提示词，找到适合自己的组合。推荐可以尝试 AI 聚合平台 [DeerAPI](https://api.deerapi.com/register?aff=QvHM), 支持多个平台近 500 种模型，选择合适自己的模型进行翻译。

### 自定义参数配置 (v2.5.3)

SmartSub 现在支持为每个 AI 翻译服务配置自定义参数，让您能够精确控制模型行为：

- **灵活参数配置**: 直接在界面添加和管理自定义参数，无需修改代码
- **参数类型支持**: String、Float、Boolean、Array、Object、Integer 参数类型
- **实时验证**: 参数修改时实时验证，防止无效配置
- **配置管理**: 支持导出导入配置，方便团队共享和备份
- **自动保存**：沿用系统设计，自动保存任何修改

## 模型的选择

从视频或者音频里面，生成字幕文件，需要使用到 whisper 的模型。 whisper 的模型有多种，不同的模型，生成字幕的准确性不同，处理速度也不同。

- 模型越大，准确性越高，对显卡要求也高，处理速度越慢
- 低端设备或者显卡，推荐 `tiny` 或者 `base` 系列的模型，准确性虽然不如 `large` 系列，但是处理速度快，占用显存小
- 普通电脑设备，建议从 `small` 或者 `base` 开始，平衡精度与资源消耗
- 对于高性能显卡/工作站，推荐使用 `large` 系列的模型，准确性高
- 如果原始音视频是英文，推荐使用带 `en` 的模型，专为英语优化，减少多语言干扰
- 如果在乎模型大小，可以考虑使用 `q5` 或者 `q8` 系列的模型，相对于非量化版本，牺牲少量精度换取更小体积

## 🔦使用 (普通用户)

请根据自己的电脑系统和芯片，选择下载对应安装包。GPU 加速包无须在下载安装包时选择，安装软件后可在应用内下载。

| 系统    | 芯片  | 下载安装包  | 说明                                  |
| ------- | ----- | ----------- | ------------------------------------- |
| Windows | x64   | windows-x64 | NVIDIA 用户安装后可在应用内下载加速包 |
| Mac     | Apple | mac-arm64   | 自动启用 Core ML 加速                 |
| Mac     | Intel | mac-x64     | 不支持 GPU 加速                       |
| Linux   | x64   | linux-x64   | NVIDIA 用户安装后可在应用内下载加速包 |

### macOS 用户通过 Homebrew 安装（推荐）

macOS 用户可以通过 Homebrew 快速安装，会自动根据芯片类型（Intel/Apple Silicon）下载对应版本：

```bash
# 添加 tap（只需执行一次）
brew tap buxuku/tap

# 安装
brew install --cask smartsub
```

升级和卸载：

```bash
# 升级到最新版本
brew upgrade --cask smartsub

# 卸载
brew uninstall --cask smartsub
```

### 手动下载安装

1. 前往 [release](https://github.com/buxuku/SmartSub/releases) 页面根据自己的操作系统下载安装包
2. 或者使用网盘 [夸克](https://pan.quark.cn/s/0b16479b40ca) 选择对应的版本进行下载
3. 安装并运行程序
4. 下载模型
5. 在程序中配置所需的翻译服务
6. 选择要处理的音视频文件或字幕文件
7. 设置相关参数（如源语言、目标语言、模型等）
8. 开始处理任务

## 🔦使用 (开发用户)

> 完整说明见 [Y18.md](./Y18.md)（Colab 上游 vs y18 Dev/Release）

1️⃣ 克隆本项目在本地

```shell
git clone <your-y18-repo-url>
```

2️⃣ 在项目中执行 `yarn install` 或者 `npm install`

```shell
cd y18   # 或你的项目目录名
yarn install
cp .env.development.local.example .env.development.local   # 可选
```

如果是 windows / linux 平台，或者 Mac intel 平台，请前往 https://github.com/buxuku/whisper.cpp/releases/tag/latest 下载对应的 node 文件，并重命名为 `addon.node` , 覆盖放在 `extraResources/addons/` 目录下。

3️⃣ 依赖包安装好之后，执行 `yarn dev` 或者 `npm run dev` 启动项目

```shell
yarn dev
```

## 手动下载和导入模型

因为模型文件比较大，如果通过该软件下载模型会存在难以下载的情况，可以手动下载模型并导入到应用中。以下是两个可用于下载模型的链接：

1. 国内镜像源（下载速度较快）：
   https://hf-mirror.com/ggerganov/whisper.cpp/tree/main

2. Hugging Face 官方源：
   https://huggingface.co/ggerganov/whisper.cpp/tree/main

如果是苹果芯片，需要同时下载模型对应的 encoder.mlmodelc 文件。并解压出来放在模型相同目录下。（如果是 q5 或者 q8 系列的模型，无须下载该文件）

下载完成后，您可以通过应用的"模型管理"页面中的"导入模型"功能将下载的模型文件导入到应用中。或者直接复制到模型目录里面即可。

导入步骤：

1. 在"模型管理"页面中，点击"导入模型"按钮。
2. 在弹出的文件选择器中，选择您下载的模型文件。
3. 确认导入后，模型将被添加到您的已安装模型列表中。

## 常见问题

##### 1.提示应用程序已损坏，无法打开。

在终端中执行以下命令：

```shell
sudo xattr -dr com.apple.quarantine /Applications/SmartSub.app
```

然后再次运行应用程序。

## 贡献

👏🏻 欢迎提交 Issue 和 Pull Request 来帮助改进这个项目！

## 支持

⭐ 如果您觉得这个项目对您有帮助，欢迎给我一个 star，或者请我喝一杯咖啡（请备注你的 github 账号）。

👨‍👨‍👦‍👦 如果您有任何使用问题，欢迎加入微信交流群，一起交流学习。

| 支付宝收款码                                   | 微信赞赏码                                   | 微信交流群                                  |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| ![支付宝收款码](./resources/donate_alipay.jpg) | ![微信赞赏码](./resources/donate_wechat.jpg) | ![微信交流群](./resources/WechatIMG428.png) |

## 许可证

本项目采用 MIT 许可证。详情请见 [LICENSE](LICENSE) 文件。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=buxuku/SmartSub&type=Date)](https://star-history.com/#buxuku/SmartSub&Date)
