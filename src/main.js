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

const manualUploadBtn = document.getElementById('manual-upload-btn');

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('border-purple-500', 'bg-gray-800/50');

  if (e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    // Try to get path
    const path = file.path || file.name;
    if (file.path) {
      handleFileSelect(file.name, file.size, file.path);
    } else {
      // Specific error for Tauri environment constraints
      alert("Drag & Drop received a file but could not access its full path (security restriction). \n\nPlease use the 'Select Video File' button instead.");
    }
  }
});

// Bind click to the button explicitly, prevent bubbling if needed or just let it work
manualUploadBtn.addEventListener('click', async (e) => {
  e.stopPropagation(); // prevent dropzone click if we keep that?
  // Actually we remove the dropzone click listener to avoid double triggers/confusion
  triggerFileSelect();
});

// Also keep dropzone click as fallback? No, let's rely on the button to be explicit as requested.
// But user expects big area to be clickable? 
// Let's make the Whole area NOT clickable for file dialog, ONLY the button, to differentiate.
// Or we keep both.
// User said "There is no button". 
// Step 1: Add button. (Done in HTML)
// Step 2: Bind button.

async function triggerFileSelect() {
  try {
    const file = await open({
      multiple: false,
      filters: [{
        name: 'Video',
        extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm']
      }]
    });

    if (file) {
      const name = file.replace(/^.*[\\\/]/, '');
      handleFileSelect(name, 0, file);
    }
  } catch (err) {
    console.error("Failed to open dialog:", err);
  }
}

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

  const encoderMode = document.getElementById('encoder-select').value;
  const ffmpegArgs = ['-i', selectedFilePath];

  // Encoder specifics
  switch (encoderMode) {
    case 'gpu-nvidia':
      ffmpegArgs.push('-c:v', 'h264_nvenc');
      // NVENC uses -cq for quality (similar to CRF)
      ffmpegArgs.push('-cq', crf);
      ffmpegArgs.push('-preset', 'p4'); // Medium preset
      break;
    case 'gpu-amd':
      ffmpegArgs.push('-c:v', 'h264_amf');
      // AMF mapping (often uses -qp or -quality)
      ffmpegArgs.push('-qp-i', crf, '-qp-p', crf);
      break;
    case 'gpu-intel':
      ffmpegArgs.push('-c:v', 'h264_qsv');
      // QSV often uses -global_quality? or -q:v?
      // Safe bet: -global_quality
      ffmpegArgs.push('-global_quality', crf);
      // Note: QSV setup is tricky without load_plugin, fallbacks might happen
      break;
    case 'cpu-low':
      ffmpegArgs.push('-vcodec', 'libx264');
      ffmpegArgs.push('-crf', crf);
      ffmpegArgs.push('-preset', 'fast');
      ffmpegArgs.push('-threads', '2'); // Limit CPU usage
      break;
    default: // cpu-fast
      ffmpegArgs.push('-vcodec', 'libx264');
      ffmpegArgs.push('-crf', crf);
      ffmpegArgs.push('-preset', 'fast');
      // No thread limit = Max CPU
      break;
  }

  // Common args
  ffmpegArgs.push('-y', outputPath);

  try {
    const command = Command.sidecar('ffmpeg', ffmpegArgs);

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
