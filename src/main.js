import './style.css';
import { Command } from '@tauri-apps/plugin-shell';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readFile } from '@tauri-apps/plugin-fs';
import { tempDir, appCacheDir, join } from '@tauri-apps/api/path';
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

let selectedFiles = [];
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
    const paths = [];
    // Tauri specific: e.dataTransfer.files contains objects with 'path' property if configured?
    // Actually in web drag drop we might not get full path unless Tauri intercepts.
    // Assuming standard behavior where we extract names/paths if available.
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const f = e.dataTransfer.files[i];
      // In Tauri v2 drag drop, we usually get paths.
      /* 
         Note: If drop gives files with only name, we rely on user to pick via dialog. 
         But let's try to capture 'path' property if exposed (Electron/Tauri often do).
      */
      if (f.path) paths.push(f.path);
      else if (f.name) console.warn("File object missing path:", f.name);
    }

    if (paths.length > 0) {
      selectedFiles = paths;
      handleFileSelect(selectedFiles);
    } else {
      alert("Drag & Drop received files but could not access paths. Please use the Select button.");
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
    const selection = await open({
      multiple: true,
      filters: [{
        name: 'Video',
        extensions: SUPPORTED_EXTENSIONS
      }]
    });

    if (selection) {
      if (Array.isArray(selection)) selectedFiles = selection;
      else selectedFiles = [selection];

      handleFileSelect(selectedFiles);
    }
  } catch (err) {
    console.error("Failed to open dialog:", err);
  }
}

changeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUI();
});

function handleFileSelect(files) {
  if (!files || files.length === 0) return;

  dropContent.classList.add('hidden');
  filePreview.classList.remove('hidden');
  filePreview.classList.add('flex');

  if (files.length === 1) {
    const path = files[0];
    const name = path.replace(/^.*[\\\/]/, '');
    filenameEl.textContent = name;
    filesizeEl.textContent = 'Ready to encode';
  } else {
    filenameEl.textContent = `${files.length} Files Selected`;
    filesizeEl.textContent = 'Batch Mode';
  }

  optionsPanel.classList.remove('opacity-50', 'pointer-events-none');
}

function resetUI() {
  selectedFiles = [];
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
const advBackend = document.getElementById('adv-backend');

// --- Dynamic Codec Logic ---
const codecsByBackend = {
  cpu: [
    { val: 'libx264', label: 'H.264 (Standard)' },
    { val: 'libx265', label: 'H.265 (HEVC)' },
    { val: 'libaom-av1', label: 'AV1 (Next Gen)' },
    { val: 'libvpx-vp9', label: 'VP9 (Web)' },
    { val: 'prores_ks', label: 'ProRes (Editing)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  'cpu-low': [
    { val: 'libx264', label: 'H.264 (Standard)' },
    { val: 'libx265', label: 'H.265 (HEVC)' },
    { val: 'libaom-av1', label: 'AV1 (Next Gen)' },
    { val: 'libvpx-vp9', label: 'VP9 (Web)' },
    { val: 'prores_ks', label: 'ProRes (Editing)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  nvidia: [
    { val: 'h264_nvenc', label: 'H.264 (NVIDIA GPU)' },
    { val: 'hevc_nvenc', label: 'H.265 (NVIDIA GPU)' },
    { val: 'av1_nvenc', label: 'AV1 (NVIDIA RTX 40+)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  amd: [
    { val: 'h264_amf', label: 'H.264 (AMD GPU)' },
    { val: 'hevc_amf', label: 'H.265 (AMD GPU)' },
    { val: 'av1_amf', label: 'AV1 (AMD RDNA3+)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ],
  intel: [
    { val: 'h264_qsv', label: 'H.264 (Intel GPU)' },
    { val: 'hevc_qsv', label: 'H.265 (Intel GPU)' },
    { val: 'vp9_qsv', label: 'VP9 (Intel GPU)' },
    { val: 'av1_qsv', label: 'AV1 (Intel Arc)' },
    { val: 'copy', label: 'Copy (No Re-encode)' }
  ]
};

function updateAdvCodecs() {
  if (!advBackend || !advCodec) return;
  const backend = advBackend.value;
  const options = codecsByBackend[backend] || codecsByBackend.cpu;
  advCodec.innerHTML = '';
  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.val;
    el.textContent = opt.label;
    advCodec.appendChild(el);
  });
}

if (advBackend) {
  advBackend.addEventListener('change', updateAdvCodecs);
  // Init on load
  updateAdvCodecs();
}

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






/* --- Batch UI Helpers --- */
function initBatchUI(files) {
  const list = document.getElementById('progress-list');
  const statusEl = document.getElementById('batch-status-text');
  if (list) {
    list.innerHTML = '';
    files.forEach((f, i) => {
      const name = typeof f === 'object' ? f.input.split(/[\\/]/).pop() : f.split(/[\\/]/).pop();
      const row = document.createElement('div');
      row.id = `batch-item-${i}`;
      row.className = 'flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700';
      row.innerHTML = `
            <div class="flex items-center space-x-3 w-1/2 overflow-hidden">
                <span class="text-gray-500 font-mono text-xs w-6 flex-none">${i + 1}.</span>
                <span class="truncate text-sm text-gray-200" title="${name}">${name}</span>
            </div>
            <div class="flex items-center space-x-3 flex-1 justify-end">
                <span id="batch-status-${i}" class="text-xs text-gray-500 font-mono hidden md:block">Pending</span>
                <div class="w-16 md:w-24 h-2 bg-gray-700 rounded-full overflow-hidden flex-none">
                    <div id="batch-bar-${i}" class="h-full bg-purple-500 w-0 transition-all duration-300"></div>
                </div>
                <span id="batch-percent-${i}" class="text-xs font-mono text-gray-400 w-10 text-right">0%</span>
            </div>
        `;
      list.appendChild(row);
    });
  }
  if (statusEl) statusEl.textContent = "Initializing...";
}

function updateBatchUI(i, percent, status) {
  const bar = document.getElementById(`batch-bar-${i}`);
  const txt = document.getElementById(`batch-percent-${i}`);
  const stat = document.getElementById(`batch-status-${i}`);
  const row = document.getElementById(`batch-item-${i}`);

  if (bar) bar.style.width = `${percent}%`;
  if (txt) txt.textContent = `${Math.round(percent)}%`;

  if (status && stat) {
    stat.textContent = status;
    if (status === 'Done') {
      stat.className = 'text-xs text-green-400 font-bold font-mono hidden md:block';
      if (bar) bar.className = 'h-full bg-green-500 w-full transition-all duration-300';
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (status === 'Error') {
      stat.className = 'text-xs text-red-400 font-bold font-mono hidden md:block';
      if (bar) bar.className = 'h-full bg-red-500 w-full transition-all duration-300';
    } else if (status === 'Processing') {
      stat.className = 'text-xs text-purple-400 animate-pulse font-mono hidden md:block';
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

optimizeBtn.addEventListener('click', async () => {
  if (!selectedFiles || selectedFiles.length === 0) return;

  let fileQueue = [];
  const isBatch = selectedFiles.length > 1;

  // --- Determine Output Paths ---
  let defaultExt = '.mp4';
  if (isAdvancedMode && advCodec.value === 'prores_ks') defaultExt = '.mov';
  else if (isAdvancedMode && advCodec.value === 'gif') defaultExt = '.gif';

  if (!isBatch) {
    // Single Mode
    const selectedFilePath = selectedFiles[0];
    const defaultPath = selectedFilePath.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);

    const outputPath = await save({
      defaultPath: defaultPath,
      filters: [{ name: 'Video', extensions: [defaultExt.substring(1)] }]
    });
    if (!outputPath) return;
    fileQueue.push({ input: selectedFilePath, output: outputPath });
  } else {
    // Batch Mode
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Select Output Folder for Batch Processing"
    });
    if (!dir) return;

    selectedFiles.forEach(f => {
      const name = f.replace(/^.*[\\\/]/, '');
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > -1 ? name.substring(0, lastDot) : name;
      // Use standard slash for consistency
      fileQueue.push({ input: f, output: `${dir}/${base}_optimized${defaultExt}` });
    });
  }

  // --- Execution Loop ---
  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  optimizeBtn.disabled = true;
  initBatchUI(fileQueue.map(q => q.input));

  let successCount = 0;
  let errorCount = 0;
  let isCancelled = false;

  cancelBtn.onclick = () => {
    isCancelled = true;
    if (currentChildProcess) currentChildProcess.kill();
    document.getElementById('batch-status-text').textContent = "Cancelled";
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    optimizeBtn.disabled = false;
    showToast('Processing cancelled', 'info');
  };

  for (let i = 0; i < fileQueue.length; i++) {
    if (isCancelled) break;
    const { input, output } = fileQueue[i];
    const pctPrefix = isBatch ? `File ${i + 1}/${fileQueue.length}: ` : '';

    updateBatchUI(i, 0, 'Processing');
    const statusText = document.getElementById('batch-status-text');
    if (statusText) statusText.textContent = `Processing ${i + 1}/${fileQueue.length}...`;

    const ffmpegArgs = ['-i', input];

    // --- Advanced/Simple Logic ---
    if (isAdvancedMode) {
      const codec = advCodec.value;
      if (codec !== 'copy') {
        ffmpegArgs.push('-c:v', codec);

        // Hardware specific flags
        if (codec.includes('nvenc')) {
          // NVIDIA: Use -cq (Constant Quality) and -preset p1-p7
          ffmpegArgs.push('-cq', advCrf.value);
          let pVal = 'p4'; // Default Medium
          if (advPreset.value.includes('fast')) pVal = 'p2'; // Faster
          if (advPreset.value.includes('slow')) pVal = 'p6'; // Better quality
          ffmpegArgs.push('-preset', pVal);
        } else if (codec.includes('amf')) {
          // AMD: Use -qp (Quantization Parameter)
          ffmpegArgs.push('-rc', 'vbr');
          ffmpegArgs.push('-qp-i', advCrf.value);
          ffmpegArgs.push('-qp-p', advCrf.value);
          let qVal = 'balanced';
          if (advPreset.value.includes('fast')) qVal = 'speed';
          if (advPreset.value.includes('slow')) qVal = 'quality';
          ffmpegArgs.push('-quality', qVal);
        } else if (codec.includes('qsv')) {
          // Intel: Use -global_quality
          ffmpegArgs.push('-global_quality', advCrf.value);
          // QSV presets map roughly to cpu presets
          ffmpegArgs.push('-preset', advPreset.value);
        } else if (codec === 'prores_ks') {
          // ProRes: Profile 3 (HQ), ignore CRF
          ffmpegArgs.push('-profile:v', '3');
          ffmpegArgs.push('-pix_fmt', 'yuv422p10le');
        } else {
          // CPU (x264, x265, etc)
          ffmpegArgs.push('-crf', advCrf.value);
          if (advBackend.value === 'cpu-low') {
            ffmpegArgs.push('-threads', '2');
          }
          if (!codec.includes('libvpx')) {
            ffmpegArgs.push('-preset', advPreset.value);
          } else {
            // VP9 uses -cpu-used 0-5
            ffmpegArgs.push('-b:v', '0');
          }
        }
      } else {
        ffmpegArgs.push('-c:v', 'copy');
      }

      // Resolution
      if (advResolution.value === 'custom') {
        const w = advResW.value || -1;
        const h = advResH.value || -1;
        if (w != -1 || h != -1) ffmpegArgs.push('-vf', `scale=${w}:${h}`);
      } else if (advResolution.value !== 'original') {
        ffmpegArgs.push('-vf', `scale=${advResolution.value}`);
      }
      // FPS
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
        ffmpegArgs.push(...advCustom.value.trim().split(/\s+/));
      }

    } else {
      // Simple Mode
      let crf = '23';
      if (currentQuality === 'medium') crf = '18';
      if (currentQuality === 'high') crf = '28';
      const encoderMode = document.getElementById('encoder-select').value;
      switch (encoderMode) {
        case 'gpu-nvidia': ffmpegArgs.push('-c:v', 'h264_nvenc', '-cq', crf, '-preset', 'p4'); break;
        case 'gpu-amd': ffmpegArgs.push('-c:v', 'h264_amf', '-qp-i', crf, '-qp-p', crf); break;
        case 'gpu-intel': ffmpegArgs.push('-c:v', 'h264_qsv', '-global_quality', crf); break;
        case 'cpu-low': ffmpegArgs.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'medium', '-threads', '2'); break;
        default: ffmpegArgs.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'fast'); break;
      }
    }

    ffmpegArgs.push('-y', output);

    try {
      const command = Command.sidecar('ffmpeg', ffmpegArgs);
      console.log("Processing:", input, "to", output);

      // Wait for start to bind handlers? No, bind before spawn.
      let durationSec = 0;

      command.stderr.on('data', line => {
        // Duration Parse
        const durMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (durMatch) {
          durationSec = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
        }
        // Time Parse
        if (durationSec > 0) {
          const tMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
          if (tMatch) {
            const cur = parseFloat(tMatch[1]) * 3600 + parseFloat(tMatch[2]) * 60 + parseFloat(tMatch[3]);
            const pct = Math.min(100, Math.round((cur / durationSec) * 100));
            updateBatchUI(i, pct);
          }
        }
      });

      currentChildProcess = await command.spawn();

      await new Promise((resolve) => {
        command.on('close', data => {
          if (data.code === 0) { successCount++; updateBatchUI(i, 100, 'Done'); }
          else { errorCount++; updateBatchUI(i, 0, 'Error'); }
          resolve();
        });
        command.on('error', err => {
          console.error(err);
          errorCount++;
          updateBatchUI(i, 0, 'Error');
          resolve();
        });
      });
      currentChildProcess = null;

    } catch (e) {
      console.error(e);
      showToast(`Error starting file ${i + 1}: ${e}`, 'error');
      updateBatchUI(i, 0, 'Error');
      errorCount++;
    }
  }

  // Done
  if (!isCancelled) {
    const statusText = document.getElementById('batch-status-text');
    if (statusText) statusText.textContent = "Completed";

    setTimeout(() => {
      const btn = document.getElementById('cancel-btn');
      if (btn) {
        btn.textContent = "Close";
        btn.onclick = () => {
          progressOverlay.classList.add('hidden');
          progressOverlay.classList.remove('flex');
          optimizeBtn.disabled = false;
          btn.textContent = "Cancel Processing";
        };
      }

      if (successCount > 0 && errorCount === 0) {
        showToast(`Done! All ${successCount} files processed.`, 'success');
        resetUI();
      } else {
        showToast(`Finished: ${successCount} Success, ${errorCount} Failed.`, 'info');
      }
    }, 500);
  } else {
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
// Video Metadata Loaded (Duration)
trimVideoPreview.addEventListener('loadedmetadata', () => {
  const dur = trimVideoPreview.duration || 0;
  trimState.duration = dur;

  // Default: Trim first 10s or full if short
  trimState.start = 0;
  trimState.end = Math.min(dur, 10);
  if (trimState.end <= 0) trimState.end = dur;

  // Update Totals
  dispTotalStart.textContent = "00:00:00";
  dispTotalEnd.textContent = formatTime(dur);

  updateTimelineUI();

  // Generate Filmstrip
  // Filmstrip generation disabled by user request
});



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
  const ext = trimFilePath.substring(lastDot);
  const defaultPath = trimFilePath.substring(0, lastDot) + '_trimmed' + ext;
  const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: [ext.substring(1)] }] });
  if (!output) return;

  const startStr = formatTime(trimState.start, true);
  const durationStr = formatTime(trimState.end - trimState.start, true);

  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  trimActionBtn.disabled = true;
  initBatchUI([trimFilePath]); // Single item
  updateBatchUI(0, 0, 'Processing');
  const statusText = document.getElementById('batch-status-text');
  if (statusText) statusText.textContent = "Trimming Video...";

  try {
    // ffmpeg -ss START -i INPUT -t DURATION -c copy -map 0 -avoid_negative_ts make_zero OUTPUT
    const command = Command.sidecar('ffmpeg', [
      '-ss', startStr, '-i', trimFilePath, '-t', durationStr,
      '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-y', output
    ]);

    // Trimming is fast (copy), usually no need for progress bar updates from stderr unless long.
    // We'll just wait.
    const res = await command.execute();

    if (res.code === 0) {
      updateBatchUI(0, 100, 'Done');
      if (statusText) statusText.textContent = "Completed";
      showToast(`Trim Saved: ${output}`, 'success');
      setTimeout(() => {
        progressOverlay.classList.add('hidden');
        progressOverlay.classList.remove('flex');
        trimActionBtn.disabled = false;
      }, 1500);
    } else {
      updateBatchUI(0, 0, 'Error');
      showToast('Trim Failed', 'error');
      console.error(res.stderr);
      setTimeout(() => {
        progressOverlay.classList.add('hidden');
        progressOverlay.classList.remove('flex');
        trimActionBtn.disabled = false;
      }, 2000);
    }
  } catch (e) {
    updateBatchUI(0, 0, 'Error');
    showToast('Execution Error', 'error');
    console.error(e);
    trimActionBtn.disabled = false;
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
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

let converterFiles = [];

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
    const selection = await open({
      multiple: true,
      filters: [{ name: 'Media', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (selection) {
      if (Array.isArray(selection)) converterFiles = selection;
      else converterFiles = [selection];

      setupConverterFile(converterFiles);
    }
  } catch (e) {
    console.error(e);
  }
}

function setupConverterFile(files) {
  if (!files || files.length === 0) return;

  converterUploadContent.classList.add('hidden');
  converterFileInfo.classList.remove('hidden');
  converterFileInfo.classList.add('flex');
  converterControls.classList.remove('opacity-50', 'pointer-events-none');

  if (files.length === 1) {
    const name = files[0].replace(/^.*[\\\/]/, '');
    converterFilename.textContent = name;
  } else {
    converterFilename.textContent = `${files.length} Files Selected (Batch)`;
  }
}

converterDropzone.addEventListener('click', (e) => {
  if (converterFiles.length === 0) loadConverterFile();
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
  if (!converterFiles || converterFiles.length === 0) return;

  const isBatch = converterFiles.length > 1;
  const targetExt = convertFormatSelect.value;
  let fileQueue = [];

  // --- Paths ---
  if (!isBatch) {
    const converterFilePath = converterFiles[0];
    const lastDot = converterFilePath.lastIndexOf('.');
    const defaultPath = converterFilePath.substring(0, lastDot) + '_converted.' + targetExt;
    const output = await save({ defaultPath, filters: [{ name: 'Media', extensions: [targetExt] }] });
    if (!output) return;
    fileQueue.push({ input: converterFilePath, output: output });
  } else {
    const dir = await open({ directory: true, multiple: false, title: "Select Output Folder for Converted Files" });
    if (!dir) return;
    converterFiles.forEach(f => {
      const name = f.replace(/^.*[\\\/]/, '');
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > -1 ? name.substring(0, lastDot) : name;
      fileQueue.push({ input: f, output: `${dir}/${base}_converted.${targetExt}` });
    });
  }

  // --- Loop ---
  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  convertActionBtn.disabled = true;
  initBatchUI(fileQueue.map(q => q.input));

  let successCount = 0;
  let errorCount = 0;
  let isCancelled = false;
  const cancelBtn = document.getElementById('cancel-btn');

  cancelBtn.onclick = () => {
    isCancelled = true;
    if (currentChildProcess) currentChildProcess.kill();
    document.getElementById('batch-status-text').textContent = "Cancelled";
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
    convertActionBtn.disabled = false;
  };

  for (let i = 0; i < fileQueue.length; i++) {
    if (isCancelled) break;
    const { input, output } = fileQueue[i];
    updateBatchUI(i, 0, 'Processing');
    const statusText = document.getElementById('batch-status-text');
    if (statusText) statusText.textContent = `Converting ${i + 1}/${fileQueue.length}...`;

    const args = ['-i', input, '-y', output];

    try {
      const command = Command.sidecar('ffmpeg', args);
      console.log("Converting", input);

      let durationSec = 0;
      command.stderr.on('data', line => {
        const durMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (durMatch) durationSec = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);

        if (durationSec > 0) {
          const tMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
          if (tMatch) {
            const cur = parseFloat(tMatch[1]) * 3600 + parseFloat(tMatch[2]) * 60 + parseFloat(tMatch[3]);
            const pct = Math.min(100, Math.round((cur / durationSec) * 100));
            updateBatchUI(i, pct);
          }
        }
      });

      currentChildProcess = await command.spawn();

      await new Promise((resolve) => {
        command.on('close', d => {
          if (d.code === 0) { successCount++; updateBatchUI(i, 100, 'Done'); }
          else { errorCount++; updateBatchUI(i, 0, 'Error'); }
          resolve();
        });
        command.on('error', () => { errorCount++; updateBatchUI(i, 0, 'Error'); resolve(); });
      });
      currentChildProcess = null;

    } catch (e) {
      console.error(e);
      showToast(`Error on file ${i + 1}`, 'error');
      updateBatchUI(i, 0, 'Error');
      errorCount++;
    }
  }

  // Done
  if (!isCancelled) {
    const statusText = document.getElementById('batch-status-text');
    if (statusText) statusText.textContent = "Completed";

    const btn = document.getElementById('cancel-btn');
    btn.textContent = "Close";
    btn.onclick = () => {
      progressOverlay.classList.add('hidden');
      progressOverlay.classList.remove('flex');
      convertActionBtn.disabled = false;
      btn.textContent = "Cancel Processing";
    };

    if (successCount > 0 && errorCount === 0) {
      showToast(`All ${successCount} files converted!`, 'success');
    } else {
      showToast(`Done: ${successCount} Success, ${errorCount} Failed`, 'info');
    }
  } else {
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

/* --- Video Merger Logic --- */
const mergerView = document.getElementById('view-merger');
const mergerAddBtn = document.getElementById('merger-add-btn');
const mergerActionBtn = document.getElementById('merger-action-btn');
const mergerListEl = document.getElementById('merger-list');
let mergerFiles = [];

if (mergerAddBtn) {
  mergerAddBtn.addEventListener('click', async () => {
    const selection = await open({
      multiple: true,
      filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }]
    });
    if (selection) {
      const newFiles = Array.isArray(selection) ? selection : [selection];
      mergerFiles = [...mergerFiles, ...newFiles];
      renderMergerList();
    }
  });
}

function renderMergerList() {
  mergerListEl.innerHTML = '';
  if (mergerFiles.length === 0) {
    mergerListEl.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
            <svg class="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <p>Drag and drop files here to start</p>
        </div>`;
    mergerActionBtn.disabled = true;
    mergerActionBtn.classList.add('opacity-50', 'cursor-not-allowed');
    return;
  }

  mergerActionBtn.disabled = false;
  mergerActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');

  mergerFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-600';
    const name = file.split(/[\\/]/).pop();

    row.innerHTML = `
         <div class="flex items-center space-x-3 overflow-hidden">
            <span class="text-gray-400 font-mono text-xs w-6">${index + 1}.</span>
            <span class="text-white text-sm truncate w-64">${name}</span>
         </div>
         <div class="flex space-x-2">
            <button class="p-1 hover:text-purple-400" onclick="window.moveMergerItem(${index}, -1)">↑</button>
            <button class="p-1 hover:text-purple-400" onclick="window.window.moveMergerItem(${index}, 1)">↓</button>
            <button class="p-1 hover:text-red-400" onclick="window.removeMergerItem(${index})">×</button>
         </div>
       `;
    mergerListEl.appendChild(row);
  });
}

window.moveMergerItem = (index, dir) => {
  if (dir === -1 && index > 0) {
    [mergerFiles[index], mergerFiles[index - 1]] = [mergerFiles[index - 1], mergerFiles[index]];
  } else if (dir === 1 && index < mergerFiles.length - 1) {
    [mergerFiles[index], mergerFiles[index + 1]] = [mergerFiles[index + 1], mergerFiles[index]];
  }
  renderMergerList();
};
window.removeMergerItem = (index) => {
  mergerFiles.splice(index, 1);
  renderMergerList();
};

if (mergerActionBtn) {
  mergerActionBtn.addEventListener('click', async () => {
    if (mergerFiles.length < 2) {
      showToast('Select at least 2 files', 'error');
      return;
    }

    const output = await save({ filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    progressOverlay.classList.remove('hidden');
    progressOverlay.classList.add('flex');
    initBatchUI([]); // Clear list
    const statusText = document.getElementById('batch-status-text');
    if (statusText) statusText.textContent = "Merging...";

    try {
      // Generate Concat List
      // Windows requires full paths, escaped? FFmpeg concat demuxer handles standard paths usually.
      // Format: file 'path'

      const listContent = mergerFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      const tempD = await tempDir();
      const listPath = await join(tempD, 'concat_list.txt');

      await writeTextFile(listPath, listContent);

      const args = ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', output];

      const command = Command.sidecar('ffmpeg', args);
      const res = await command.execute();

      if (res.code === 0) {
        showToast(`Merged successfully!\n${output}`, 'success');
        mergerFiles = [];
        renderMergerList();
      } else {
        showToast('Merge Failed. Codecs must match.', 'error');
        console.error(res.stderr);
      }

    } catch (e) {
      console.error(e);
      showToast('Merge Error', 'error');
    } finally {
      progressOverlay.classList.add('hidden');
      progressOverlay.classList.remove('flex');
    }
  });
}

/* --- Audio Tools Logic --- */
const audioDropzone = document.getElementById('audio-dropzone');
const btnExtract = document.getElementById('btn-extract-mp3');
const btnMute = document.getElementById('btn-mute-audio');
const btnNormalize = document.getElementById('btn-normalize-audio');
let audioFile = null;

if (audioDropzone) {
  audioDropzone.addEventListener('click', async () => {
    const file = await open({ filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }] });
    if (file) {
      audioFile = file;
      updateAudioUI();
    }
  });
}

function updateAudioUI() {
  if (audioFile) {
    document.getElementById('audio-file-content').classList.add('hidden');
    document.getElementById('audio-file-info').classList.remove('hidden');
    document.getElementById('audio-file-info').classList.add('flex');
    document.getElementById('audio-filename').textContent = audioFile.split(/[\\/]/).pop();
    document.getElementById('audio-actions').classList.remove('opacity-50', 'pointer-events-none');
  }
}

// Extract
if (btnExtract) {
  btnExtract.addEventListener('click', async () => {
    if (!audioFile) return;
    const output = await save({ defaultPath: audioFile.replace(/\.[^.]+$/, '.mp3'), filters: [{ name: 'Audio', extensions: ['mp3'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', output]);
  });
}
// Mute
if (btnMute) {
  btnMute.addEventListener('click', async () => {
    if (!audioFile) return;
    const output = await save({ defaultPath: audioFile.replace(/\.[^.]+$/, '_muted.mp4'), filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-c:v', 'copy', '-an', '-y', output]);
  });
}
// Normalize
if (btnNormalize) {
  btnNormalize.addEventListener('click', async () => {
    if (!audioFile) return;
    const output = await save({ defaultPath: audioFile.replace(/\.[^.]+$/, '_norm.mp4'), filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    // Loudnorm filter
    runAudioCommand(['-i', audioFile, '-af', 'loudnorm', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-y', output]);
  });
}

async function runAudioCommand(args) {
  progressOverlay.classList.remove('hidden');
  progressOverlay.classList.add('flex');
  initBatchUI([]); // Clear list
  const statusText = document.getElementById('batch-status-text');
  if (statusText) statusText.textContent = "Processing Audio...";

  try {
    const cmd = Command.sidecar('ffmpeg', args);
    const res = await cmd.execute();
    if (res.code === 0) showToast('Success!', 'success');
    else showToast('Failed', 'error');
  } catch (e) {
    console.error(e);
    showToast('Error', 'error');
  } finally {
    progressOverlay.classList.add('hidden');
    progressOverlay.classList.remove('flex');
  }
}

/* --- Inspector Logic --- */
const inspectorDropzone = document.getElementById('inspector-dropzone');
if (inspectorDropzone) {
  inspectorDropzone.addEventListener('click', async () => {
    const file = await open({ filters: [{ name: 'Video', extensions: SUPPORTED_EXTENSIONS }] });
    if (file) inspectFile(file);
  });
  // Add drag drop later if needed
}

async function inspectFile(path) {
  document.getElementById('inspector-results').classList.remove('hidden');
  document.getElementById('meta-raw').textContent = "Loading...";

  try {
    const cmd = Command.sidecar('ffmpeg', ['-i', path, '-hide_banner']);
    const res = await cmd.execute(); // FFmpeg returns 1 on "no output file" but prints stderr

    // Output is in output (which is stdout+stderr?) or stderr?
    // Command.sidecar output structure: { code, stdout, stderr }
    const output = res.stderr;
    document.getElementById('meta-raw').textContent = output;

    // Parse basic info
    const durMatch = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d+)/);
    const bitMatch = output.match(/bitrate: (\d+ kb\/s)/);
    const streamMatch = output.match(/Stream #0:0.*: Video: (.*)/); // simplistic

    if (durMatch) document.getElementById('meta-duration').textContent = durMatch[1];
    if (bitMatch) document.getElementById('meta-bitrate').textContent = bitMatch[1];
    if (streamMatch) {
      const details = streamMatch[1].split(',');
      if (details[0]) document.getElementById('meta-container').textContent = details[0]; // codec
      // Size usually in stream details too "1920x1080"
      const resMatch = streamMatch[1].match(/(\d{3,5}x\d{3,5})/);
      if (resMatch) document.getElementById('meta-size').textContent = resMatch[1];
    }

  } catch (e) {
    console.error(e);
  }
}

initTheme();
loadSettings();
