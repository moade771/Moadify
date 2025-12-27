const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window Controls
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    close: () => ipcRenderer.send('close-window'),
    setWindowSize: (width, height, x, y) => ipcRenderer.send('set-window-size', { width, height, x, y }),
    setAlwaysOnTopFn: (enable) => ipcRenderer.send('set-always-on-top', enable), // Direct window control for mini mode if needed
    setAlwaysOnTopSetting: (enable) => ipcRenderer.invoke('set-always-on-top-setting', enable),
    getAlwaysOnTopSetting: () => ipcRenderer.invoke('get-always-on-top-setting'),

    // Library & Storage
    getLibrary: () => ipcRenderer.invoke('get-library'),
    saveLibrary: (data) => ipcRenderer.invoke('save-library', data),
    getPlaylists: () => ipcRenderer.invoke('get-playlists'),
    savePlaylists: (data) => ipcRenderer.invoke('save-playlists', data),
    getHistory: () => ipcRenderer.invoke('get-history'),
    saveHistory: (data) => ipcRenderer.invoke('save-history', data),

    // File Import
    selectFiles: () => ipcRenderer.invoke('select-files'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    parseMetadata: (filePath) => ipcRenderer.invoke('parse-metadata', filePath),
    selectCover: () => ipcRenderer.invoke('select-cover'),
    getVersion: () => ipcRenderer.invoke('get-version'),

    // Discord RPC
    setDiscordActivity: (activity) => ipcRenderer.send('discord-set-activity', activity),

    // Media Key Listeners
    onPlayPause: (callback) => ipcRenderer.on('media-play-pause', callback),
    onNextTrack: (callback) => ipcRenderer.on('media-next', callback),
    onPrevTrack: (callback) => ipcRenderer.on('media-prev', callback),

    // Downloads
    onDownloadStarted: (callback) => ipcRenderer.on('download-started', (event, data) => callback(data)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (event, data) => callback(data)),

    // Auto-Start
    toggleAutostart: (enable) => ipcRenderer.invoke('toggle-autostart', enable),
    getAutostartStatus: () => ipcRenderer.invoke('get-autostart-status'),

    // Advanced
    openConfigFolder: () => ipcRenderer.invoke('open-config-folder'),
    resetApp: () => ipcRenderer.invoke('reset-app'),
    setDebugMode: (enable) => ipcRenderer.send('set-debug-mode', enable),

    // File Sync
    toggleFileSync: (enable) => ipcRenderer.invoke('toggle-file-sync', enable),
    getFileSyncStatus: () => ipcRenderer.invoke('get-file-sync-status'),
    onLibraryUpdated: (callback) => ipcRenderer.on('library-updated', callback),

    // Auto-Updater
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    downloadUpdate: () => ipcRenderer.send('download-update'),
    quitAndInstall: () => ipcRenderer.send('quit-and-install'),
    getAutoUpdateStatus: () => ipcRenderer.invoke('get-auto-update-setting'),
    toggleAutoUpdate: (enable) => ipcRenderer.send('set-auto-update-setting', enable),

    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, data) => callback(data)),
});
