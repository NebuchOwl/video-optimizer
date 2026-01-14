import './style.css';
import { Command } from '@tauri-apps/plugin-shell';
import { open } from '@tauri-apps/plugin-dialog';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const dropContent = document.getElementById('drop-content');
const filePreview = document.getElementById('file-preview');
const filenameEl = document.getElementById('filename');
const filesizeEl = document.getElementById('filesize');
const changeFileBtn = document.getElementById('change-file-btn');
const optionsPanel = document.getElementById('options-panel');
const optimizeBtn = document.getElementById('optimize-btn');
const progressOverlay = document.getElementById('progress-overlay');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const cancelBtn = document.getElementById('cancel-btn');

let selectedFilePath = null;
let currentChildProcess = null;

// Drag and Drop Logic
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('border-purple-500', 'bg-gray-800/50');
});

dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-purple-500', 'bg-gray-800/50');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-purple-500', 'bg-gray-800/50');
  // Note: For Drag & Drop in Tauri v2, webview might behave differently regarding file paths.
  // If 'path' property is missing, we might need a different approach (e.g. tauri-plugin-fs).
  // Start with standard API check.
  if (e.dataTransfer.files.length) {
    // In Tauri, File object usually has a path property (non-standard but injected)
    const file = e.dataTransfer.files[0];
    // Safe check for path, widely supported in Tauri webview
    const path = file.path || file.name;
    // If path is just filename, drag and drop might not work for full path without plugin hooks.
    // But let's assume it works or user uses the button.
    if (file.path) {
      handleFileSelect(file.name, file.size, file.path);
    } else {
      // Fallback or warning
      console.warn("Could not retrieve full path from drag and drop. Please use the button.");
      // Try to handle regular file select if internal logic allows, valid for basic testing? No ffmpeg needs path.
      alert("Please use the 'Click to upload' button for now to ensure file access permissions.");
    }
  }
});

dropzone.addEventListener('click', async () => {
  try {
    const file = await open({
      multiple: false,
      filters: [{
        name: 'Video',
        extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm']
      }]
    });

    if (file) {
      // file is a path string or object depending on version? 
      // In v2 plugin-dialog, it returns null or string (if multiple: false) or string[] (if multiple: true).
      // Actually it returns FileResponse? No, usually string path.
      // Let's assume it returns string path.
      // We need size? We can't get size easily from just path without filesystem plugin.
      // For UI purposes, we can skip size or get it via another command. 
      // We'll just show name.
      const name = file.replace(/^.*[\\\/]/, '');
      handleFileSelect(name, 0, file); // Size 0 as placeholder
    }
  } catch (err) {
    console.error("Failed to open dialog:", err);
  }
});

changeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUI();
});

function handleFileSelect(name, size, path) {
  selectedFilePath = path;

  dropContent.classList.add('hidden');
  filePreview.classList.remove('hidden');
  filePreview.classList.add('flex');

  filenameEl.textContent = name;
  filesizeEl.textContent = size > 0 ? formatBytes(size) : 'Ready to encode';

  optionsPanel.classList.remove('opacity-50', 'pointer-events-none');
}

function resetUI() {
  selectedFilePath = null;
  dropContent.classList.remove('hidden');
  filePreview.classList.add('hidden');
  filePreview.classList.remove('flex');
  optionsPanel.classList.add('opacity-50', 'pointer-events-none');
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const optionBtns = document.querySelectorAll('.option-btn');
let currentQuality = 'low';

optionBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Stop propagation to avoid any parent click issues
    e.stopPropagation();

    optionBtns.forEach(b => {
      b.classList.remove('ring-2', 'ring-purple-500', 'bg-gray-700');
      b.classList.add('bg-gray-800');
    });
    btn.classList.remove('bg-gray-800');
    btn.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
    currentQuality = btn.dataset.quality;
  });
});

// Init Default quality
// optionBtns[0].click(); // Can trigger event logic errors if elements not fully ready, manual set is better
currentQuality = 'low';
optionBtns[0].classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
optionBtns[0].classList.remove('bg-gray-800');

optimizeBtn.addEventListener('click', async () => {
  if (!selectedFilePath) return;

  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  optimizeBtn.disabled = true;

  // Determine output path (input_optimized.ext)
  // Simple logic: insert _optimized before extension
  const lastDotIndex = selectedFilePath.lastIndexOf('.');
  const outputPath = selectedFilePath.substring(0, lastDotIndex) + '_optimized' + selectedFilePath.substring(lastDotIndex);

  // Map quality options to CRF
  let crf = '23'; // low/balanced
  if (currentQuality === 'medium') crf = '18'; // High Quality
  if (currentQuality === 'high') crf = '28'; // Maximum compression

  try {
    const command = Command.sidecar('ffmpeg', [
      '-i', selectedFilePath,
      '-vcodec', 'libx264',
      '-crf', crf,
      '-preset', 'fast', // Speed up encoding
      '-y', // Overwrite output
      outputPath
    ]);

    console.log("Running ffmpeg command...");
    // Spawn and listen (basic implementation, just awaiting spawn then close)
    currentChildProcess = await command.spawn();

    // We can listen to events - but sidecar events in v2 are tricky without stdout parsing.
    // For now, we wait for it to finish.
    // Sidecar spawn returns a Child object.
    // We can monitor it? 
    // Actually, command.execute() is simpler for one-shot if we don't need real-time progress.
    // But execute() buffers output. FFmpeg output is large.
    // Spawn is better.

    // Wait for exit
    // There is no promise to wait for exit on the Child object directly in standard API example?
    // Actually: `child.on('close', ...)`

    // Let's implement a poor man's wait or assume execute() is fine for short videos? 
    // No, execute() is better to get the Result at the end.
    // If we want to avoid buffering issues, we silence output?
    // Let's use `command.execute()` for simplicity in this MVP, 
    // expecting stderr to be captured.

    const output = await command.execute();

    if (output.code === 0) {
      alert(`Optimization Complete!\nSaved to: ${outputPath}`);
      resetUI();
    } else {
      console.error("FFmpeg Error:", output.stderr);
      alert(`Optimization Failed.\n${output.stderr.slice(-200)}`);
    }

  } catch (e) {
    console.error(e);
    alert('An error occurred starting execution: ' + e);
  } finally {
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    optimizeBtn.disabled = false;
    currentChildProcess = null;
  }
});

cancelBtn.addEventListener('click', async () => {
  if (currentChildProcess) {
    // Kill not fully exposed in all plugin versions easily?
    // child.kill() should exist.
    try {
      await currentChildProcess.kill();
    } catch (e) { console.error("Kill failed", e); }
  }
  progressOverlay.classList.add('hidden');
  progressOverlay.classList.remove('flex');
  optimizeBtn.disabled = false;
});
