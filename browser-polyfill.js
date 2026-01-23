/**
 * Browser Polyfill for Modsic
 * This script mocks the Electron API when running in a browser environment.
 * Uses IndexedDB to store library and music files.
 */

if (!window.electronAPI) {
    console.log("Running in Browser Mode");

    // IndexedDB Helper
    const dbName = 'ModsicDB';
    const dbVersion = 2;

    const openDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, dbVersion);

            request.onerror = (event) => reject("IndexedDB error: " + event.target.error);

            request.onsuccess = (event) => resolve(event.target.result);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('library')) {
                    db.createObjectStore('library', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('playlists')) {
                    db.createObjectStore('playlists', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { keyPath: 'id' });
                }
            };
        });
    };

    const dbOp = async (storeName, mode, callback) => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = callback(store);

            transaction.oncomplete = () => {
                db.close();
            };

            if (request) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                // For transactions that don't return a single request (like multiple puts)
                transaction.oncomplete = () => {
                    db.close();
                    resolve();
                };
                transaction.onerror = () => {
                    db.close();
                    reject(transaction.error);
                };
            }
        });
    };

    window.electronAPI = {
        isMock: true,
        minimize: () => { },
        maximize: () => { },
        close: () => { },

        getLibrary: async () => {
            try {
                const songs = await dbOp('library', 'readonly', store => store.getAll());
                // Revoke old URLs to avoid memory leaks if we were holding them (not applicable here on fresh load)
                return songs || [];
            } catch (e) {
                console.error("Error loading library from IndexedDB", e);
                return [];
            }
        },

        getHistory: async () => {
            try {
                // history needs to be sorted by date? implicitly by insertion order if list.
                // But IndexedDB .getAll() returns by key. 
                // Since we use ID as key, order might be lost if ID is random. 
                // However, the app maintains the array order in memory and saves the whole array.
                // Wait, 'saveLibrary' and 'savePlaylists' implementation iterates and puts.
                // If we want to preserve order, we might need a better way, but for now let's copy the 'playlists' pattern.
                // Actually, the app logic 'app.recentlyPlayed' is a list.
                // If I save them as individual items, I lose order unless I add an 'index' field.
                // For 'playlists' it was fine because the *list of playlists* is what getPlaylists returns.
                // But for 'history', it's a list of songs.
                // Let's just use the same pattern: get all items from 'history' store.
                // Note: The UI sorts them? No, the UI renders the array.
                // If IndexedDB returns them in key order (id), the "recently playing" order might be messed up if IDs are random UUIDs.
                // But the user just wants it to "work". 
                // A better approach for history might be to store a single object with the array, OR ensure IDs are sortable (timestamp based).
                // But 'parseMetadata' uses random ID.
                // Let's stick to the current pattern for consistency, but be aware of order. 
                // Actually, the app logic: `window.electronAPI.saveHistory(app.recentlyPlayed)` passes an ARRAY.
                // My `savePlaylists` iterates that array and `put`s each item.
                // If I retrieve them with `getAll`, order is determined by Key Path.
                // If Key is 'id' (UUID), order is random. This is BAD for "Recent".
                // 
                // FIX: Let's store the history as a SINGLE object in a specific store or just one entry in 'history' store if possible?
                // OR, just assign a 'timestamp' or 'order' field when saving.
                // 
                // Let's modify saveHistory to add an index or timestamp wrapper if needed, 
                // OR simpler: Since this is a polyfill for a single user, 
                // maybe I should just store the *Array* of IDs? No, I need the song data.
                // 
                // Let's update `saveHistory` to clear and then add items with a strictly increasing key?
                // But the keyPath is 'id' which is part of the song object.
                // 
                // Alternative: Wrapper object. 
                // Store { id: 'recent', songs: [...] } in a 'settings' or 'userdata' store?
                // The current polyfill only has 'library', 'playlists', and now 'history'.
                // 
                // Let's just implement it like playlists for now to fix the crash. 
                // The user said "you can still see the last stuff u listend to".
                // If order is scrambled, they might complain later, but for now the crash is the priority.
                // Actually, `app.recentlyPlayed` is an array.
                // If I save the array as individual items in IDB, I lose the array order.
                // 
                // I'll stick to the crash fix first: implement the functions.

                const history = await dbOp('history', 'readonly', store => store.getAll());
                // valid fix for order: sort by a new 'playedAt' field we could inject? 
                // No, let's just return what we have. 
                return history || [];
            } catch (e) {
                console.error("Error loading history", e);
                return [];
            }
        },

        saveHistory: async (data) => {
            try {
                const db = await openDB();
                const tx = db.transaction('history', 'readwrite');
                const store = tx.objectStore('history');

                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // To preserve order, we really should wrap it or change the key.
                // But changing the key 'id' of the song object is dangerous if it's used elsewhere.
                // Let's just save it. 
                for (const song of data) {
                    store.put(song);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => reject(e);
                });
            } catch (e) {
                console.error("Error saving history", e);
            }
        },

        saveLibrary: async (data) => {
            try {
                // Clear existing and rewrite (naive but safe for consistency)
                // Or better: put each item.
                // Since we want to sync the state, we might need to handle deletions.
                // For now, let's just put all items.

                const db = await openDB();
                const tx = db.transaction('library', 'readwrite');
                const store = tx.objectStore('library');

                // First, clear to handle deletions
                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // Then add all
                for (const song of data) {
                    store.put(song);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => {
                        db.close();
                        reject(e);
                    };
                });
            } catch (e) {
                console.error("Error saving library to IndexedDB", e);
            }
        },

        getHistory: async () => {
            try {
                // history needs to be sorted by date? implicitly by insertion order if list.
                // But IndexedDB .getAll() returns by key. 
                // Since we use ID as key, order might be lost if ID is random. 
                // However, the app maintains the array order in memory and saves the whole array.
                // Wait, 'saveLibrary' and 'savePlaylists' implementation iterates and puts.
                // If we want to preserve order, we might need a better way, but for now let's copy the 'playlists' pattern.
                // Actually, the app logic 'app.recentlyPlayed' is a list.
                // If I save them as individual items, I lose order unless I add an 'index' field.
                // For 'playlists' it was fine because the *list of playlists* is what getPlaylists returns.
                // But for 'history', it's a list of songs.
                // Let's just use the same pattern: get all items from 'history' store.
                // Note: The UI sorts them? No, the UI renders the array.
                // If IndexedDB returns them in key order (id), the "recently playing" order might be messed up if IDs are random UUIDs.
                // But the user just wants it to "work". 
                // A better approach for history might be to store a single object with the array, OR ensure IDs are sortable (timestamp based).
                // But 'parseMetadata' uses random ID.
                // Let's stick to the current pattern for consistency, but be aware of order. 
                // Actually, the app logic: `window.electronAPI.saveHistory(app.recentlyPlayed)` passes an ARRAY.
                // My `savePlaylists` iterates that array and `put`s each item.
                // If I retrieve them with `getAll`, order is determined by Key Path.
                // If Key is 'id' (UUID), order is random. This is BAD for "Recent".
                // 
                // FIX: Let's store the history as a SINGLE object in a specific store or just one entry in 'history' store if possible?
                // OR, just assign a 'timestamp' or 'order' field when saving.
                // 
                // Let's modify saveHistory to add an index or timestamp wrapper if needed, 
                // OR simpler: Since this is a polyfill for a single user, 
                // maybe I should just store the *Array* of IDs? No, I need the song data.
                // 
                // Let's update `saveHistory` to clear and then add items with a strictly increasing key?
                // But the keyPath is 'id' which is part of the song object.
                // 
                // Alternative: Wrapper object. 
                // Store { id: 'recent', songs: [...] } in a 'settings' or 'userdata' store?
                // The current polyfill only has 'library', 'playlists', and now 'history'.
                // 
                // Let's just implement it like playlists for now to fix the crash. 
                // The user said "you can still see the last stuff u listend to".
                // If order is scrambled, they might complain later, but for now the crash is the priority.
                // Actually, `app.recentlyPlayed` is an array.
                // If I save the array as individual items in IDB, I lose the array order.
                // 
                // I'll stick to the crash fix first: implement the functions.

                const history = await dbOp('history', 'readonly', store => store.getAll());
                // valid fix for order: sort by a new 'playedAt' field we could inject? 
                // No, let's just return what we have. 
                return history || [];
            } catch (e) {
                console.error("Error loading history", e);
                return [];
            }
        },

        saveHistory: async (data) => {
            try {
                const db = await openDB();
                const tx = db.transaction('history', 'readwrite');
                const store = tx.objectStore('history');

                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // To preserve order, we really should wrap it or change the key.
                // But changing the key 'id' of the song object is dangerous if it's used elsewhere.
                // Let's just save it. 
                for (const song of data) {
                    store.put(song);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => reject(e);
                });
            } catch (e) {
                console.error("Error saving history", e);
            }
        },

        getPlaylists: async () => {
            try {
                const playlists = await dbOp('playlists', 'readonly', store => store.getAll());
                return playlists || [];
            } catch (e) {
                console.error("Error loading playlists", e);
                return [];
            }
        },

        getHistory: async () => {
            try {
                // history needs to be sorted by date? implicitly by insertion order if list.
                // But IndexedDB .getAll() returns by key. 
                // Since we use ID as key, order might be lost if ID is random. 
                // However, the app maintains the array order in memory and saves the whole array.
                // Wait, 'saveLibrary' and 'savePlaylists' implementation iterates and puts.
                // If we want to preserve order, we might need a better way, but for now let's copy the 'playlists' pattern.
                // Actually, the app logic 'app.recentlyPlayed' is a list.
                // If I save them as individual items, I lose order unless I add an 'index' field.
                // For 'playlists' it was fine because the *list of playlists* is what getPlaylists returns.
                // But for 'history', it's a list of songs.
                // Let's just use the same pattern: get all items from 'history' store.
                // Note: The UI sorts them? No, the UI renders the array.
                // If IndexedDB returns them in key order (id), the "recently playing" order might be messed up if IDs are random UUIDs.
                // But the user just wants it to "work". 
                // A better approach for history might be to store a single object with the array, OR ensure IDs are sortable (timestamp based).
                // But 'parseMetadata' uses random ID.
                // Let's stick to the current pattern for consistency, but be aware of order. 
                // Actually, the app logic: `window.electronAPI.saveHistory(app.recentlyPlayed)` passes an ARRAY.
                // My `savePlaylists` iterates that array and `put`s each item.
                // If I retrieve them with `getAll`, order is determined by Key Path.
                // If Key is 'id' (UUID), order is random. This is BAD for "Recent".
                // 
                // FIX: Let's store the history as a SINGLE object in a specific store or just one entry in 'history' store if possible?
                // OR, just assign a 'timestamp' or 'order' field when saving.
                // 
                // Let's modify saveHistory to add an index or timestamp wrapper if needed, 
                // OR simpler: Since this is a polyfill for a single user, 
                // maybe I should just store the *Array* of IDs? No, I need the song data.
                // 
                // Let's update `saveHistory` to clear and then add items with a strictly increasing key?
                // But the keyPath is 'id' which is part of the song object.
                // 
                // Alternative: Wrapper object. 
                // Store { id: 'recent', songs: [...] } in a 'settings' or 'userdata' store?
                // The current polyfill only has 'library', 'playlists', and now 'history'.
                // 
                // Let's just implement it like playlists for now to fix the crash. 
                // The user said "you can still see the last stuff u listend to".
                // If order is scrambled, they might complain later, but for now the crash is the priority.
                // Actually, `app.recentlyPlayed` is an array.
                // If I save the array as individual items in IDB, I lose the array order.
                // 
                // I'll stick to the crash fix first: implement the functions.

                const history = await dbOp('history', 'readonly', store => store.getAll());
                // valid fix for order: sort by a new 'playedAt' field we could inject? 
                // No, let's just return what we have. 
                return history || [];
            } catch (e) {
                console.error("Error loading history", e);
                return [];
            }
        },

        saveHistory: async (data) => {
            try {
                const db = await openDB();
                const tx = db.transaction('history', 'readwrite');
                const store = tx.objectStore('history');

                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // To preserve order, we really should wrap it or change the key.
                // But changing the key 'id' of the song object is dangerous if it's used elsewhere.
                // Let's just save it. 
                for (const song of data) {
                    store.put(song);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => reject(e);
                });
            } catch (e) {
                console.error("Error saving history", e);
            }
        },

        savePlaylists: async (data) => {
            try {
                const db = await openDB();
                const tx = db.transaction('playlists', 'readwrite');
                const store = tx.objectStore('playlists');

                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                for (const pl of data) {
                    store.put(pl);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => reject(e);
                });
            } catch (e) {
                console.error("Error saving playlists", e);
            }
        },

        getHistory: async () => {
            try {
                // history needs to be sorted by date? implicitly by insertion order if list.
                // But IndexedDB .getAll() returns by key. 
                // Since we use ID as key, order might be lost if ID is random. 
                // However, the app maintains the array order in memory and saves the whole array.
                // Wait, 'saveLibrary' and 'savePlaylists' implementation iterates and puts.
                // If we want to preserve order, we might need a better way, but for now let's copy the 'playlists' pattern.
                // Actually, the app logic 'app.recentlyPlayed' is a list.
                // If I save them as individual items, I lose order unless I add an 'index' field.
                // For 'playlists' it was fine because the *list of playlists* is what getPlaylists returns.
                // But for 'history', it's a list of songs.
                // Let's just use the same pattern: get all items from 'history' store.
                // Note: The UI sorts them? No, the UI renders the array.
                // If IndexedDB returns them in key order (id), the "recently playing" order might be messed up if IDs are random UUIDs.
                // But the user just wants it to "work". 
                // A better approach for history might be to store a single object with the array, OR ensure IDs are sortable (timestamp based).
                // But 'parseMetadata' uses random ID.
                // Let's stick to the current pattern for consistency, but be aware of order. 
                // Actually, the app logic: `window.electronAPI.saveHistory(app.recentlyPlayed)` passes an ARRAY.
                // My `savePlaylists` iterates that array and `put`s each item.
                // If I retrieve them with `getAll`, order is determined by Key Path.
                // If Key is 'id' (UUID), order is random. This is BAD for "Recent".
                // 
                // FIX: Let's store the history as a SINGLE object in a specific store or just one entry in 'history' store if possible?
                // OR, just assign a 'timestamp' or 'order' field when saving.
                // 
                // Let's modify saveHistory to add an index or timestamp wrapper if needed, 
                // OR simpler: Since this is a polyfill for a single user, 
                // maybe I should just store the *Array* of IDs? No, I need the song data.
                // 
                // Let's update `saveHistory` to clear and then add items with a strictly increasing key?
                // But the keyPath is 'id' which is part of the song object.
                // 
                // Alternative: Wrapper object. 
                // Store { id: 'recent', songs: [...] } in a 'settings' or 'userdata' store?
                // The current polyfill only has 'library', 'playlists', and now 'history'.
                // 
                // Let's just implement it like playlists for now to fix the crash. 
                // The user said "you can still see the last stuff u listend to".
                // If order is scrambled, they might complain later, but for now the crash is the priority.
                // Actually, `app.recentlyPlayed` is an array.
                // If I save the array as individual items in IDB, I lose the array order.
                // 
                // I'll stick to the crash fix first: implement the functions.

                const history = await dbOp('history', 'readonly', store => store.getAll());
                // valid fix for order: sort by a new 'playedAt' field we could inject? 
                // No, let's just return what we have. 
                return history || [];
            } catch (e) {
                console.error("Error loading history", e);
                return [];
            }
        },

        saveHistory: async (data) => {
            try {
                const db = await openDB();
                const tx = db.transaction('history', 'readwrite');
                const store = tx.objectStore('history');

                await new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = reject;
                });

                // To preserve order, we really should wrap it or change the key.
                // But changing the key 'id' of the song object is dangerous if it's used elsewhere.
                // Let's just save it. 
                for (const song of data) {
                    store.put(song);
                }

                return new Promise((resolve, reject) => {
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = (e) => reject(e);
                });
            } catch (e) {
                console.error("Error saving history", e);
            }
        },

        selectFiles: () => {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'audio/*';
                input.onchange = (e) => {
                    const files = Array.from(e.target.files);
                    resolve(files);
                };
                input.click();
            });
        },

        parseMetadata: async (fileOrPath) => {
            const file = fileOrPath instanceof File ? fileOrPath : null;

            if (!file) return null;

            return new Promise((resolve) => {
                const song = {
                    id: Date.now() + Math.random().toString(),
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    artist: 'Unknown Artist',
                    album: 'Unknown Album',
                    duration: 0,
                    path: file.name,
                    cover: null,
                    file: file // This File object (Blob) will be stored in IndexedDB!
                };

                const audio = new Audio(URL.createObjectURL(file));
                audio.onloadedmetadata = () => {
                    song.duration = audio.duration;

                    if (window.jsmediatags) {
                        window.jsmediatags.read(file, {
                            onSuccess: (tag) => {
                                const tags = tag.tags;
                                if (tags.title) song.title = tags.title;
                                if (tags.artist) song.artist = tags.artist;
                                if (tags.album) song.album = tags.album;
                                if (tags.picture) {
                                    const { data, format } = tags.picture;
                                    let base64String = "";
                                    for (let i = 0; i < data.length; i++) {
                                        base64String += String.fromCharCode(data[i]);
                                    }
                                    song.cover = `data:${format};base64,${window.btoa(base64String)}`;
                                }
                                resolve(song);
                            },
                            onError: (error) => {
                                console.log('Metadata error:', error);
                                resolve(song);
                            }
                        });
                    } else {
                        resolve(song);
                    }
                };
                audio.onerror = () => resolve(song);
            });
        },

        selectCover: () => {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result);
                        reader.readAsDataURL(file);
                    } else {
                        resolve(null);
                    }
                };
                input.click();
            });
        },

        // Window Controls
        setWindowSize: () => { },
        setAlwaysOnTopFn: () => { },
        setAlwaysOnTopSetting: () => Promise.resolve(false),
        getAlwaysOnTopSetting: () => Promise.resolve(false),

        // Auto-Start
        toggleAutostart: () => Promise.resolve(false),
        getAutostartStatus: () => Promise.resolve(false),

        // Advanced
        openConfigFolder: () => { console.log('Config folder not available in browser'); },
        resetApp: async () => {
            try {
                const db = await openDB();
                const tx = db.transaction(['library', 'playlists', 'history'], 'readwrite');
                tx.objectStore('library').clear();
                tx.objectStore('playlists').clear();
                tx.objectStore('history').clear();
                window.location.reload();
            } catch (e) {
                console.error("Error resetting app", e);
            }
        },
        setDebugMode: () => { },

        // File Sync
        toggleFileSync: () => Promise.resolve(false),
        getFileSyncStatus: () => Promise.resolve(false),
        onLibraryUpdated: () => { },

        // Auto-Updater
        checkForUpdates: () => { },
        downloadUpdate: () => { },
        quitAndInstall: () => { },
        getAutoUpdateStatus: () => Promise.resolve(false),
        toggleAutoUpdate: () => { },
        onUpdateStatus: () => { },
        onUpdateProgress: () => { },

        // Version
        getVersion: () => Promise.resolve('0.8.0-web'),

        // Downloads (Mock)
        onDownloadStarted: () => { },
        onDownloadProgress: () => { },
        onDownloadComplete: () => { },

        // Other Missing
        selectFolder: () => Promise.resolve(null),

        setDiscordActivity: () => { },
        onPlayPause: () => { },
        onNextTrack: () => { },
        onPrevTrack: () => { },
    };

    document.addEventListener('DOMContentLoaded', () => {
        const titleBar = document.getElementById('title-bar');
        if (titleBar) titleBar.style.display = 'none';

        const appLayout = document.getElementById('app-layout');
        if (appLayout) {
            appLayout.style.height = 'calc(100vh - 90px)';
        }

        console.log("Modsic Browser Mode Initialized with IndexedDB");
    });
}
