const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu } = require('electron');
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
            backgroundThrottling: false
        },
        icon: path.join(__dirname, 'icon.ico')
    });

    mainWindow.loadFile('index.html');

    // mainWindow.webContents.openDevTools(); // For debugging

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

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Global shortcuts for media keys are removed to allow the native Media Session API 
    // (navigator.mediaSession) in the renderer to handle media controls and the system overlay (SMTC).
    // This ensures the "Now Playing" overlay appears and works correctly on Windows.

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
ipcMain.handle('get-library', () => storage.getLibrary());
ipcMain.handle('save-library', (event, data) => storage.saveLibrary(data));
ipcMain.handle('get-playlists', () => storage.getPlaylists());
ipcMain.handle('save-playlists', (event, data) => storage.savePlaylists(data));
ipcMain.handle('get-history', () => storage.getHistory());
ipcMain.handle('save-history', (event, data) => storage.saveHistory(data));

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
