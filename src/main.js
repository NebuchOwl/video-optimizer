import './style.css';
import { Command } from '@tauri-apps/plugin-shell';
import { open, save } from '@tauri-apps/plugin-dialog';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

const SUPPORTED_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v',
  '3gp', '3g2', 'gif', 'apng', 'webp', 'avif',
  'braw', 'r3d', 'dng', 'mxf',
  'm3u8', 'ts', 'mpd', 'm2ts', 'mts', 'vob'
];


// --- Toast Notification System ---
const toastContainer = document.getElementById('toast-container');

window.showToast = function (message, type = 'info') {
  // Ensure container exists if called early
  if (!toastContainer) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-gray-800 border-l-4 border-green-500 text-green-100',
    error: 'bg-gray-800 border-l-4 border-red-500 text-red-100',
    info: 'bg-gray-800 border-l-4 border-blue-500 text-blue-100'
  };

  toast.className = `${colors[type] || colors.info} p-4 rounded shadow-lg flex items-center transform transition-all duration-300 opacity-0 translate-x-10 pointer-events-auto min-w-[300px] z-50 mb-3`;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex-1 font-medium whitespace-pre-wrap'; // Preserve newlines
  msgDiv.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ml-4 text-gray-400 hover:text-white font-bold';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => toast.remove();

  toast.appendChild(msgDiv);
  toast.appendChild(closeBtn);

  toastContainer.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-x-10');
  });

  // Auto Dismiss
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-10');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Override default alert
window.alert = (msg) => window.showToast(msg, 'info');

// --- Global Drag Prevention ---
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
});

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
        extensions: SUPPORTED_EXTENSIONS
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

// --- Advanced Controls Init ---
const modeSimpleBtn = document.getElementById('mode-simple-btn');
const modeAdvancedBtn = document.getElementById('mode-advanced-btn');
const panelSimple = document.getElementById('panel-simple');
const panelAdvanced = document.getElementById('panel-advanced');
const advCodec = document.getElementById('adv-codec');
const advPreset = document.getElementById('adv-preset');
const advCrf = document.getElementById('adv-crf');
const advCrfVal = document.getElementById('adv-crf-val');
const advResolution = document.getElementById('adv-resolution');
const advAudio = document.getElementById('adv-audio');
const advCustom = document.getElementById('adv-custom');
const advResCustom = document.getElementById('adv-res-custom');
const advResW = document.getElementById('adv-res-w');
const advResH = document.getElementById('adv-res-h');
const advFps = document.getElementById('adv-fps');
const advFpsCustom = document.getElementById('adv-fps-custom');

let isAdvancedMode = false;

if (modeSimpleBtn && modeAdvancedBtn) {
  modeSimpleBtn.addEventListener('click', () => setOptimizerMode(false));
  modeAdvancedBtn.addEventListener('click', () => setOptimizerMode(true));
}

function setOptimizerMode(advanced) {
  isAdvancedMode = advanced;
  if (advanced) {
    modeSimpleBtn.classList.replace('bg-gray-700', 'text-gray-400');
    modeSimpleBtn.classList.remove('text-white', 'shadow');
    modeSimpleBtn.classList.add('bg-gray-800');

    modeAdvancedBtn.classList.replace('text-gray-400', 'bg-gray-700');
    modeAdvancedBtn.classList.add('text-white', 'shadow');
    modeAdvancedBtn.classList.remove('bg-gray-800');

    panelSimple.classList.add('hidden');
    panelAdvanced.classList.remove('hidden');
  } else {
    modeAdvancedBtn.classList.replace('bg-gray-700', 'text-gray-400');
    modeAdvancedBtn.classList.remove('text-white', 'shadow');
    modeAdvancedBtn.classList.add('bg-gray-800');

    modeSimpleBtn.classList.replace('text-gray-400', 'bg-gray-700');
    modeSimpleBtn.classList.add('text-white', 'shadow');
    modeSimpleBtn.classList.remove('bg-gray-800');

    panelAdvanced.classList.add('hidden');
    panelSimple.classList.remove('hidden');
  }
}

if (advCrf) {
  advCrf.addEventListener('input', (e) => {
    advCrfVal.textContent = e.target.value;
  });
}

if (advResolution) {
  advResolution.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      advResCustom.classList.remove('hidden');
    } else {
      advResCustom.classList.add('hidden');
    }
  });
}

if (advFps) {
  advFps.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      advFpsCustom.classList.remove('hidden');
    } else {
      advFpsCustom.classList.add('hidden');
    }
  });
}

// Option Buttons (Simple Mode)
const optionBtns = document.querySelectorAll('.option-btn');
let currentQuality = 'low';

optionBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
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

// Init Default quality (Set visual state)
const defaultBtn = document.querySelector(`.option-btn[data-quality="${currentQuality}"]`) || optionBtns[0];
if (defaultBtn) {
  defaultBtn.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
  defaultBtn.classList.remove('bg-gray-800');
}





optimizeBtn.addEventListener('click', async () => {
  if (!selectedFilePath) return;

  // 1. Get Save Path
  let defaultExt = '.mp4';
  if (isAdvancedMode && advCodec.value === 'prores_ks') defaultExt = '.mov';
  else if (isAdvancedMode && advCodec.value === 'gif') defaultExt = '.gif';

  const defaultPath = selectedFilePath.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);

  const outputPath = await save({
    defaultPath: defaultPath,
    filters: [{ name: 'Video', extensions: [defaultExt.substring(1)] }]
  });

  if (!outputPath) return; // User Cancelled

  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  optimizeBtn.disabled = true;
  document.getElementById('progress-text').textContent = "0%";
  document.getElementById('progress-bar').style.width = "0%";

  const ffmpegArgs = ['-i', selectedFilePath];

  if (isAdvancedMode) {
    // ADVANCED LOGIC
    const codec = advCodec.value;

    if (codec !== 'copy') {
      ffmpegArgs.push('-c:v', codec);
      ffmpegArgs.push('-crf', advCrf.value);
      ffmpegArgs.push('-preset', advPreset.value);
    } else {
      ffmpegArgs.push('-c:v', 'copy');
    }

    // Resolution
    if (advResolution.value === 'custom') {
      const w = advResW.value || -1;
      const h = advResH.value || -1;
      if (w != -1 || h != -1) {
        ffmpegArgs.push('-vf', `scale=${w}:${h}`);
      }
    } else if (advResolution.value !== 'original') {
      ffmpegArgs.push('-vf', `scale=${advResolution.value}`);
    }

    // Frame Rate
    if (advFps.value === 'custom') {
      if (advFpsCustom.value) ffmpegArgs.push('-r', advFpsCustom.value);
    } else if (advFps.value !== 'original') {
      ffmpegArgs.push('-r', advFps.value);
    }

    // Audio
    if (advAudio.value === 'none') {
      ffmpegArgs.push('-an');
    } else if (advAudio.value !== 'copy') {
      ffmpegArgs.push('-c:a', advAudio.value);
    } else {
      ffmpegArgs.push('-c:a', 'copy');
    }

    // Custom
    if (advCustom.value.trim()) {
      const flags = advCustom.value.trim().split(/\s+/);
      ffmpegArgs.push(...flags);
    }

  } else {
    // SIMPLE LOGIC
    let crf = '23';
    if (currentQuality === 'medium') crf = '18';
    if (currentQuality === 'high') crf = '28';

    const encoderMode = document.getElementById('encoder-select').value;

    switch (encoderMode) {
      case 'gpu-nvidia':
        ffmpegArgs.push('-c:v', 'h264_nvenc', '-cq', crf, '-preset', 'p4');
        break;
      case 'gpu-amd':
        ffmpegArgs.push('-c:v', 'h264_amf', '-qp-i', crf, '-qp-p', crf);
        break;
      case 'gpu-intel':
        ffmpegArgs.push('-c:v', 'h264_qsv', '-global_quality', crf);
        break;
      case 'cpu-low':
        ffmpegArgs.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'medium', '-threads', '2');
        break;
      default: // cpu-fast
        ffmpegArgs.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'fast');
        break;
    }
  }

  ffmpegArgs.push('-y', outputPath);

  try {
    const command = Command.sidecar('ffmpeg', ffmpegArgs);
    console.log("FFmpeg Command:", ffmpegArgs.join(' '));

    // Get output for progress
    command.on('close', data => {
      progressOverlay.classList.add('hidden');
      progressOverlay.classList.remove('flex');
      optimizeBtn.disabled = false;
      currentChildProcess = null;
      if (data.code === 0) {
        showToast(`Optimization Complete!\nSaved to: ${outputPath}`, 'success');
        resetUI();
      } else {
        showToast('Optimization Failed', 'error');
      }
    });

    command.on('error', error => {
      console.error("Spawn Error:", error);
      progressOverlay.classList.add('hidden');
      progressOverlay.classList.remove('flex');
      optimizeBtn.disabled = false;
      showToast(`Process Error: ${error}`, 'error');
    });

    // Progress Parsing
    const videoElement = document.getElementById('video-player');
    let duration = 1;
    if (videoElement && videoElement.duration && !isNaN(videoElement.duration)) {
      duration = videoElement.duration;
    }

    command.stderr.on('data', line => {
      // Parse "time=HH:MM:SS.mm"
      const tMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (tMatch) {
        const h = parseFloat(tMatch[1]);
        const m = parseFloat(tMatch[2]);
        const s = parseFloat(tMatch[3]);
        const currentSeconds = h * 3600 + m * 60 + s;
        const pct = Math.min(100, Math.round((currentSeconds / duration) * 100));
        document.getElementById('progress-text').textContent = pct + "%";
        document.getElementById('progress-bar').style.width = pct + "%";
      }
    });

    currentChildProcess = await command.spawn();

  } catch (e) {
    console.error(e);
    alert('Execution Error: ' + e);
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    optimizeBtn.disabled = false;
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

// Navigation Logic
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;

    // Update Buttons
    navBtns.forEach(b => {
      b.classList.remove('bg-purple-600/20', 'text-purple-300', 'border', 'border-purple-500/30');
      b.classList.add('text-gray-400', 'hover:bg-gray-700', 'hover:text-white');
    });
    btn.classList.remove('text-gray-400', 'hover:bg-gray-700', 'hover:text-white');
    btn.classList.add('bg-purple-600/20', 'text-purple-300', 'border', 'border-purple-500/30');

    // Update Views
    viewSections.forEach(section => {
      if (section.id === targetId) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });
  });
});

// --- Trimmer Logic ---
const trimDropzone = document.getElementById('trim-dropzone');
const trimUploadContent = document.getElementById('trim-upload-content');
const videoContainer = document.getElementById('video-container');
const trimVideoPreview = document.getElementById('trim-video-preview');
const trimChangeFile = document.getElementById('trim-change-file');
const trimControls = document.getElementById('trim-controls');
const trimStartInput = document.getElementById('trim-start');
const trimEndInput = document.getElementById('trim-end');
const setStartBtn = document.getElementById('set-start-btn');
const setEndBtn = document.getElementById('set-end-btn');
// --- Trimmer Elements ---
const trimActionBtn = document.getElementById('trim-action-btn');
const openExternalBtn = document.getElementById('open-external-btn');
const timelineTrack = document.getElementById('timeline-track');
const handleStart = document.getElementById('handle-start');
const handleEnd = document.getElementById('handle-end');
const rangeBar = document.getElementById('timeline-range-bar');
const dispStart = document.getElementById('timeline-start-display');
const dispEnd = document.getElementById('timeline-end-display');
const dispTotalStart = document.getElementById('timeline-total-start');
const dispTotalEnd = document.getElementById('timeline-total-end');

let trimFilePath = null;
let trimState = {
  duration: 0,
  start: 0,
  end: 0,
  isDraggingStart: false,
  isDraggingEnd: false
};

// Helper: Format seconds to HH:MM:SS (or HH:MM:SS.mmm)
function formatTime(seconds, highPrecision = false) {
  if (!seconds && seconds !== 0) return "00:00:00";
  const date = new Date(0);
  date.setSeconds(seconds); // Handles float seconds (ms) partially? No, setSeconds is integer.

  // Custom format to ensure MS precision
  const iso = new Date(seconds * 1000).toISOString();
  // ISO: 1970-01-01T00:00:00.000Z
  if (highPrecision) {
    return iso.substr(11, 12); // HH:MM:SS.mmm
  }
  return iso.substr(11, 8); // HH:MM:SS
}

// Update Timeline Visuals based on State
function updateTimelineUI() {
  const { duration, start, end } = trimState;
  if (duration === 0) return;

  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;

  // Handles
  handleStart.style.left = `${startPercent}%`;
  handleEnd.style.left = `${endPercent}%`;

  // Range Bar
  rangeBar.style.left = `${startPercent}%`;
  rangeBar.style.width = `${endPercent - startPercent}%`;

  // Visual Text (Clean)
  dispStart.textContent = formatTime(start);
  dispEnd.textContent = formatTime(end);
}

// Drag Logic with Mouse Events
function getSecondsFromEvent(e) {
  const rect = timelineTrack.getBoundingClientRect();
  let x = e.clientX - rect.left;
  // Clamp
  if (x < 0) x = 0;
  if (x > rect.width) x = rect.width;

  const percent = x / rect.width;
  return percent * trimState.duration;
}

// Mouse Down Handlers
handleStart.addEventListener('mousedown', (e) => {
  trimState.isDraggingStart = true;
  e.stopPropagation();
});

handleEnd.addEventListener('mousedown', (e) => {
  trimState.isDraggingEnd = true;
  e.stopPropagation();
});

// Global Mouse Move/Up
document.addEventListener('mousemove', (e) => {
  if (!trimState.isDraggingStart && !trimState.isDraggingEnd) return;

  const sec = getSecondsFromEvent(e);

  if (trimState.isDraggingStart) {
    // Clamp: start < end
    let newStart = sec;
    if (newStart >= trimState.end) newStart = trimState.end - 0.1;
    if (newStart < 0) newStart = 0;

    trimState.start = newStart;
    trimVideoPreview.currentTime = newStart; // Seek
  }
  else if (trimState.isDraggingEnd) {
    // Clamp: end > start
    let newEnd = sec;
    if (newEnd <= trimState.start) newEnd = trimState.start + 0.1;
    if (newEnd > trimState.duration) newEnd = trimState.duration;

    trimState.end = newEnd;
    trimVideoPreview.currentTime = newEnd;
  }

  updateTimelineUI();
});

document.addEventListener('mouseup', () => {
  trimState.isDraggingStart = false;
  trimState.isDraggingEnd = false;
});

// Video Metadata Loaded (Duration)
trimVideoPreview.onloadedmetadata = () => {
  trimState.duration = trimVideoPreview.duration || 0;

  // Default: Trim first 10s or full if short
  trimState.start = 0;
  trimState.end = Math.min(trimState.duration, 10);
  if (trimState.end <= 0) trimState.end = trimState.duration;

  // Update Totals
  dispTotalStart.textContent = "00:00:00";
  dispTotalEnd.textContent = formatTime(trimState.duration);

  updateTimelineUI();
};

async function loadTrimVideo() {
  try {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (file) {
      trimFilePath = file;

      // Use Local Streaming Server (Axum) for reliable playback
      const port = 18493;
      const assetUrl = `http://localhost:${port}/stream?file=${encodeURIComponent(file)}`;

      console.log("Loading Stream:", assetUrl);

      trimVideoPreview.src = assetUrl;

      trimUploadContent.classList.add('hidden');
      videoContainer.classList.remove('hidden');
      trimControls.classList.remove('opacity-50', 'pointer-events-none');

      // Reset State
      trimState.start = 0;
      trimState.end = 10;
      updateTimelineUI();

      openExternalBtn.classList.remove('hidden');
    }
  } catch (e) {
    console.error(e);
  }
}

trimVideoPreview.onerror = (e) => {
  console.error("Video Load Error", e);
  openExternalBtn.classList.remove('hidden');
};

openExternalBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (trimFilePath) {
    try {
      await invoke('open_file_in_system', { path: trimFilePath });
    } catch (err) {
      alert("Failed to open system player: " + err);
    }
  }
});

trimDropzone.addEventListener('click', (e) => {
  if (!trimFilePath) loadTrimVideo();
});

trimChangeFile.addEventListener('click', (e) => {
  e.stopPropagation();
  loadTrimVideo();
});

trimActionBtn.addEventListener('click', async () => {
  if (!trimFilePath) return;

  const lastDot = trimFilePath.lastIndexOf('.');
  const output = trimFilePath.substring(0, lastDot) + '_trimmed' + trimFilePath.substring(lastDot);

  // Precision Calculation
  const start = trimState.start;
  const duration = trimState.end - trimState.start;

  const startStr = formatTime(start, true);
  const durationStr = formatTime(duration, true);

  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  trimActionBtn.disabled = true;

  try {
    // Robust Command:
    // ffmpeg -ss START -i INPUT -t DURATION -c copy -map 0 -avoid_negative_ts make_zero OUTPUT
    const command = Command.sidecar('ffmpeg', [
      '-ss', startStr,
      '-i', trimFilePath,
      '-t', durationStr,
      '-c', 'copy',
      '-map', '0',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      output
    ]);

    const res = await command.execute();

    if (res.code === 0) {
      alert(`Trim Successful!\nSaved to: ${output}`);
    } else {
      alert(`Trim Failed: ${res.stderr}`);
    }
  } catch (e) {
    alert(e);
  } finally {
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    trimActionBtn.disabled = false;
  }
});

// --- Converter Logic ---
const converterDropzone = document.getElementById('converter-dropzone');
const converterFileInput = document.getElementById('converter-file-input');
const converterSelectBtn = document.getElementById('converter-select-btn');
const converterUploadContent = document.getElementById('converter-upload-content');
const converterFileInfo = document.getElementById('converter-file-info');
const converterFilename = document.getElementById('converter-filename');
const converterChangeBtn = document.getElementById('converter-change-btn');
const converterControls = document.getElementById('converter-controls');
const convertFormatSelect = document.getElementById('convert-format-select');
const convertActionBtn = document.getElementById('convert-action-btn');

let converterFilePath = null;

// Populate Formats
const EXT_TO_LABEL = {
  'mp4': 'MP4 (H.264/AAC)',
  'mkv': 'MKV (Matroska)',
  'mov': 'MOV (QuickTime)',
  'avi': 'AVI',
  'webm': 'WebM (VP9/Opus)',
  'gif': 'GIF (Animated)',
  'mp3': 'MP3 (Audio Only)',
  'wav': 'WAV (Audio Only)',
  'flv': 'FLV',
  'wmv': 'WMV'
};
const CONVERT_TARGETS = Object.keys(EXT_TO_LABEL);

CONVERT_TARGETS.forEach(ext => {
  const opt = document.createElement('option');
  opt.value = ext;
  opt.textContent = EXT_TO_LABEL[ext];
  convertFormatSelect.appendChild(opt);
});

async function loadConverterFile() {
  try {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Media', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (file) {
      setupConverterFile(file);
    }
  } catch (e) {
    console.error(e);
  }
}

function setupConverterFile(path) {
  converterFilePath = path;
  const name = path.replace(/^.*[\\\/]/, '');
  converterFilename.textContent = name;

  // UI State
  converterUploadContent.classList.add('hidden');
  converterFileInfo.classList.remove('hidden');
  converterFileInfo.classList.add('flex');
  converterControls.classList.remove('opacity-50', 'pointer-events-none');
}

converterDropzone.addEventListener('click', (e) => {
  if (!converterFilePath) loadConverterFile();
});

converterSelectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  loadConverterFile();
});

converterChangeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  loadConverterFile();
});

convertActionBtn.addEventListener('click', async () => {
  if (!converterFilePath) return;

  const targetExt = convertFormatSelect.value;
  const lastDot = converterFilePath.lastIndexOf('.');
  const output = converterFilePath.substring(0, lastDot) + '_converted.' + targetExt;

  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  convertActionBtn.disabled = true;

  try {
    // Build FFmpeg args
    // Default: ffmpeg -i input -y output
    const args = ['-i', converterFilePath];

    args.push('-y', output);

    const command = Command.sidecar('ffmpeg', args);
    const res = await command.execute();

    if (res.code === 0) {
      alert(`Conversion Successful!\nSaved to: ${output}`);
    } else {
      alert(`Conversion Failed: ${res.stderr}`);
    }
  } catch (e) {
    alert(e);
  } finally {
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    convertActionBtn.disabled = false;
  }
});

// --- Settings Logic ---
const settingDefaultQuality = document.getElementById('setting-default-quality');
const settingDefaultFormat = document.getElementById('setting-default-format');

function loadSettings() {
  // Quality
  const savedQuality = localStorage.getItem('defaultQuality') || 'medium';
  if (settingDefaultQuality) {
    settingDefaultQuality.value = savedQuality;
    // Update Optimizer default (currentQuality is global)
    currentQuality = savedQuality;
    // Update UI for option buttons
    if (typeof optionBtns !== 'undefined') {
      optionBtns.forEach(b => {
        b.classList.remove('ring-2', 'ring-purple-500', 'bg-gray-700');
        b.classList.add('bg-gray-800');
        if (b.dataset.quality === savedQuality) {
          b.classList.remove('bg-gray-800');
          b.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
        }
      });
    }
  }

  // Format
  const savedFormat = localStorage.getItem('defaultFormat') || 'mp4';
  if (settingDefaultFormat) {
    settingDefaultFormat.value = savedFormat;
    if (convertFormatSelect) convertFormatSelect.value = savedFormat;
  }
}

// Listeners
if (settingDefaultQuality) {
  settingDefaultQuality.addEventListener('change', (e) => {
    localStorage.setItem('defaultQuality', e.target.value);
    // Apply immediately
    currentQuality = e.target.value;
    showToast('Default quality saved', 'success');
    // Update UI
    if (typeof optionBtns !== 'undefined') {
      optionBtns.forEach(b => {
        b.classList.remove('ring-2', 'ring-purple-500', 'bg-gray-700');
        b.classList.add('bg-gray-800');
        if (b.dataset.quality === currentQuality) {
          b.classList.remove('bg-gray-800');
          b.classList.add('ring-2', 'ring-purple-500', 'bg-gray-700');
        }
      });
    }
  });
}

if (settingDefaultFormat) {
  settingDefaultFormat.addEventListener('change', (e) => {
    localStorage.setItem('defaultFormat', e.target.value);
    if (convertFormatSelect) convertFormatSelect.value = e.target.value;
    showToast('Default format saved', 'success');
  });
}

// Initialize Settings on Load
/* Theme Logic */
const themeBtns = document.querySelectorAll('.theme-btn');
const body = document.body;

function initTheme() {
  const savedTheme = localStorage.getItem('app-theme') || '';
  // Clear potentially conflicting classes if switching from non-JS state
  body.classList.remove('theme-light', 'theme-midnight', 'theme-sunset');

  if (savedTheme) {
    body.classList.add(savedTheme);
  }
  highlightActiveTheme(savedTheme);
}

function highlightActiveTheme(theme) {
  if (!themeBtns) return;
  themeBtns.forEach(btn => {
    // Reset rings
    btn.classList.remove('ring-2', 'ring-purple-500', 'ring-blue-500', 'ring-pink-500', 'ring-offset-2', 'ring-offset-black');

    if (btn.dataset.theme === theme) {
      let ringColor = 'ring-purple-500';
      if (theme === 'theme-midnight') ringColor = 'ring-blue-500';
      if (theme === 'theme-sunset') ringColor = 'ring-pink-500';

      // offset-black matches standard dark bg, might look slightly off in light mode but acceptable ring style
      btn.classList.add('ring-2', ringColor, 'ring-offset-2');
    }
  });
}

if (themeBtns) {
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;

      // Remove all known themes
      body.classList.remove('theme-light', 'theme-midnight', 'theme-sunset');

      // Add new
      if (theme) body.classList.add(theme);

      localStorage.setItem('app-theme', theme);
      highlightActiveTheme(theme);

      // Optional: Provide feedback
      // showToast('Theme Updated', 'success');
    });
  });
}

initTheme();
loadSettings();
