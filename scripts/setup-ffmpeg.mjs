import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { execSync } from 'child_process';

const platform = process.platform;
const arch = process.arch;

let targetTriple = '';

if (platform === 'win32') {
  targetTriple = 'x86_64-pc-windows-msvc.exe';
} else if (platform === 'darwin') {
  targetTriple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
} else if (platform === 'linux') {
  targetTriple = 'x86_64-unknown-linux-gnu';
} else {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

const targetName = `ffmpeg-${targetTriple}`;

// Ensure directory exists
const binariesDir = path.join(process.cwd(), 'src-tauri', 'binaries');
if (!fs.existsSync(binariesDir)) {
  fs.mkdirSync(binariesDir, { recursive: true });
}

const targetPath = path.join(binariesDir, targetName);

console.log(`[Setup] Platform: ${platform}-${arch}`);
console.log(`[Setup] Target Binary: ${targetName}`);
console.log(`[Setup] Copying from: ${ffmpegPath}`);

try {
  fs.copyFileSync(ffmpegPath, targetPath);

  // Set execution permissions on Unix
  if (platform !== 'win32') {
    fs.chmodSync(targetPath, 0o755);
  }

  console.log(`[Setup] Success! Binary ready at: ${targetPath}`);
} catch (e) {
  console.error(`[Setup] Failed: ${e.message}`);
  process.exit(1);
}
