# Contributing to Video Optimizer

Thank you for your interest in improving Video Optimizer! This guide focuses on helping you understand the codebase and build the application for different platforms.

## 🏗️ Project Architecture

Video Optimizer uses the **Tauri** framework, which combines a lightweight Rust backend with a web-based frontend.

### Folder Structure
*   **`src/`**: The Frontend Code (UI).
    *   `main.js`: Core logic (State management, Event listeners, Tauri API calls).
    *   `style.css`: All styling (Tailwind CSS).
    *   `index.html`: The layout structure.
*   **`src-tauri/`**: The Backend Code (System).
    *   `src/lib.rs` & `main.rs`: Rust entry points.
    *   `tauri.conf.json`: Application configuration (Permissions, Window settings).
    *   `binaries/`: Contains external tools like `ffmpeg`.
*   **`scripts/`**: Helper scripts for build automation.

### Key Concepts
1.  **Sidecar Integration**:  
    We don't process video with JavaScript or Rust directly. Instead, we bundle a pre-compiled `ffmpeg` binary. The app spawns this binary as a child process to handle heavy lifting.
    *   *Code Reference*: See `processManager.start()` in `src/main.js`.

2.  **Streaming Server**:  
    Browsers cannot verify integrity of local video files efficiently. We spin up a local server (Rust/Axum) on port `18493` to stream video chunks to the frontend player.
    *   *Code Reference*: See `src-tauri/src/lib.rs`.

## 🌍 Cross-Platform Development

Video Optimizer works on Windows, macOS, and Linux. However, since it relies on `ffmpeg`, you must provide the correct binary for your OS.

### 1. The FFmpeg Sidecar
Tauri requires a specific naming convention for external binaries based on the "Target Triple":

| Platform | Target Name |
| :--- | :--- |
| **Windows** | `ffmpeg-x86_64-pc-windows-msvc.exe` |
| **macOS (Intel)** | `ffmpeg-x86_64-apple-darwin` |
| **macOS (M1/M2/M3)** | `ffmpeg-aarch64-apple-darwin` |
| **Linux** | `ffmpeg-x86_64-unknown-linux-gnu` |

### 2. Automatic Setup
We have included a script to automate this for you.
1.  Run `npm install` (this installs `ffmpeg-static`).
2.  Run `node scripts/setup-ffmpeg.mjs`.

This script detects your OS and copies the correct binary to `src-tauri/binaries/`.

### 3. Building for Release
To build the application executable (Installer):

```bash
npm run tauri build
```

The output will be found in `src-tauri/target/release/bundle/`.

## 🚀 GitHub Workflow

This repository includes a **GitHub Action** (`.github/workflows/release.yml`) that automatically builds the application for Windows, macOS, and Linux whenever you create a new release tag (e.g., `v0.2.1`).

1.  Push your code.
2.  Create a Tag: `git tag v0.3.0 && git push origin v0.3.0`
3.  Go to the "Actions" tab on GitHub to see the build progress.
4.  Once compiled, the executables will appear in the "Releases" section.
