# Project Tasks & Roadmap

## 🚀 Completed Tasks
- [x] **Refactor Process Queue**: Migrate from blocking overlay to non-blocking "Queue" tab.
- [x] **Implement ProcessManager**: Centralized singleton for handling sequential FFmpeg jobs.
- [x] **Update Tools**: 
    - [x] Optimizer
    - [x] Trimmer
    - [x] Converter
    - [x] Merger
    - [x] Audio Tools
- [x] **Robust Cancellation**: Implement ability to kill running subprocesses via the Queue UI.
- [x] **UI Polish**:
    - [x] Fix Light Theme Sidebar Hover (distorted dark background).
    - [x] Standardize "Trim Video" button style.
- [x] **Security**: Remove specific `shell:allow-open` wildcard permission.
- [x] **Queue Features**:
    - [x] **Persistence**: Queue survives app restart (saved to localStorage).
    - [x] **Drag & Drop**: Drag files to Queue tab to auto-optimize (Default H.264).
    - [x] **Clear Completed**: Button to clear done/failed tasks.
    - [x] **Retry**: Retry failed/cancelled tasks.
    - [x] **Task History**:
        - [x] **History Mode**: Toggle between "Active" queue and "History" in Queue tab.
        - [x] **Persistence**: Completed jobs are moved to history and saved to localStorage.
- [x] **Settings Tab**:
    - [x] **Settings UI**: Unified settings view.
    - [x] **Theme Selector**: Global theme state.
    - [x] **Notifications**: Toggle toast popups.
    - [x] **Default Output Folder**: Option to set a permanent export path.
    - [x] **Application Logs**: Persistent logging of errors, job status, and details in Settings.

## 📋 Current Backlog
- [x] **Queue Reordering**: Drag and drop to reorder pending jobs. (Removed by request)
- [x] **Custom Presets**: Functionality to save/load user-defined FFmpeg presets.
- [x] **Detailed Logs**: View full FFmpeg stdout/stderr logs for a specific job in a modal.

## �️ Settings & Logs Overhaul
- [x] **Settings UI Refactor**:
    - [x] **Tabbed Layout**: Split settings into General, Processing, Logs, Appearance, About.
    - [x] **Sidebar Navigation**: Improved visual hierarchy.
- [ ] **Log System Upgrade**:
    - [ ] **LogManager**: New service for file-based logging ($APPCACHE/logs).
    - [ ] **Log Rotation**: Manage log files to prevent storage bloat.
    - [ ] **Enhanced Log View**: Filter by level, export support.

## �🔮 Future Ideas
- [ ] **Cloud Sync**: Sync settings/presets across devices (maybe not).
