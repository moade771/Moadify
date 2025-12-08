const fs = require('fs');
const path = require('path');

class Storage {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.libraryPath = path.join(userDataPath, 'library.json');
        this.playlistsPath = path.join(userDataPath, 'playlists.json');
        this.settingsPath = path.join(userDataPath, 'settings.json');

        this.historyPath = path.join(userDataPath, 'history.json');

        this.init();
    }

    init() {
        if (!fs.existsSync(this.libraryPath)) fs.writeFileSync(this.libraryPath, JSON.stringify([]));
        if (!fs.existsSync(this.playlistsPath)) fs.writeFileSync(this.playlistsPath, JSON.stringify([]));
        if (!fs.existsSync(this.settingsPath)) fs.writeFileSync(this.settingsPath, JSON.stringify({}));
        if (!fs.existsSync(this.historyPath)) fs.writeFileSync(this.historyPath, JSON.stringify([]));
    }

    getLibrary() {
        try {
            return JSON.parse(fs.readFileSync(this.libraryPath));
        } catch (e) {
            return [];
        }
    }

    saveLibrary(data) {
        fs.writeFileSync(this.libraryPath, JSON.stringify(data, null, 2));
    }

    getPlaylists() {
        try {
            return JSON.parse(fs.readFileSync(this.playlistsPath));
        } catch (e) {
            return [];
        }
    }

    savePlaylists(data) {
        fs.writeFileSync(this.playlistsPath, JSON.stringify(data, null, 2));
    }

    getSettings() {
        try {
            return JSON.parse(fs.readFileSync(this.settingsPath));
        } catch (e) {
            return {};
        }
    }

    saveSettings(data) {
        fs.writeFileSync(this.settingsPath, JSON.stringify(data, null, 2));
    }

    getHistory() {
        try {
            return JSON.parse(fs.readFileSync(this.historyPath));
        } catch (e) {
            return [];
        }
    }

    saveHistory(data) {
        fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2));
    }
}

module.exports = Storage;
