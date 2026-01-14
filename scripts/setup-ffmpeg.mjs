import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

const targetDir = path.join(process.cwd(), 'src-tauri', 'binaries');
const targetName = 'ffmpeg-x86_64-pc-windows-msvc.exe';
const targetPath = path.join(targetDir, targetName);

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`Copying ffmpeg from ${ffmpegPath} to ${targetPath}`);
fs.copyFileSync(ffmpegPath, targetPath);
console.log('FFmpeg sidecar setup complete.');
