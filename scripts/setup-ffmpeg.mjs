import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

const targetName = 'ffmpeg-x86_64-pc-windows-msvc.exe';

const targetDirs = [
  path.join(process.cwd(), 'src-tauri', 'binaries'),
  path.join(process.cwd(), 'src-tauri')
];

console.log('Starting FFmpeg setup...');

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn(`Could not create directory ${dir}: ${e.message}`);
    }
  }

  const targetPath = path.join(dir, targetName);
  console.log(`Copying ffmpeg to ${targetPath}`);
  try {
    fs.copyFileSync(ffmpegPath, targetPath);
  } catch (e) {
    console.error(`Failed to copy to ${targetPath}: ${e.message}`);
  }
});

console.log('FFmpeg sidecar setup complete.');
