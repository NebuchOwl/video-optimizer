# Video Optimizer Pro

A powerful, high-performance video toolkit built with **Tauri v2**, **Rust**, and **FFmpeg**. Optimize, trim, convert, and inspect your media files with a beautiful, modern interface.

## 🚀 Features

*   **Video Optimizer**:
    *   **Batch Processing**: Queue multiple files for optimization.
    *   **Smart Compression**: Reduce file size while maintaining quality (H.264, H.265, ProRes).
    *   **Hardware Selection**: Dedicated backend selector for Software (CPU), NVIDIA (NVENC/AV1), AMD (AMF), and Intel (QSV/VP9).
    *   **Advanced Codecs**: Support for H.264, H.265 (HEVC), AV1, VP9, and ProRes (CPU only).
    *   **Low Power Mode**: 'Standard' vs 'Low Usage' CPU profiles.
*   **Precision Trimmer**:
    *   **Lossless Trimming**: Cut video segments instantly without re-encoding.
    *   **Local Streaming**: Integrated Rust server (Axum) for smooth playback of large files.
*   **Universal Converter**:
    *   Convert between all major formats: MP4, MKV, MOV, WEBM, AVI, GIF.
    *   Batch conversion support with progress tracking.
*   **Video Merger**:
    *   Stitch multiple clips together into a single file.
*   **Audio Lab**:
    *   Extract MP3 from video.
    *   Remove (Mute) audio tracks.
    *   Normalize audio levels (loudnorm).
*   **Media Inspector**:
    *   Drag and drop to view detailed metadata (Codecs, Bitrate, Colorspace).
*   **Modern Experience**:
    *   **Theming**: Choose from Cosmic, Light, Midnight, or Sunset themes.
    *   **Native Integration**: System file dialogs and robust Drag & Drop support.

## 🛠️ Tech Stack

*   **Frontend**: Vanilla JavaScript, Tailwind CSS (managed via Vite).
*   **Backend**: Rust (Tauri v2 Core), Axum (Local Streaming Server).
*   **Video Engine**: FFmpeg (Sidecar binary).

## 📦 Installation & Setup

### Prerequisites
1.  **Node.js** (v18 or newer).
2.  **Rust** (Latest stable version).
3.  **Visual Studio C++ Build Tools** (for Windows development).
4.  **FFmpeg**: The application expects an `ffmpeg` binary.
    *   *Note: For development, ensure FFmpeg is in your system PATH or configured in `tauri.conf.json`.*

### Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Run in Development Mode**:
    ```bash
    npm run tauri dev
    ```
    This command will start the Vite frontend server and launch the Tauri application window.

3.  **Build for Production**:
    ```bash
    npm run tauri build
    ```
    The compiled executable (MSI/EXE) will be located in `src-tauri/target/release/bundle/msi`.

## 🧩 Architecture Highlights

*   **Sidecar Pattern**: Heavy video processing tasks are offloaded to a designated `ffmpeg` binary to ensure performance and stability.
*   **Streaming Server**: A custom Rust backend service runs on port `18493` to stream local video files to the frontend video player, bypassing web security restrictions on `file://` protocols.
*   **Batch Queue UI**: A centralized, non-blocking UI component handles progress updates for long-running operations across different tabs.

## 👤 Author

**Sina Kop**  
*Video Optimizer Pro*

## 📄 License

This project is licensed under the MIT License.
