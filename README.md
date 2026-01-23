# Video Optimizer
> **Version 0.3.0 (Beta)**
[![Release](https://img.shields.io/github/v/release/NebuchOwl/video-optimizer)](https://github.com/NebuchOwl/video-optimizer/releases)


A powerful, high-performance video toolkit built with **Tauri v2**, **Rust**, and **FFmpeg**. Optimize, trim, convert, and inspect your media files with a beautiful, modern interface.

## 🚀 Features

*   **Video Optimizer**:
    *   **Batch Processing**: Queue multiple files for optimization.
    *   **Smart Compression**: Reduce file size while maintaining quality (H.264, H.265, ProRes).
    *   **Hardware Selection**: Dedicated backend selector for Software (CPU), NVIDIA (NVENC/AV1), AMD (AMF), and Intel (QSV/VP9).
    *   **Advanced Codecs**: Support for H.264, H.265 (HEVC), AV1, VP9, and ProRes (CPU only).
*   **Precision Trimmer**:
    *   **Lossless Trimming**: Cut video segments instantly without re-encoding.
    *   **Local Streaming**: Integrated Rust server for smooth playback of large files.
*   **Universal Converter & Merger**:
    *   Convert between MP4, MKV, MOV, WEBM, AVI, GIF.
    *   Stitch multiple clips together into a single file.
*   **Audio Lab**:
    *   Extract MP3, Mute Tracks, or Normalize Audio Levels.
    *   **Settings Hub**: Centralized configuration with a tabbed interface (General, Processing, Logs, Appearance).
    *   **Theming Engine**: Choose from **Cosmic**, **Light**, **Midnight**, or **Sunset** with a live visual selector.
*   **Media Inspector**:
    *   Detailed metadata analysis for any media file.

## 🛠️ Tech Stack

*   **Frontend**: Vanilla JavaScript, Tailwind CSS (managed via Vite).
*   **Backend**: Rust (Tauri v2 Core), Axum (Local Streaming Server).
*   **Video Engine**: FFmpeg (Sidecar binary).

## 📦 Installation & Setup

### Prerequisites
1.  **Node.js** (v18+).
2.  **Rust** (Latest stable).
3.  **FFmpeg**: Must be available in system PATH or bundled.

### Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Run in Development Mode**:
    ```bash
    npm run tauri dev
    ```

3.  **Build for Production**:
    ```bash
    npm run tauri build
    ```

### Cross-Platform Support
To build for **macOS** or **Linux**, please read our [Contributing Guide](CONTRIBUTING.md).

## 👤 Author

**Sina Kop**
*Video Optimizer*

## 📄 License

This project is licensed under a **Custom Non-Commercial License**.

You are free to use, modify, and share this software for **personal, educational, and non-commercial purposes**.

❌ Commercial use (including paid products, SaaS, or business use) is **not permitted** without a separate commercial license.

For commercial licensing inquiries, please contact the author.

See `LICENSE.txt` for details.

### Commercial License

Commercial use of this software is available under a separate
Commercial License.

See `COMMERCIAL_LICENSE.txt` for details.

### FFmpeg & Codec Notice

This application uses FFmpeg as an external binary and may utilize hardware-accelerated
encoding technologies such as NVIDIA NVENC, AMD AMF, and Intel QSV.

The use of this software does **not** grant any patent or codec license.
Certain codecs (e.g. H.264, H.265/HEVC, ProRes, AAC) may be subject to patent or licensing restrictions.

Users are solely responsible for ensuring compliance with all applicable codec and patent laws.