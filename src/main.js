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

// Global Settings Init (Hoisted to top)
let appSettings = {
  theme: 'theme-cosmic',
  notifications: true,
  outputDir: null
};


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

let selectedFiles = [];
let currentChildProcess = null; // Still useful for tracking if we want to kill globally?
// But processManager handles it now. I'll leave it as null.

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

// --- Logger System ---
const Logger = {
  logs: [],
  MAX_LOGS: 50, // Keep last 50 logs

  init() {
    const saved = localStorage.getItem('appLogs');
    if (saved) {
      try {
        this.logs = JSON.parse(saved);
      } catch (e) { console.error("Log parse error", e); }
    }
  },

  log(details) {
    const entry = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      ...details
    };

    this.logs.unshift(entry); // Add to top
    if (this.logs.length > this.MAX_LOGS) this.logs.pop(); // Cap size

    this.save();
    this.render();
  },

  save() {
    localStorage.setItem('appLogs', JSON.stringify(this.logs));
  },

  clear() {
    this.logs = [];
    this.save();
    this.render();
  },

  render() {
    const container = document.getElementById('logs-container');
    if (!container) return; // Might be hidden/not ready

    if (this.logs.length === 0) {
      container.innerHTML = '<div class="text-gray-600 italic">No logs recorded yet...</div>';
      return;
    }

    container.innerHTML = this.logs.map(log => {
      let colorClass = 'text-gray-300';
      if (log.type === 'error') colorClass = 'text-red-400 font-bold';
      if (log.type === 'success') colorClass = 'text-green-400';
      if (log.type === 'info') colorClass = 'text-blue-300';

      return `<div class="border-b border-gray-800 pb-1 mb-1 font-mono text-xs break-all">
         <span class="text-gray-600">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
         <span class="${colorClass}">${log.message}</span>
         ${log.details ? `<div class="text-gray-500 pl-4 mt-1 bg-black/20 p-1 rounded">${log.details}</div>` : ''}
      </div>`;
    }).join('');
  }
};

// --- Process Manager (Queue) ---
const processManager = {
  queue: [],
  history: [],
  isProcessing: false,
  viewMode: 'active', // 'active' | 'history'

  init() {
    this.load();
    Logger.init();
  },

  setView(mode) {
    this.viewMode = mode;
    this.updateUI();

    const btnActive = document.getElementById('queue-view-active');
    const btnHistory = document.getElementById('queue-view-history');

    if (mode === 'active') {
      if (btnActive) { btnActive.classList.remove('bg-gray-700', 'text-gray-400'); btnActive.classList.add('bg-purple-600', 'text-white'); }
      if (btnHistory) { btnHistory.classList.remove('bg-purple-600', 'text-white'); btnHistory.classList.add('bg-gray-700', 'text-gray-400'); }
    } else {
      if (btnHistory) { btnHistory.classList.remove('bg-gray-700', 'text-gray-400'); btnHistory.classList.add('bg-purple-600', 'text-white'); }
      if (btnActive) { btnActive.classList.remove('bg-purple-600', 'text-white'); btnActive.classList.add('bg-gray-700', 'text-gray-400'); }
    }
  },

  viewLogs(id) {
    const job = this.queue.find(j => j.id === id) || this.history.find(j => j.id === id);
    if (!job) return;

    const modal = document.getElementById('modal-logs');
    const modalId = document.getElementById('modal-logs-id');
    const modalTitle = document.getElementById('modal-logs-title');
    const modalContent = document.getElementById('modal-logs-content');

    if (modal && modalContent) {
      modalId.textContent = `ID: ${job.id.substr(0, 8)}`;
      modalTitle.textContent = `${job.name} Logs`;
      modalContent.textContent = (job.logs && job.logs.length > 0) ? job.logs.join('\n') : "No detailed logs available.";
      modal.classList.remove('hidden');
      // Auto scroll to bottom
      modalContent.scrollTop = modalContent.scrollHeight;
    }
    this.currentLogJobId = id;
  },

  copyLogs() {
    const modalContent = document.getElementById('modal-logs-content');
    if (modalContent) {
      navigator.clipboard.writeText(modalContent.textContent).then(() => {
        showToast('Logs copied to clipboard', 'success');
      });
    }
  },



  save() {
    const cleanQueue = this.queue.map(j => {
      // eslint-disable-next-line no-unused-vars
      const { child, ...rest } = j;
      return rest;
    });
    localStorage.setItem('processQueue', JSON.stringify(cleanQueue));
    localStorage.setItem('processHistory', JSON.stringify(this.history));
  },

  load() {
    const data = localStorage.getItem('processQueue');
    const hist = localStorage.getItem('processHistory');
    if (hist) {
      try { this.history = JSON.parse(hist); } catch (e) { console.error(e); }
    }
    if (data) {
      try {
        this.queue = JSON.parse(data).map(j => {
          if (j.status === 'processing' || j.status === 'pending') {
            j.status = 'failed';
            j.info = 'Interrupted (Restarted)';
          }
          return j;
        });
        this.updateUI();
      } catch (e) {
        console.error("Failed to load queue", e);
      }
    }
  },

  addJob(jobConfig) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const job = {
      id,
      status: 'pending',
      progress: 0,
      info: 'Waiting...',
      logs: [],
      ...jobConfig
    };
    this.queue.push(job);
    this.save();
    this.updateUI();
    this.processNext();
    showToast(`Queued: ${job.name}`, 'info');
    Logger.log({ type: 'info', message: `Job Queued: ${job.name} (${job.type})` });
  },

  retryJob(id) {
    const job = this.queue.find(j => j.id === id);
    if (!job) return;

    // Clone job but reset status/id
    const newJob = {
      ...job,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      status: 'pending',
      progress: 0,
      info: 'Queued (Retry)',
      logs: [],
      child: undefined
    };

    this.queue.push(newJob);
    this.save();
    this.updateUI();
    this.processNext();
    showToast(`Retrying: ${job.name}`, 'info');
    Logger.log({ type: 'info', message: `Job Retried: ${job.name}` });
  },

  clearCompleted() {
    const activeStatues = ['pending', 'processing'];
    const completed = this.queue.filter(j => !activeStatues.includes(j.status));

    // Move to history
    completed.forEach(j => {
      j.completedAt = new Date().toISOString();
      this.history.unshift(j);
    });

    // Cap history size
    if (this.history.length > 50) this.history = this.history.slice(0, 50);

    this.queue = this.queue.filter(j => activeStatues.includes(j.status));
    this.save();
    this.updateUI();
    showToast(`${completed.length} tasks moved to History`, 'info');
  },

  cancelJob(id) {
    const job = this.queue.find(j => j.id === id);
    if (!job) return;

    if (job.status === 'processing' && job.child) {
      job.status = 'cancelled';
      job.info = 'Cancelled';
      job.child.kill().catch(e => console.error(e));
      this.isProcessing = false;
      this.save();
      this.updateUI();
      document.dispatchEvent(new Event('queue-updated')); // Signal
      Logger.log({ type: 'error', message: `Job Cancelled: ${job.name}`, details: 'User terminated process.' });
      this.processNext();
    } else {
      // If it was already done/failed, move to history instead of just deleting?
      if (['done', 'failed', 'cancelled'].includes(job.status)) {
        job.completedAt = new Date().toISOString();
        this.history.unshift(job);
        if (this.history.length > 50) this.history = this.history.slice(0, 50);
        this.save(); // Save history
      }

      this.queue = this.queue.filter(j => j.id !== id);
      this.save();
      this.updateUI();
      Logger.log({ type: 'info', message: `Job Removed/Archived: ${job.name}` });
    }
  },

  async processNext() {
    if (this.isProcessing) return;
    const job = this.queue.find(j => j.status === 'pending');
    if (!job) return;

    this.isProcessing = true;
    job.status = 'processing';
    job.info = 'Starting...';
    this.save();
    this.updateUI();

    try {
      const cmd = Command.sidecar(job.command, job.args);

      cmd.on('close', data => {
        if (job.status === 'cancelled') return;
        if (data.code === 0) {
          job.status = 'done';
          job.progress = 100;
          job.info = 'Complete';
          showToast(`Finished: ${job.name}`, 'success');
          Logger.log({ type: 'success', message: `Job Finished: ${job.name}` });
        } else {
          job.status = 'failed';
          job.info = `Exit Code: ${data.code}`;
          showToast(`Failed: ${job.name}`, 'error');
          Logger.log({ type: 'error', message: `Job Failed: ${job.name}`, details: `Exit Code: ${data.code}` });
        }
        this.isProcessing = false;
        this.save();
        this.updateUI();
        this.processNext();
      });

      cmd.on('error', err => {
        if (job.status === 'cancelled') return;
        job.status = 'failed';
        job.info = 'Error';
        this.isProcessing = false;
        this.save();
        this.updateUI();
        this.processNext();
        Logger.log({ type: 'error', message: `Execution Error: ${job.name}`, details: JSON.stringify(err) });
      });

      cmd.stderr.on('data', line => {
        if (job.status === 'cancelled') return;
        job.logs.push(line);
        if (job.logs.length > 2000) job.logs.shift(); // Cap logs

        if (job.duration) {
          const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (timeMatch) {
            const time = parseTimeHelper(timeMatch[1]);
            const pct = Math.min(100, (time / job.duration) * 100);
            job.progress = pct;
            job.info = `${Math.round(pct)}%`;
            this.updateUI();
            // Don't save on every tick (perf)
          }
        }
        if (!job.duration) {
          const durMatch = line.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d+)/);
          if (durMatch) {
            job.duration = parseTimeHelper(durMatch[1]);
            this.save(); // Save duration once found
          }
        }
      });

      const child = await cmd.spawn();
      job.child = child;

    } catch (e) {
      job.status = 'failed';
      job.info = 'Exception';
      this.isProcessing = false;
      this.save();
      this.updateUI();
      this.processNext();
      Logger.log({ type: 'error', message: `Process Exception: ${job.name}`, details: e.toString() });
    }
  },

  updateUI() {
    const container = document.getElementById('queue-list');
    const clearBtn = document.getElementById('queue-clear-btn');
    if (!container) return;

    if (this.viewMode === 'history') {
      // History View
      if (clearBtn) clearBtn.classList.add('hidden'); // Hide clear btn in history for now or change interaction

      if (this.history.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-10">No history available</div>';
        return;
      }

      container.innerHTML = this.history.map(job => `
        <div class="queue-item opacity-75">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-bold text-gray-300">${job.name}</div>
              <div class="text-xs text-gray-500 uppercase">${job.type} • ${new Date(job.completedAt || Date.now()).toLocaleString()}</div>
            </div>
            <div class="status-badge ${this.getStatusClass(job.status)}">${job.status}</div>
          </div>
          <div class="flex justify-between items-center mt-1">
             <div class="text-xs text-gray-500">${job.info || 'Archived'}</div>
             <button onclick="window.processManager.viewLogs('${job.id}')" class="text-xs text-purple-400 hover:text-purple-300 underline">View Logs</button>
          </div>
        </div>
      `).join('');
      return;
    }

    // Active View
    const hasCompleted = this.queue.some(j => ['done', 'failed', 'cancelled'].includes(j.status));
    if (clearBtn) {
      if (hasCompleted) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }

    if (this.queue.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 py-10">No active tasks</div>';
      return;
    }

    container.innerHTML = this.queue.map((job, index) => {
      return `
      <div class="queue-item" id="job-${job.id}" data-index="${index}">
        <div class="flex justify-between items-center">
          <div>
            <div class="font-bold text-white">${job.name}</div>
            <div class="text-xs text-gray-400 uppercase">${job.type}</div>
          </div>
          <div class="flex items-center gap-3">
             <div class="status-badge ${this.getStatusClass(job.status)}">${job.status}</div>
             
             ${(job.status === 'failed' || job.status === 'cancelled') ?
          `<button class="text-gray-400 hover:text-purple-400 px-1 text-lg" onclick="window.processManager.retryJob('${job.id}')" title="Retry">⟳</button>` : ''}
               
             <button class="text-gray-400 hover:text-red-400 px-2 text-lg font-bold" onclick="window.processManager.cancelJob('${job.id}')" title="Remove/Cancel">×</button>
          </div>
        </div>
        ${['processing', 'pending', 'cancelled', 'done'].includes(job.status) && job.progress > 0 ? `
        <div class="queue-progress-bar mt-2">
            <div class="queue-progress-fill" style="width: ${job.progress}%"></div>
        </div>` : ''}
        <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>${job.info}</span>
            <div class="flex gap-3">
               <button onclick="window.processManager.viewLogs('${job.id}')" class="text-xs text-purple-400 hover:text-purple-300 underline">Logs</button>
               ${job.progress > 0 ? `<span>${Math.round(job.progress)}%</span>` : ''}
            </div>
        </div>
      </div>
    `;
    }).join('');
  },

  getStatusClass(status) {
    if (status === 'processing') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    if (status === 'done') return 'bg-green-500/20 text-green-400 border border-green-500/30';
    if (status === 'failed') return 'bg-red-500/20 text-red-400 border border-red-500/30';
    if (status === 'cancelled') return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    return 'bg-gray-700 text-gray-400 border border-gray-600';
  }
};

window.processManager = processManager;

function parseTimeHelper(timeStr) {
  const [h, m, s] = timeStr.split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
}

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





/* --- Optimizer Logic --- */
optimizeBtn.addEventListener('click', async () => {
  if (!selectedFiles || selectedFiles.length === 0) return showToast('No files selected', 'error');

  const isBatch = selectedFiles.length > 1;
  let outputDir = null;

  if (isBatch) {
    outputDir = await open({
      directory: true,
      multiple: false,
      title: "Select Output Folder for Batch Processing"
    });
    if (!outputDir) return;
  }

  // Capture settings once
  const baseArgs = getOptimizerArgs();

  // Determine extension
  let defaultExt = '.mp4';
  if (isAdvancedMode && advCodec && advCodec.value === 'prores_ks') defaultExt = '.mov';
  else if (isAdvancedMode && advCodec && advCodec.value === 'gif') defaultExt = '.gif';

  for (const input of selectedFiles) {
    let output;

    if (isBatch) {
      const name = input.split(/[\\/]/).pop();
      const lastDot = name.lastIndexOf('.');
      const base = lastDot > -1 ? name.substring(0, lastDot) : name;

      if (outputDir) {
        // Output dir explicitly selected in Batch Mode
        output = await join(outputDir, `${base}_optimized${defaultExt}`);
      } else if (appSettings.outputDir) {
        // Default Settings Output Dir
        output = await join(appSettings.outputDir, `${base}_optimized${defaultExt}`);
      } else {
        // In-place fallback
        output = input.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);
      }

    } else {
      const defaultName = input.split(/[\\/]/).pop().replace(/(\.[^.]+)$/, '_optimized' + defaultExt);
      const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : input.replace(/(\.[^.]+)$/, '_optimized' + defaultExt);

      output = await save({
        defaultPath: defaultPath,
        filters: [{ name: 'Video', extensions: [defaultExt.substring(1)] }]
      });
      if (!output) continue;
    }

    const args = ['-i', input, ...baseArgs, '-y', output];

    // Add to global process manager
    processManager.addJob({
      name: input.split(/[\\/]/).pop(),
      type: 'Optimize',
      command: 'ffmpeg',
      args: args,
      output: output
    });
  }

  resetUI();
  showToast(`${isBatch ? 'Files' : 'File'} added to Queue`, 'success');
});

function getOptimizerArgs() {
  const args = [];
  if (isAdvancedMode) {
    const codec = advCodec.value;
    if (codec !== 'copy') {
      args.push('-c:v', codec);

      // Hardware specific flags
      if (codec.includes('nvenc')) {
        args.push('-cq', advCrf.value);
        let pVal = 'p4'; // Default Medium
        if (advPreset.value.includes('fast')) pVal = 'p2';
        if (advPreset.value.includes('slow')) pVal = 'p6';
        args.push('-preset', pVal);
      } else if (codec.includes('amf')) {
        args.push('-rc', 'vbr');
        args.push('-qp-i', advCrf.value);
        args.push('-qp-p', advCrf.value);
        let qVal = 'balanced';
        if (advPreset.value.includes('fast')) qVal = 'speed';
        if (advPreset.value.includes('slow')) qVal = 'quality';
        args.push('-quality', qVal);
      } else if (codec.includes('qsv')) {
        args.push('-global_quality', advCrf.value);
        args.push('-preset', advPreset.value);
      } else if (codec === 'prores_ks') {
        args.push('-profile:v', '3');
        args.push('-pix_fmt', 'yuv422p10le');
      } else {
        // CPU
        args.push('-crf', advCrf.value);
        if (advBackend.value === 'cpu-low') {
          args.push('-threads', '2');
        }
        if (!codec.includes('libvpx')) {
          args.push('-preset', advPreset.value);
        } else {
          args.push('-b:v', '0');
        }
      }
    } else {
      args.push('-c:v', 'copy');
    }

    // Resolution
    if (advResolution.value === 'custom') {
      const w = advResW.value || -1;
      const h = advResH.value || -1;
      if (w != -1 || h != -1) args.push('-vf', `scale=${w}:${h}`);
    } else if (advResolution.value !== 'original') {
      args.push('-vf', `scale=${advResolution.value}`);
    }
    // FPS
    if (advFps.value === 'custom') {
      if (advFpsCustom.value) args.push('-r', advFpsCustom.value);
    } else if (advFps.value !== 'original') {
      args.push('-r', advFps.value);
    }
    // Audio
    if (advAudio.value === 'none') {
      args.push('-an');
    } else if (advAudio.value !== 'copy') {
      args.push('-c:a', advAudio.value);
    } else {
      args.push('-c:a', 'copy');
    }
    // Custom
    if (advCustom.value.trim()) {
      args.push(...advCustom.value.trim().split(/\s+/));
    }

  } else {
    // Simple Mode
    let crf = '23';
    if (currentQuality === 'medium') crf = '18';
    if (currentQuality === 'high') crf = '28';
    const encoderMode = document.getElementById('encoder-select').value;
    switch (encoderMode) {
      case 'gpu-nvidia': args.push('-c:v', 'h264_nvenc', '-cq', crf, '-preset', 'p4'); break;
      case 'gpu-amd': args.push('-c:v', 'h264_amf', '-qp-i', crf, '-qp-p', crf); break;
      case 'gpu-intel': args.push('-c:v', 'h264_qsv', '-global_quality', crf); break;
      case 'cpu-low': args.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'medium', '-threads', '2'); break;
      default: args.push('-vcodec', 'libx264', '-crf', crf, '-preset', 'fast'); break;
    }
  }
  return args;
}

// Navigation Logic
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;

    // Update Buttons
    // Update Buttons
    navBtns.forEach(b => {
      b.classList.remove('bg-purple-600/20', 'text-purple-300', 'border', 'border-purple-500/30');
      b.classList.add('text-gray-400', 'hover-theme');
    });
    btn.classList.remove('text-gray-400', 'hover-theme');
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
  const name = trimFilePath.split(/[\\/]/).pop();
  const defaultName = name.substring(0, name.lastIndexOf('.')) + '_trimmed' + ext;
  const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : trimFilePath.substring(0, lastDot) + '_trimmed' + ext;

  const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: [ext.substring(1)] }] });
  if (!output) return;

  const startStr = formatTime(trimState.start, true);
  const durationStr = formatTime(trimState.end - trimState.start, true);

  // Submit to Queue
  const args = [
    '-ss', startStr, '-i', trimFilePath, '-t', durationStr,
    '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-y', output
  ];

  processManager.addJob({
    name: `Trim: ${trimFilePath.split(/[\\/]/).pop()}`,
    type: 'Trim',
    command: 'ffmpeg',
    args: args,
    output: output
  });

  showToast(`Trim task added to Queue`, 'success');
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

  // --- Queue Submission ---
  fileQueue.forEach(item => {
    processManager.addJob({
      name: item.input.split(/[\\/]/).pop(),
      type: 'Convert',
      command: 'ffmpeg',
      args: ['-i', item.input, '-y', item.output],
      output: item.output
    });
  });

  converterFiles = [];
  setupConverterFile([]);
  converterUploadContent.classList.remove('hidden');
  converterFileInfo.classList.add('hidden');

  showToast(`${fileQueue.length} items added to Queue`, 'success');
});

// --- Settings Logic Removed (Replaced by Global appSettings) ---

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

    const output = await save({ defaultPath: appSettings.outputDir ? await join(appSettings.outputDir, 'merged_video.mp4') : undefined, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    try {
      // Generate Concat List
      const listContent = mergerFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      const tempD = await tempDir();
      const listPath = await join(tempD, `concat_list_${Date.now()}.txt`);

      await writeTextFile(listPath, listContent);

      const args = ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', output];

      processManager.addJob({
        name: `Merge ${mergerFiles.length} files`,
        type: 'Merge',
        command: 'ffmpeg',
        args: args,
        output: output
      });

      mergerFiles = [];
      renderMergerList();
      showToast('Merge task queued', 'success');

    } catch (e) {
      console.error(e);
      showToast('Merge Error', 'error');
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
    // Extract Logic
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '.mp3');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '.mp3');

    const output = await save({ defaultPath, filters: [{ name: 'Audio', extensions: ['mp3'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', output]);
  });
}
// Mute
if (btnMute) {
  btnMute.addEventListener('click', async () => {
    // Mute Logic
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '_muted.mp4');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '_muted.mp4');

    const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    runAudioCommand(['-i', audioFile, '-c:v', 'copy', '-an', '-y', output]);
  });
}
// Normalize
if (btnNormalize) {
  // Normalize Logic (Fixing garbage and implementing logic)
  btnNormalize.addEventListener('click', async () => {
    if (!audioFile) return;
    const name = audioFile.split(/[\\/]/).pop();
    const defaultName = name.replace(/\.[^.]+$/, '_norm.mp4');
    const defaultPath = appSettings.outputDir ? await join(appSettings.outputDir, defaultName) : audioFile.replace(/\.[^.]+$/, '_norm.mp4');

    const output = await save({ defaultPath, filters: [{ name: 'Video', extensions: ['mp4'] }] });
    if (!output) return;

    // Loudnorm filter
    runAudioCommand(['-i', audioFile, '-af', 'loudnorm', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-y', output]);
  });
}

async function runAudioCommand(args) {
  if (!audioFile) return;
  processManager.addJob({
    name: `Audio: ${audioFile.split(/[\\/]/).pop()}`,
    type: 'Audio',
    command: 'ffmpeg',
    args: args
  });
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

// Init
document.addEventListener('DOMContentLoaded', () => {
  console.log("App Initializing... v2 NEW UI");
  initTheme();
  loadSettings();
  processManager.init();
  initQueueDragDrop();
});

function initQueueDragDrop() {
  const queueZone = document.getElementById('view-queue');
  if (!queueZone) return;

  queueZone.addEventListener('dragover', e => {
    e.preventDefault();
    // Visual feedback
    queueZone.classList.add('bg-purple-900/10');
  });

  queueZone.addEventListener('dragleave', e => {
    e.preventDefault();
    queueZone.classList.remove('bg-purple-900/10');
  });

  queueZone.addEventListener('drop', e => {
    e.preventDefault();
    queueZone.classList.remove('bg-purple-900/10');

    const paths = [];
    if (e.dataTransfer.files.length) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        if (f.path) paths.push(f.path);
        // Fallback for some browsers/environments if path is hidden, but Tauri usually exposes it.
      }
    }

    if (paths.length > 0) {
      queueFilesDefault(paths);
    }
  });
}

function queueFilesDefault(paths) {
  paths.forEach(path => {
    // Default: Optimize H.264
    const lastDot = path.lastIndexOf('.');
    const output = path.substring(0, lastDot) + '_optimized.mp4';

    processManager.addJob({
      name: `Auto-Opt: ${path.replace(/^.*[\\\/]/, '')}`,
      type: 'Optimizer',
      command: 'ffmpeg',
      args: ['-i', path, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', '-y', output],
      output: output
    });
  });
  showToast(`${paths.length} files added to queue`, 'success');
}

/* --- Settings & Theme Logic (Variables Defined at Top) --- */

// Note: loadSettings functions etc. are defined below and used by init.

function loadSettings() {
  const s = localStorage.getItem('appSettings');
  if (s) {
    try {
      appSettings = { ...appSettings, ...JSON.parse(s) };
    } catch (e) { console.error("Settings parse error", e); }
  }
  applySettings();
  initSettingsUI();
}

function saveSettings() {
  localStorage.setItem('appSettings', JSON.stringify(appSettings));
}

function applySettings() {
  // Theme Application
  const body = document.body;
  body.classList.remove('theme-cosmic', 'theme-light', 'theme-midnight', 'theme-sunset');
  if (appSettings.theme && appSettings.theme !== 'theme-cosmic') {
    body.classList.add(appSettings.theme);
  }

  // Update UI State
  const btns = document.querySelectorAll('.theme-btn');
  btns.forEach(btn => {
    if (btn.dataset.theme === appSettings.theme) {
      btn.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-gray-900');
    } else {
      btn.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-gray-900');
    }
  });

  // Update Notification Checkbox
  const notifCheck = document.getElementById('setting-notifications');
  if (notifCheck) {
    notifCheck.checked = appSettings.notifications;
  }

  // Update Output Dir Label
  const dirLabel = document.getElementById('setting-output-dir-label');
  if (dirLabel) {
    dirLabel.textContent = appSettings.outputDir ? appSettings.outputDir : "Always ask for location";
    dirLabel.title = appSettings.outputDir || "";
  }
}

function initTheme() {
  // Kept for backward compatibility with existing calls
}

function initSettingsUI() {
  // 1. Settings Tab Navigation (Event Delegation)
  const settingsContainer = document.getElementById('view-settings');
  if (settingsContainer) {
    settingsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-nav-btn');
      if (!btn) return;

      // Reset tabs
      document.querySelectorAll('.settings-nav-btn').forEach(b => {
        b.classList.remove('active', 'bg-gray-800', 'text-white');
        b.classList.add('text-gray-400');
      });

      // Activate clicked
      btn.classList.remove('text-gray-400');
      btn.classList.add('active', 'bg-gray-800', 'text-white');

      // Switch content
      const targetId = `tab-content-${btn.dataset.tab}`;
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        if (content.id === targetId) content.classList.remove('hidden');
        else content.classList.add('hidden');
      });
    });
  }

  // 2. Theme Buttons (Event Delegation)
  // We can attach to a parent or just use old logic if elements exist
  const themeContainer = document.getElementById('tab-content-appearance');
  if (themeContainer) {
    themeContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-btn');
      if (!btn) return;

      appSettings.theme = btn.dataset.theme;
      saveSettings();
      applySettings();
    });
  } else {
    // Fallback
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        appSettings.theme = btn.dataset.theme;
        saveSettings();
        applySettings();
      });
    });
  }

  // 3. Notification Checkbox
  const notifCheck = document.getElementById('setting-notifications');
  if (notifCheck) {
    notifCheck.onchange = (e) => {
      appSettings.notifications = e.target.checked;
      saveSettings();
    };
  }

  // 4. Set Output Directory
  const btnSetDir = document.getElementById('btn-set-output-dir');
  if (btnSetDir) {
    btnSetDir.onclick = async () => {
      try {
        console.log("Opening directory dialog...");
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Default Export Folder"
        });
        if (selected) {
          appSettings.outputDir = selected;
          saveSettings();
          applySettings();
        }
      } catch (e) {
        console.error("Failed to select directory", e);
        // Fallback or user info
      }
    };
  }

  // 5. Logs Logic
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  if (btnRefreshLogs) {
    btnRefreshLogs.onclick = () => {
      Logger.init();
      Logger.render();
    };
  }

  const btnClearLogs = document.getElementById('btn-clear-logs');
  if (btnClearLogs) {
    btnClearLogs.onclick = () => {
      if (confirm('Clear all application logs?')) {
        Logger.clear();
      }
    };
  }

  // Initial Render of Logs
  Logger.render();
}

// Override showToast to respect settings
const originalShowToast = window.showToast;
window.showToast = function (msg, type) {
  if (appSettings.notifications === false) return;
  if (originalShowToast) originalShowToast(msg, type);
};

// --- Preset Manager ---
const presetManager = {
  presets: {},

  init() {
    this.load();
    this.updateDropdown();

    // Listeners
    const select = document.getElementById('user-preset-select');
    const saveBtn = document.getElementById('btn-save-preset');
    const delBtn = document.getElementById('btn-del-preset');

    // Watch relevant inputs to switch to "Unsaved" state
    const inputs = ['adv-backend', 'adv-codec', 'adv-preset', 'adv-crf', 'adv-resolution', 'adv-fps', 'adv-audio', 'adv-custom'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this.resetSelection());
        el.addEventListener('input', () => this.resetSelection());
      }
    });

    if (select) {
      select.addEventListener('change', (e) => {
        if (e.target.value) this.apply(e.target.value);
        else this.toggleDelete(false);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = prompt("Enter preset name:");
        if (name) this.save(name);
      });
    }

    if (delBtn) {
      delBtn.addEventListener('click', () => {
        const name = select.value;
        if (name && confirm(`Delete preset "${name}"?`)) {
          this.delete(name);
        }
      });
    }
  },

  load() {
    const data = localStorage.getItem('userPresets');
    if (data) {
      try { this.presets = JSON.parse(data); } catch (e) { console.error(e); }
    }
  },

  save(name) {
    if (!name.trim()) return;

    // Capture current state
    const config = {
      backend: document.getElementById('adv-backend')?.value,
      codec: document.getElementById('adv-codec')?.value,
      preset: document.getElementById('adv-preset')?.value,
      crf: document.getElementById('adv-crf')?.value,
      resolution: document.getElementById('adv-resolution')?.value,
      resW: document.getElementById('adv-res-w')?.value,
      resH: document.getElementById('adv-res-h')?.value,
      fps: document.getElementById('adv-fps')?.value,
      fpsVal: document.getElementById('adv-fps-custom')?.value,
      audio: document.getElementById('adv-audio')?.value,
      custom: document.getElementById('adv-custom')?.value
    };

    this.presets[name] = config;
    localStorage.setItem('userPresets', JSON.stringify(this.presets));
    this.updateDropdown();

    // Select it
    const select = document.getElementById('user-preset-select');
    if (select) {
      select.value = name;
      this.toggleDelete(true);
    }
    showToast(`Preset "${name}" saved`, 'success');
  },

  delete(name) {
    delete this.presets[name];
    localStorage.setItem('userPresets', JSON.stringify(this.presets));
    this.updateDropdown();
    this.resetSelection();
    showToast(`Preset "${name}" deleted`, 'info');
  },

  apply(name) {
    const config = this.presets[name];
    if (!config) return;

    // Helper to safely set value and trigger change
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) {
        el.value = val;
        el.dispatchEvent(new Event('change'));
      }
    };

    set('adv-backend', config.backend);

    setTimeout(() => {
      set('adv-codec', config.codec);
      set('adv-preset', config.preset);
      set('adv-crf', config.crf);
      // Update CRF Display
      const crfDisp = document.getElementById('adv-crf-val');
      if (crfDisp) crfDisp.textContent = config.crf;

      set('adv-resolution', config.resolution);
      if (config.resolution === 'custom') {
        document.getElementById('adv-res-w').value = config.resW || '';
        document.getElementById('adv-res-h').value = config.resH || '';
      }

      set('adv-fps', config.fps);
      if (config.fps === 'custom') {
        document.getElementById('adv-fps-custom').value = config.fpsVal || '';
      }

      set('adv-audio', config.audio);
      set('adv-custom', config.custom);

      this.toggleDelete(true);
    }, 50);
  },

  updateDropdown() {
    const select = document.getElementById('user-preset-select');
    if (!select) return;

    // Keep first option
    const current = select.value;
    // Save children except options? No, rebuild.
    select.innerHTML = '<option value="">-- Current Settings --</option>';

    Object.keys(this.presets).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    // Restore selection if exists
    if (this.presets[current]) select.value = current;
  },

  resetSelection() {
    const select = document.getElementById('user-preset-select');
    if (select) select.value = "";
    this.toggleDelete(false);
  },

  toggleDelete(canDelete) {
    const btn = document.getElementById('btn-del-preset');
    if (btn) {
      if (canDelete) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  presetManager.init();
});
