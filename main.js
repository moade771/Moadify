const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Storage = require('./src/storage');
const { parseFile } = require('./src/metadata');
const DiscordRPC = require('./src/discord');

// Initialize Storage
const storage = new Storage(app.getPath('userData'));

// Initialize Discord RPC (Replace with your actual Client ID)
const discordRpc = new DiscordRPC('123456789012345678');

let mainWindow;
let tray;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false, // Custom frame for modern look
        backgroundColor: '#121212',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            backgroundThrottling: false,
            webviewTag: true
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.loadFile('index.html');

    // mainWindow.webContents.openDevTools(); // For debugging

    // Enable Ad Blocker for main session
    enableAdBlocker(mainWindow.webContents.session);

    // Download Handling
    mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
        const settings = storage.getSettingsSync();
        const musicFolder = settings.musicFolder || app.getPath('music');

        // Rename logic: Remove _spotdown.org suffix
        let filename = item.getFilename();
        filename = filename.replace(/_spotdown\.org/g, '');

        const savePath = path.join(musicFolder, filename);

        // Force save path (no prompt)
        item.setSavePath(savePath);

        const downloadId = uuidv4();

        // Notify renderer started
        mainWindow.webContents.send('download-started', {
            id: downloadId,
            filename: filename,
            totalBytes: item.getTotalBytes(),
            cover: 'assets/placeholder.svg' // Placeholder until we can parse it
        });

        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                // handle interruption if needed
            } else if (state === 'progressing') {
                if (mainWindow) {
                    mainWindow.webContents.send('download-progress', {
                        id: downloadId,
                        progress: item.getReceivedBytes() / item.getTotalBytes(),
                        state: state
                    });
                }
            }
        });

        item.on('done', (event, state) => {
            if (mainWindow) {
                mainWindow.webContents.send('download-complete', {
                    id: downloadId,
                    filename: filename,
                    path: savePath,
                    state: state
                });
            }
        });
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'icon.ico');
    if (!fs.existsSync(iconPath)) {
        console.log('Tray icon not found, skipping tray creation.');
        return;
    }

    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Moadify',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Moadify Music Player');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

// File Sync Logic
let fileSyncInterval = null;

async function checkFileIntegrity() {
    // console.log('Checking file integrity...');
    const library = await storage.getLibrary();
    let libraryChanged = false;
    const newLibrary = [];

    // Check Library
    for (const song of library) {
        try {
            await fs.promises.access(song.path);
            newLibrary.push(song);
        } catch (e) {
            libraryChanged = true;
            // console.log(`Removing missing file: ${song.path}`);
        }
    }

    if (libraryChanged) {
        await storage.saveLibrary(newLibrary);
    }

    // Check History (Recently Played)
    const history = await storage.getHistory();
    let historyChanged = false;
    const newHistory = [];

    for (const song of history) {
        try {
            await fs.promises.access(song.path);
            newHistory.push(song);
        } catch (e) {
            historyChanged = true;
        }
    }

    if (historyChanged) {
        await storage.saveHistory(newHistory);
    }

    if (libraryChanged || historyChanged) {
        if (mainWindow) {
            mainWindow.webContents.send('library-updated');
        }
    }
}

function startFileSync() {
    if (fileSyncInterval) clearInterval(fileSyncInterval);
    console.log('Starting File Sync Watcher');
    checkFileIntegrity(); // Run immediately
    fileSyncInterval = setInterval(checkFileIntegrity, 2000); // Check every 2 seconds
}

function stopFileSync() {
    if (fileSyncInterval) {
        clearInterval(fileSyncInterval);
        fileSyncInterval = null;
        console.log('Stopped File Sync Watcher');
    }
}

// Secure Webview Navigation
app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
        // Block Navigation to external sites
        contents.on('will-navigate', (event, navigationUrl) => {
            const parsedUrl = new URL(navigationUrl);
            if (!parsedUrl.hostname.includes('spotdown.org')) {
                event.preventDefault();
            }
        });

        // Block New Windows
        contents.setWindowOpenHandler(({ url }) => {
            const parsedUrl = new URL(url);
            if (!parsedUrl.hostname.includes('spotdown.org')) {
                return { action: 'deny' };
            }
            return { action: 'allow' };
        });

        // Apply Network Ad Blocker to Webview Session
        enableAdBlocker(contents.session);
    }
});

function enableAdBlocker(session) {
    const filter = {
        urls: ["*://*/*"]
    };

    const adDomains = [
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com",
        "adnxs.com", "adsrvr.org", "openx.net", "popads.net", "popcash.net",
        "propellerads.com", "adroll.com", "criteo.com", "outbrain.com", "taboola.com",
        "rubiconproject.com", "pubmatic.com", "media.net", "adtech.de", "adtech.com",
        "chartbeat.net", "scorecardresearch.com", "quantserve.com", "moatads.com",
        "amazon-adsystem.com", "advertising.com", "bidswitch.net", "contextweb.com",
        "criteo.net", "casalemedia.com", "facebook.com/tr/", "ads.twitter.com",
        "adservice.google.com", "pagead2.googlesyndication.com", "tpc.googlesyndication.com",
        "www.googletagservices.com"
    ];

    session.webRequest.onBeforeRequest(filter, (details, callback) => {
        const url = details.url.toLowerCase();

        // Block by domain
        const shouldBlock = adDomains.some(domain => url.includes(domain));

        // Block by simple patterns
        const isAdPattern = [
            "/ads/", "/ad/", "/banner/", "/banners/", "/sponsors/",
            "googlesyndication", "g.doubleclick"
        ].some(pattern => url.includes(pattern));

        if (shouldBlock || isAdPattern) {
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Global shortcuts for media keys are removed to allow the native Media Session API 
    // (navigator.mediaSession) in the renderer to handle media controls and the system overlay (SMTC).
    // This ensures the "Now Playing" overlay appears and works correctly on Windows.

    // Check for File Sync Setting
    const settings = storage.getSettingsSync();
    if (settings.fileSync) {
        startFileSync();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// Window Controls
ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.on('close-window', () => mainWindow.close()); // This triggers the close event which hides to tray

// Library & Storage
// Library & Storage
ipcMain.handle('get-library', async () => await storage.getLibrary());
ipcMain.handle('save-library', async (event, data) => await storage.saveLibrary(data));
ipcMain.handle('get-playlists', async () => await storage.getPlaylists());
ipcMain.handle('save-playlists', async (event, data) => await storage.savePlaylists(data));
ipcMain.handle('get-history', async () => await storage.getHistory());
ipcMain.handle('save-history', async (event, data) => await storage.saveHistory(data));
ipcMain.handle('get-version', () => app.getVersion());

// File Import
ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }]
    });

    if (result.canceled) return [];
    return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('parse-metadata', async (event, filePath) => {
    const metadata = await parseFile(filePath);
    if (metadata) {
        return {
            id: uuidv4(),
            path: filePath,
            ...metadata,
            dateAdded: Date.now()
        };
    }
    return null;
});

// Discord RPC
ipcMain.on('discord-set-activity', (event, activity) => {
    discordRpc.setActivity(activity.details, activity.state);
});

// Cover Art Upload
ipcMain.handle('select-cover', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const bitmap = fs.readFileSync(filePath);
    return `data:image/${path.extname(filePath).slice(1)};base64,${bitmap.toString('base64')}`;
});

// Auto-Start
ipcMain.handle('toggle-autostart', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
    return enable;
});

ipcMain.handle('get-autostart-status', () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
});

// Advanced Settings Handlers
ipcMain.handle('open-config-folder', () => {
    shell.openPath(app.getPath('userData'));
});

ipcMain.handle('reset-app', async () => {
    const userDataPath = app.getPath('userData');
    const files = ['library.json', 'playlists.json', 'settings.json', 'history.json'];

    try {
        for (const file of files) {
            const filePath = path.join(userDataPath, file);
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        }
        return true;
    } catch (e) {
        console.error('Reset failed:', e);
        return false;
    }
});

ipcMain.on('set-debug-mode', (event, enable) => {
    if (mainWindow) {
        if (enable) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        } else {
            mainWindow.webContents.closeDevTools();
        }
    }
});

// File Sync Handlers
ipcMain.handle('toggle-file-sync', async (event, enable) => {
    const settings = await storage.getSettings();
    settings.fileSync = enable;
    await storage.saveSettings(settings);

    if (enable) {
        startFileSync();
    } else {
        stopFileSync();
    }
    return enable;
});

ipcMain.handle('get-file-sync-status', async () => {
    const settings = await storage.getSettings();
    return !!settings.fileSync;
});
