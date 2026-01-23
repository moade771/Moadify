const fs = require('fs');
const path = require('path');

class Storage {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.libraryPath = path.join(userDataPath, 'library.json');
        this.playlistsPath = path.join(userDataPath, 'playlists.json');
        this.settingsPath = path.join(userDataPath, 'settings.json');

        this.historyPath = path.join(userDataPath, 'history.json');
        this.coverCachePath = path.join(userDataPath, 'cover-cache.json');

        this.init();
    }

    init() {
        if (!fs.existsSync(this.libraryPath)) fs.writeFileSync(this.libraryPath, JSON.stringify([]));
        if (!fs.existsSync(this.playlistsPath)) fs.writeFileSync(this.playlistsPath, JSON.stringify([]));
        if (!fs.existsSync(this.settingsPath)) fs.writeFileSync(this.settingsPath, JSON.stringify({}));

        if (!fs.existsSync(this.historyPath)) fs.writeFileSync(this.historyPath, JSON.stringify([]));
        if (!fs.existsSync(this.coverCachePath)) fs.writeFileSync(this.coverCachePath, JSON.stringify({}));
    }

    async getLibrary() {
        try {
            const data = await fs.promises.readFile(this.libraryPath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }

    async saveLibrary(data) {
        await fs.promises.writeFile(this.libraryPath, JSON.stringify(data, null, 2));
    }

    async getPlaylists() {
        try {
            const data = await fs.promises.readFile(this.playlistsPath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }

    async savePlaylists(data) {
        await fs.promises.writeFile(this.playlistsPath, JSON.stringify(data, null, 2));
    }

    async getSettings() {
        try {
            const data = await fs.promises.readFile(this.settingsPath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }

    // Sync version for initialization/downloads if strict dependency needed, but usually async is fine
    getSettingsSync() {
        try {
            return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        } catch (e) {
            return {};
        }
    }

    async saveSettings(data) {
        await fs.promises.writeFile(this.settingsPath, JSON.stringify(data, null, 2));
    }

    async getHistory() {
        try {
            const data = await fs.promises.readFile(this.historyPath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }

    async saveHistory(data) {
        await fs.promises.writeFile(this.historyPath, JSON.stringify(data, null, 2));
    }

    async getCoverCache() {
        try {
            const data = await fs.promises.readFile(this.coverCachePath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }

    async saveCoverCache(data) {
        await fs.promises.writeFile(this.coverCachePath, JSON.stringify(data, null, 2));
    }
}

module.exports = Storage;
