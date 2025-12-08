const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window Controls
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    close: () => ipcRenderer.send('close-window'),

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

    // Discord RPC
    setDiscordActivity: (activity) => ipcRenderer.send('discord-set-activity', activity),

    // Media Key Listeners
    onPlayPause: (callback) => ipcRenderer.on('media-play-pause', callback),
    onNextTrack: (callback) => ipcRenderer.on('media-next', callback),
    onPrevTrack: (callback) => ipcRenderer.on('media-prev', callback),
});
