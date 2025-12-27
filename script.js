const app = {
    audio: null,
    audioA: new Audio(),
    audioB: new Audio(),
    fadeInterval: null,
    isCrossfading: false,
    library: [],
    playlists: [],
    queue: [],
    recentlyPlayed: [],
    currentIndex: -1,
    isPlaying: false,
    currentView: 'home',
    contextMenuTargetId: null,
    selectedSongs: new Set(),
    lastSelectedSongId: null,
    isShuffle: false,
    repeatMode: 'all', // 'off', 'all', 'one'
    activeDownloads: {},
    saveTimeout: null,
    isMiniMode: false,
    lastWindowSize: { width: 1200, height: 800 },

    init: async () => {
        try {
            // Load data
            const loadedLibrary = await window.electronAPI.getLibrary();
            app.library = Array.isArray(loadedLibrary) ? loadedLibrary : [];

            const loadedPlaylists = await window.electronAPI.getPlaylists();
            app.playlists = Array.isArray(loadedPlaylists) ? loadedPlaylists : [];

            const loadedHistory = await window.electronAPI.getHistory();
            app.recentlyPlayed = Array.isArray(loadedHistory) ? loadedHistory : [];

            // Setup Event Listeners
            app.audio = app.audioA;
            app.setupAudioListeners(app.audioA);
            app.setupAudioListeners(app.audioB);

            app.setupSettings();
            app.setupNavigation();
            app.setupPlayerControls();
            app.setupLibrary();
            app.setupPlaylists();
            app.setupWindowControls();
            app.setupIPC();
            app.setupDownloads();

            app.setupWebview();
            app.setupUpdates();


            // Set Version
            const version = await window.electronAPI.getVersion();
            const versionEl = document.getElementById('app-version');
            if (versionEl) versionEl.textContent = `v${version}`;

            // Init Custom UI Components
            CustomDropdown.convertAll();

            // Init Drag Controller
            if (typeof DragController !== 'undefined') {
                app.dragController = new DragController();
            }

            // Initial Render
            app.renderLibrary();
            app.renderPlaylistsSidebar();
            app.renderHome();

            // Ensure correct view is shown
            app.switchView(app.currentView);

            // Global Click to close context menu
            document.addEventListener('click', (e) => {
                // 1. Context Menu Closing
                if (!e.target.closest('.context-menu')) {
                    // Hide static context menu
                    const staticMenu = document.getElementById('context-menu');
                    if (staticMenu) staticMenu.classList.add('hidden');

                    // Remove dynamic context menus (like playlist menu)
                    const dynamicMenu = document.getElementById('playlist-ctx-menu');
                    if (dynamicMenu) dynamicMenu.remove();
                }

                // 2. Click Outside to Deselect
                // Only process if we are in a view with selectable items
                if (['library', 'playlist'].includes(app.currentView)) {
                    // Check if click is within the main content area where songs live
                    const isMainContent = e.target.closest('#main-content');

                    // If clicking outside main content (sidebar, player bar, modals), do nothing
                    if (!isMainContent) return;

                    const isSongRow = e.target.closest('.song-row');
                    // If clicking a song row, selection is handled by handleSongClick
                    if (isSongRow) return;

                    // Check for interactive elements (buttons, inputs) to prevent accidental deselect
                    // Note: Context menus and Modals are outside #main-content, so they are already excluded.
                    const isInteractive = e.target.closest('button, input, select, a');

                    if (!isInteractive) {
                        if (app.selectedSongs.size > 0) {
                            app.selectedSongs.clear();
                            app.updateSelectionUI();
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Initialization Error:", e);
            await CustomModal.alert("An error occurred while starting the app: " + e.message);
        }
    },

    showToast: (message, duration = 4000) => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;">&times;</button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    },


    addToRecentlyPlayed: (song) => {
        // Remove if already exists to move to top
        app.recentlyPlayed = app.recentlyPlayed.filter(s => s.id !== song.id);
        app.recentlyPlayed.unshift(song);
        // Keep max 10
        if (app.recentlyPlayed.length > 10) app.recentlyPlayed.pop();
        window.electronAPI.saveHistory(app.recentlyPlayed);
        app.renderHome();
    },

    renderHome: () => {
        if (app.currentView !== 'home') return;

        // Welcome Message
        const hour = new Date().getHours();
        let greeting = 'Welcome back';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 18) greeting = 'Good afternoon';
        else greeting = 'Good evening';

        const welcomeMsg = document.getElementById('welcome-msg');
        if (welcomeMsg) welcomeMsg.textContent = greeting;

        // Recently Played
        const recentList = document.getElementById('recently-played-list');
        if (recentList) {
            recentList.innerHTML = '';
            if (app.recentlyPlayed.length === 0) {
                recentList.innerHTML = '<div class="empty-state">Start listening to see your history here.</div>';
            } else {
                app.recentlyPlayed.forEach(song => {
                    const item = document.createElement('div');
                    item.className = 'scroll-item';
                    item.innerHTML = `
                        <div class="scroll-item-img-container">
                            <img src="${song.cover || 'assets/placeholder.svg'}" class="scroll-item-img">
                            <div class="play-overlay">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                        <div class="scroll-item-title">${song.title}</div>
                        <div class="scroll-item-subtitle">${song.artist}</div>
                    `;
                    item.onclick = () => app.playSong(song, app.recentlyPlayed);
                    recentList.appendChild(item);
                });
            }
        }

        // Top Playlists (Just showing all for now)
        const playlistList = document.getElementById('top-playlists-list');
        if (playlistList) {
            playlistList.innerHTML = '';
            if (app.playlists.length === 0) {
                playlistList.innerHTML = '<div class="empty-state">No playlists yet.</div>';
            } else {
                app.playlists.slice(0, 10).forEach(pl => {
                    const item = document.createElement('div');
                    item.className = 'scroll-item';
                    item.innerHTML = `
                        <div class="scroll-item-img-container">
                            <img src="${pl.cover || 'assets/placeholder.svg'}" class="scroll-item-img">
                            <div class="play-overlay">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                        <div class="scroll-item-title">${pl.name}</div>
                        <div class="scroll-item-subtitle">${pl.songs.length} songs</div>
                    `;
                    item.onclick = () => app.openPlaylist(pl);
                    playlistList.appendChild(item);
                });
            }
        }

        // Suggested (Random from library)
        const suggestedList = document.getElementById('suggested-list');
        if (suggestedList) {
            suggestedList.innerHTML = '';
            if (app.library.length === 0) {
                suggestedList.innerHTML = '<div class="empty-state">Add more music to get suggestions.</div>';
            } else {
                // Pick 5 random songs
                const shuffled = [...app.library].sort(() => 0.5 - Math.random());
                shuffled.slice(0, 10).forEach(song => {
                    const item = document.createElement('div');
                    item.className = 'scroll-item';
                    item.innerHTML = `
                        <div class="scroll-item-img-container">
                            <img src="${song.cover || 'assets/placeholder.svg'}" class="scroll-item-img">
                            <div class="play-overlay">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                        <div class="scroll-item-title">${song.title}</div>
                        <div class="scroll-item-subtitle">${song.artist}</div>
                    `;
                    item.onclick = () => app.playSong(song, app.library);
                    suggestedList.appendChild(item);
                });
            }
        }
    },

    setupNavigation: () => {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view) app.switchView(view);
            });
        });

        document.getElementById('import-btn-hero')?.addEventListener('click', app.importMusic);
        document.getElementById('import-btn-library').addEventListener('click', app.importMusic);

        // Online Import Navigation
        document.getElementById('online-import-btn')?.addEventListener('click', () => {
            // Logic moved to setupWebview, this just switches view
            app.switchView('online-import');
        });
        document.getElementById('online-import-back-btn')?.addEventListener('click', () => app.switchView('library'));



        // Home Search
        const searchInput = document.getElementById('home-search-input');
        const searchResults = document.getElementById('search-results');

        if (searchInput && searchResults) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                if (!query) {
                    searchResults.classList.add('hidden');
                    return;
                }

                const matches = app.library.filter(song =>
                    song.title.toLowerCase().includes(query) ||
                    song.artist.toLowerCase().includes(query)
                );

                searchResults.innerHTML = '';
                if (matches.length === 0) {
                    searchResults.innerHTML = '<div class="no-results">No songs found</div>';
                } else {
                    matches.forEach(song => {
                        const item = document.createElement('div');
                        item.className = 'search-result-item';
                        item.innerHTML = `
                            <img src="${song.cover || 'assets/placeholder.svg'}" class="search-result-img">
                            <div class="search-result-info">
                                <div class="search-result-title">${song.title}</div>
                                <div class="search-result-artist">${song.artist}</div>
                            </div>
                        `;
                        item.onclick = () => {
                            app.playSong(song, app.library);
                            searchResults.classList.add('hidden');
                            searchInput.value = '';
                        };
                        searchResults.appendChild(item);
                    });
                }
                searchResults.classList.remove('hidden');
            });

            // Hide when clicking outside
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                    searchResults.classList.add('hidden');
                }
            });
        }


    },

    switchView: (viewId) => {
        document.querySelectorAll('.view').forEach(el => {
            if (el.id === `${viewId}-view`) {
                el.classList.remove('hidden');
                setTimeout(() => el.classList.add('active'), 10);
            } else {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
        });

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        app.currentView = viewId;
        app.selectedSongs.clear(); // Clear selection on view switch
        app.lastSelectedSongId = null;
        if (viewId === 'home') app.renderHome();
    },

    setupWindowControls: () => {
        document.getElementById('min-btn').addEventListener('click', window.electronAPI.minimize);
        document.getElementById('max-btn').addEventListener('click', window.electronAPI.maximize);
        document.getElementById('close-btn').addEventListener('click', window.electronAPI.close);

        // Mini Player
        document.getElementById('mini-player-btn')?.addEventListener('click', app.toggleMiniMode);
        document.getElementById('restore-mini-btn')?.addEventListener('click', app.toggleMiniMode);
        document.getElementById('pip-btn')?.addEventListener('click', () => {
            const newState = !app.settings.alwaysOnTop;
            app.settings.alwaysOnTop = newState;
            window.electronAPI.setAlwaysOnTopSetting(newState);
            app.saveSettings();

            // Update UI
            const btn = document.getElementById('pip-btn');
            if (newState) btn.classList.add('active');
            else btn.classList.remove('active');

            // Update Settings Checkbox if visible (though mini mode hides it)
            const toggle = document.getElementById('always-on-top-toggle');
            if (toggle) toggle.checked = newState;
        });
    },

    toggleMiniMode: () => {
        app.isMiniMode = !app.isMiniMode;

        if (app.isMiniMode) {
            // Save current size and position
            const winX = window.screenX;
            const winY = window.screenY;
            app.lastWindowSize = {
                width: window.outerWidth,
                height: window.outerHeight,
                x: winX,
                y: winY
            };

            document.body.classList.add('mini-mode');

            // Calculate Position (Bottom Right)
            const width = 350;
            const height = 160;
            const screenWidth = window.screen.availWidth;
            const screenHeight = window.screen.availHeight;
            const x = screenWidth - width - 20; // 20px padding
            const y = screenHeight - height - 20;

            window.electronAPI.setWindowSize(width, height, x, y);

            // Sync PIP button state
            const pipBtn = document.getElementById('pip-btn');
            if (pipBtn) {
                // Check actual system state or settings
                window.electronAPI.getAlwaysOnTopSetting().then(isAot => {
                    app.settings.alwaysOnTop = isAot; // Ensure sync
                    if (isAot) pipBtn.classList.add('active');
                    else pipBtn.classList.remove('active');
                });
            }
        } else {
            document.body.classList.remove('mini-mode');
            // Restore size and position
            if (app.lastWindowSize) {
                window.electronAPI.setWindowSize(
                    app.lastWindowSize.width,
                    app.lastWindowSize.height,
                    app.lastWindowSize.x,
                    app.lastWindowSize.y
                );
            } else {
                window.electronAPI.setWindowSize(1200, 800);
            }
        }
    },

    debouncedSaveLibrary: () => {
        if (app.saveTimeout) clearTimeout(app.saveTimeout);
        app.saveTimeout = setTimeout(async () => {
            await window.electronAPI.saveLibrary(app.library);
            app.saveTimeout = null;
        }, 2000);
    },

    setupIPC: () => {
        window.electronAPI.onPlayPause(() => app.togglePlay());
        window.electronAPI.onNextTrack(() => app.playNext());
        window.electronAPI.onPrevTrack(() => app.playPrev());
        window.electronAPI.onLibraryUpdated(async () => {
            const loadedLibrary = await window.electronAPI.getLibrary();
            app.library = Array.isArray(loadedLibrary) ? loadedLibrary : [];
            app.renderLibrary();

            const loadedHistory = await window.electronAPI.getHistory();
            app.recentlyPlayed = Array.isArray(loadedHistory) ? loadedHistory : [];
            app.renderHome();
        });
    },

    setupWebview: () => {
        const webview = document.getElementById('import-webview');
        if (!webview) return;

        // Lazy load on view switch
        document.getElementById('online-import-btn')?.addEventListener('click', () => {
            if (webview.src === 'about:blank') {
                webview.src = 'https://spotdown.org';
            }
        });

        webview.addEventListener('dom-ready', () => {
            // Inject DOM-based Ad Blocker for stubborn overlays
            webview.executeJavaScript(`
                const removeAds = () => {
                    const elements = document.querySelectorAll('div, iframe');
                    elements.forEach(el => {
                         let style = null;
                         try { style = window.getComputedStyle(el); } catch(e) {}
                         
                         if (!style) return;

                         // Exact User Signature 1: "98% width/height overlay"
                         // properties: padding: 0px, margin: 1%, width: 98%, height: 98%, position: relative, pointer-events: none
                         if (style.width === '98%' && style.height === '98%' && style.position === 'relative' && style.pointerEvents === 'none') {
                             if (style.margin.includes('1%') || el.style.margin === '1%') {
                                 el.remove();
                                 console.log('Removed Ad Overlay (Exact Match)');
                                 return;
                             }
                         }

                         // Signature 2: Centered white modal popup
                         if (style.position === 'absolute' && style.left.includes('50%') && style.top.includes('50%')) {
                             if (style.backgroundColor === 'rgb(255, 255, 255)' || style.backgroundColor === '#ffffff') {
                                if (style.boxShadow.includes('rgba(0, 0, 0, 0.22)') || style.borderRadius.includes('1.6em')) {
                                     el.remove();
                                     console.log('Removed Ad Modal (Exact Match)');
                                     return;
                                }
                             }
                         }
                         
                         // General High Z-Index & Overlay protection
                         if (parseInt(style.zIndex) > 9999) {
                             if ((style.position === 'fixed' || style.position === 'absolute')) {
                                 // Check for common overlay descriptors in class/id
                                 const idClass = (el.id + " " + el.className).toLowerCase();
                                 if (idClass.includes('ad') || idClass.includes('banner') || idClass.includes('popup') || idClass.includes('overlay')) {
                                      el.remove();
                                 }
                             }
                         }
                    });
                };
                
                // 1. Run immediately
                removeAds();

                // 2. Run on interval (fallback)
                setInterval(removeAds, 500);

                // 3. Run on MutationObserver (Always scan)
                const observer = new MutationObserver((mutations) => {
                    removeAds();
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
                
                // CSS Injection to prevent rendering
                const style = document.createElement('style');
                style.textContent = '.ad, .ads, .advertisement, [id*="google_ads"], iframe[src*="google"], iframe[src*="doubleclick"] { display: none !important; }';
                document.head.appendChild(style);
             `);
        });
    },

    setupDownloads: () => {
        const btn = document.getElementById('download-btn');
        const panel = document.getElementById('download-panel');
        const indicator = document.getElementById('download-indicator');
        const clearBtn = document.getElementById('clear-downloads-btn');

        if (btn && panel) {
            btn.addEventListener('click', () => panel.classList.toggle('hidden'));
            document.addEventListener('click', (e) => {
                if (indicator && !indicator.contains(e.target)) {
                    panel.classList.add('hidden');
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                Object.keys(app.activeDownloads).forEach(id => {
                    if (app.activeDownloads[id].state === 'completed' || app.activeDownloads[id].state === 'interrupted') {
                        const el = document.getElementById(`dl-${id}`);
                        if (el) el.remove();
                        delete app.activeDownloads[id];
                    }
                });
                if (Object.keys(app.activeDownloads).length === 0) indicator?.classList.add('hidden');
            });
        }

        window.electronAPI.onDownloadStarted((data) => {
            app.activeDownloads[data.id] = { ...data, state: 'progressing' };
            if (indicator) indicator.classList.remove('hidden');

            const list = document.getElementById('download-list');
            if (list) {
                const item = document.createElement('div');
                item.id = `dl-${data.id}`;
                item.className = 'download-item';
                item.innerHTML = `
                     <img src="${data.cover || 'assets/placeholder.svg'}" class="download-thumb">
                     <div class="download-info">
                         <div class="download-name">${data.filename}</div>
                         <div class="download-status">
                             <span class="status-text">Downloading...</span>
                             <span class="percent-text">0%</span>
                         </div>
                         <div class="progress-bar"><div class="progress-fill"></div></div>
                     </div>
                 `;
                list.insertBefore(item, list.firstChild);
            }
        });

        window.electronAPI.onDownloadProgress((data) => {
            const dl = app.activeDownloads[data.id];
            if (dl) {
                dl.state = data.state;
                const el = document.getElementById(`dl-${data.id}`);
                if (el) {
                    const percent = Math.round(data.progress * 100);
                    const fill = el.querySelector('.progress-fill');
                    if (fill) fill.style.width = `${percent}%`;
                    const pText = el.querySelector('.percent-text');
                    if (pText) pText.textContent = `${percent}%`;
                }
            }
        });

        window.electronAPI.onDownloadComplete(async (data) => {
            const dl = app.activeDownloads[data.id];
            if (dl) {
                dl.state = 'completed';
                const el = document.getElementById(`dl-${data.id}`);
                if (el) {
                    el.classList.add('completed');
                    el.querySelector('.progress-fill').style.width = '100%';
                    el.querySelector('.status-text').textContent = 'Imported';
                    el.querySelector('.percent-text').textContent = 'Done';
                }

                try {
                    const song = await window.electronAPI.parseMetadata(data.path);
                    if (song) {
                        const exists = app.library.some(s => s.path === song.path);
                        if (!exists) {
                            app.library.push(song);
                            app.debouncedSaveLibrary(); // Use debounced save
                            app.appendSongToLibrary(song); // Add to UI
                        }
                    }
                } catch (e) {
                    console.error("Auto Import Failed", e);
                }

                // Auto-remove after 3s
                setTimeout(() => {
                    if (el) el.remove();
                    delete app.activeDownloads[data.id];
                    if (Object.keys(app.activeDownloads).length === 0 && indicator) {
                        indicator.classList.add('hidden');
                    }
                }, 3000);
            }
        });
    },

    importMusic: async () => {
        const paths = await window.electronAPI.selectFiles();
        if (!paths || paths.length === 0) return;

        app.switchView('library');

        // Process in chunks to avoid freezing
        const chunkSize = 5; // Process 5 files at a time
        const fragment = document.createDocumentFragment();
        let hasChanges = false;

        const list = document.getElementById('song-list');

        for (let i = 0; i < paths.length; i += chunkSize) {
            const chunk = paths.slice(i, i + chunkSize);
            // Parallel parse
            const promises = chunk.map(path => window.electronAPI.parseMetadata(path));
            const results = await Promise.all(promises);

            for (const song of results) {
                if (song) {
                    const exists = app.library.some(s => s.path === song.path);
                    if (!exists) {
                        app.library.push(song);
                        const row = app.createSongRow(song);
                        fragment.appendChild(row);
                        hasChanges = true;
                    }
                }
            }

            // Append batch to DOM
            if (fragment.children.length > 0) {
                list.appendChild(fragment);
                // Reset fragment is optional as appendChild moves nodes, but good practice
            }

            // Yield to main thread for UI updates
            await new Promise(r => setTimeout(r, 10));
        }

        if (hasChanges) {
            app.debouncedSaveLibrary();
        }
    },

    createSongRow: (song, songList = app.library) => {
        const row = document.createElement('div');
        row.className = 'song-row';
        row.dataset.id = song.id;
        row.innerHTML = `
            <div class="col-title">
                <img src="${song.cover || 'assets/placeholder.svg'}" class="song-img" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMzMzMiLz48L3N2Zz4='">
                <span>${song.title}</span>
            </div>
            <div class="col-artist">${song.artist}</div>
            <div class="col-album"><span class="album-link">${song.album}</span></div>
            <div class="col-duration">${app.formatTime(song.duration)}</div>
        `;

        const albumSpan = row.querySelector('.col-album .album-link');
        if (albumSpan) {
            albumSpan.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                app.openAlbum(song.album);
            });
        }

        row.addEventListener('click', (e) => app.handleSongClick(e, song, songList));
        row.addEventListener('dblclick', () => app.playSong(song, songList));
        row.addEventListener('contextmenu', (e) => app.showContextMenu(e, song));

        // Middle Click Listener (mousedown for instant reaction)
        row.addEventListener('mousedown', (e) => app.handleMiddleClick(e, song, songList));
        // Also prevent auxclick default ensuring no weird browser behavior (like opening new tab)
        row.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

        return row;
    },

    appendSongToLibrary: (song) => {
        const list = document.getElementById('song-list');
        if (list) {
            const row = app.createSongRow(song);
            list.appendChild(row);
        }
    },

    handleSongClick: (e, song, songList) => {
        if (e.ctrlKey) {
            if (app.selectedSongs.has(song.id)) {
                app.selectedSongs.delete(song.id);
            } else {
                app.selectedSongs.add(song.id);
                app.lastSelectedSongId = song.id;
            }
        } else if (e.shiftKey && app.lastSelectedSongId) {
            const lastIdx = songList.findIndex(s => s.id === app.lastSelectedSongId);
            const currIdx = songList.findIndex(s => s.id === song.id);

            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);

                if (!e.ctrlKey) {
                    app.selectedSongs.clear();
                }

                for (let i = start; i <= end; i++) {
                    app.selectedSongs.add(songList[i].id);
                }
            }
        } else {
            app.selectedSongs.clear();
            app.selectedSongs.add(song.id);
            app.lastSelectedSongId = song.id;
        }
        app.updateSelectionUI();
    },

    handleMiddleClick: (e, song, songList) => {
        // Detect Middle Click (Button 1)
        if (e.button === 1 && app.settings.middleClick) {
            e.preventDefault();
            e.stopPropagation();

            // Cancel drag if active
            if (app.dragController && app.dragController.isDragging) {
                app.dragController.cancelDrag();
                return;
            }

            // Visual Feedback (Ripple)
            const row = e.currentTarget;
            row.animate([
                { backgroundColor: 'var(--primary-color)', opacity: 0.3 },
                { backgroundColor: 'transparent', opacity: 1 }
            ], {
                duration: 300,
                easing: 'ease-out'
            });

            // Play Immediate
            app.playSong(song, songList);
        }
    },

    updateSelectionUI: () => {
        const playingSong = app.queue[app.currentIndex];
        const playingId = playingSong ? playingSong.id : null;

        document.querySelectorAll('.song-row').forEach(row => {
            const isPlaying = (row.dataset.id === playingId);

            // Playing State (Frame)
            if (isPlaying) {
                row.classList.add('playing-active');
                row.classList.remove('selected'); // Force remove selected visual even if logically selected
            } else {
                row.classList.remove('playing-active');
                // Selection State - only if not playing
                if (app.selectedSongs.has(row.dataset.id)) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });
    },

    adjustMenuPosition: (menu, x, y) => {
        const rect = menu.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let left = x;
        let top = y;

        // Prevent going off right edge
        if (left + rect.width > winWidth) {
            left = winWidth - rect.width - 10;
        }
        // Prevent going off bottom edge
        if (top + rect.height > winHeight) {
            top = winHeight - rect.height - 10;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    },


    setupLibrary: () => {
        // Placeholder if needed for future library specific setup
    },

    renderLibrary: () => {
        const list = document.getElementById('song-list');
        if (!list) return;

        list.innerHTML = '';

        if (!app.library || !Array.isArray(app.library)) {
            app.library = [];
            return;
        }

        const fragment = document.createDocumentFragment();
        app.library.forEach(song => {
            const row = app.createSongRow(song, app.library);
            fragment.appendChild(row);
        });
        list.appendChild(fragment);
        app.updateSelectionUI();

    },

    renderPlaylistsSidebar: () => {
        const list = document.getElementById('playlist-list');
        list.innerHTML = '';
        app.playlists.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'playlist-item';

            const img = document.createElement('img');
            img.className = 'playlist-item-img';
            img.src = pl.cover || 'assets/placeholder.svg';

            const span = document.createElement('span');
            span.textContent = pl.name;

            item.appendChild(img);
            item.appendChild(span);

            item.addEventListener('click', () => app.openPlaylist(pl));
            item.addEventListener('contextmenu', (e) => app.showPlaylistContextMenu(e, pl));
            list.appendChild(item);
        });
    },

    setupPlaylists: () => {
        const createBtn = document.getElementById('create-playlist-btn');
        const modal = document.getElementById('create-playlist-modal');
        const input = document.getElementById('new-playlist-name');
        const cancelBtn = document.getElementById('cancel-create-pl-btn');
        const confirmBtn = document.getElementById('confirm-create-pl-btn');

        createBtn.addEventListener('click', () => {
            input.value = '';
            modal.classList.remove('hidden');
            input.focus();
        });

        const createPlaylist = async () => {
            const name = input.value.trim();
            if (name) {
                const newPlaylist = { id: Date.now().toString(), name, songs: [] };
                app.playlists.push(newPlaylist);
                await window.electronAPI.savePlaylists(app.playlists);
                app.renderPlaylistsSidebar();
                modal.classList.add('hidden');
            }
        };

        confirmBtn.onclick = createPlaylist;

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') createPlaylist();
        });

        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    },

    openPlaylist: (playlist) => {
        app.switchView('playlist');
        const typeLabel = document.getElementById('playlist-type-label');
        if (typeLabel) typeLabel.textContent = 'Playlist';

        document.getElementById('playlist-view').dataset.playlistId = playlist.id;
        document.getElementById('playlist-title').textContent = playlist.name;
        document.getElementById('playlist-stats').textContent = `${playlist.songs.length} songs`;

        const list = document.getElementById('playlist-songs');
        list.innerHTML = '';

        // Filter songs that are in the playlist, preserving order
        const libraryMap = new Map(app.library.map(s => [s.id, s]));
        const playlistSongs = playlist.songs
            .map(id => libraryMap.get(id))
            .filter(s => s !== undefined);

        const coverImg = document.getElementById('playlist-cover');
        coverImg.src = playlist.cover || 'assets/placeholder.svg';

        coverImg.oncontextmenu = (e) => {
            app.showPlaylistCoverContextMenu(e, playlist);
        };

        playlistSongs.forEach(song => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'song-row';
            rowDiv.dataset.id = song.id;
            rowDiv.innerHTML = `
                <div class="col-title">
                    <img src="${song.cover || ''}" class="song-img" onerror="this.style.display='none'">
                    <span>${song.title}</span>
                </div>
                <div class="col-artist">${song.artist}</div>
                <div class="col-album"><span class="album-link">${song.album}</span></div>
                <div class="col-duration">${app.formatTime(song.duration)}</div>
            `;

            const albumSpan = rowDiv.querySelector('.col-album .album-link');
            if (albumSpan) {
                albumSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    app.openAlbum(song.album);
                });
            }

            rowDiv.addEventListener('click', (e) => app.handleSongClick(e, song, playlistSongs));
            rowDiv.addEventListener('dblclick', () => app.playSong(song, playlistSongs));
            rowDiv.addEventListener('contextmenu', (e) => app.showContextMenu(e, song, playlist));

            // NEW Middle Click
            rowDiv.addEventListener('mousedown', (e) => app.handleMiddleClick(e, song, playlistSongs));
            rowDiv.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

            list.appendChild(rowDiv);
        });

        app.updateSelectionUI();

    },

    openAlbum: (albumName) => {
        app.switchView('playlist');

        const typeLabel = document.getElementById('playlist-type-label');
        if (typeLabel) typeLabel.textContent = 'Album';

        // Find all songs in this album
        const albumSongs = app.library.filter(s => s.album === albumName);

        if (albumSongs.length === 0) return;

        document.getElementById('playlist-title').textContent = albumName;
        document.getElementById('playlist-stats').textContent = `${albumSongs.length} songs`;

        const coverImg = document.getElementById('playlist-cover');
        // Use the first song's cover
        coverImg.src = albumSongs[0].cover || 'assets/placeholder.svg';
        // Clear context menu for cover since it's an album
        coverImg.oncontextmenu = null;

        const list = document.getElementById('playlist-songs');
        list.innerHTML = '';

        albumSongs.forEach(song => {
            const row = app.createSongRow(song, albumSongs);
            list.appendChild(row);
        });

        app.updateSelectionUI();
    },

    showContextMenu: (e, song, playlist = null) => {
        e.preventDefault();

        // Handle selection on right click
        if (!app.selectedSongs.has(song.id)) {
            app.selectedSongs.clear();
            app.selectedSongs.add(song.id);
            app.lastSelectedSongId = song.id;
            app.updateSelectionUI();
        }

        const menu = document.getElementById('context-menu');
        // Show momentarily off-screen or invisible to measure, 
        // but 'hidden' class uses display:none, so we must remove it to get BBox.
        // To prevent flicker, we can manage opacity if needed, but usually this is fast enough.
        menu.style.opacity = '0';
        menu.classList.remove('hidden');

        app.adjustMenuPosition(menu, e.clientX, e.clientY);

        menu.style.opacity = '1';

        app.contextMenuTargetId = song.id;

        const count = app.selectedSongs.size;
        const isMulti = count > 1;

        // Elements
        const playBtn = document.getElementById('ctx-play');
        const addPlBtn = document.getElementById('ctx-add-playlist');
        const editBtn = document.getElementById('ctx-edit');
        const removePlBtn = document.getElementById('ctx-remove-playlist');
        const deleteBtn = document.getElementById('ctx-delete');

        // Toggle Visibility based on Multi selection
        if (isMulti) {
            playBtn.style.display = 'none';
            editBtn.style.display = 'none';
            addPlBtn.style.display = 'block';
            addPlBtn.textContent = `Add ${count} songs to Playlist`;
            deleteBtn.textContent = `Delete ${count} songs`;
        } else {
            playBtn.style.display = 'block';
            editBtn.style.display = 'block';
            addPlBtn.style.display = 'block';
            addPlBtn.textContent = 'Add to Playlist...';
            deleteBtn.textContent = 'Delete from Library';
        }

        // Actions
        playBtn.onclick = () => {
            app.playSong(song, app.library);
            menu.classList.add('hidden');
        };

        addPlBtn.onclick = () => {
            app.openAddToPlaylistModal(isMulti ? null : song);
            menu.classList.add('hidden');
        };


        editBtn.onclick = () => {
            app.openEditModal(song);
            menu.classList.add('hidden');
        };

        if (playlist) {
            removePlBtn.style.display = 'block';
            removePlBtn.textContent = isMulti ? `Remove ${count} from Playlist` : 'Remove from Playlist';

            removePlBtn.onclick = async () => {
                if (isMulti) {
                    playlist.songs = playlist.songs.filter(id => !app.selectedSongs.has(id));
                } else {
                    playlist.songs = playlist.songs.filter(id => id !== song.id);
                }
                await window.electronAPI.savePlaylists(app.playlists);
                app.openPlaylist(playlist);
                menu.classList.add('hidden');
            };
        } else {
            removePlBtn.style.display = 'none';
        }

        deleteBtn.onclick = async () => {
            const msg = isMulti
                ? `Delete ${count} songs from library?`
                : `Delete "${song.title}" from library?`;

            if (await CustomModal.confirm(msg)) {
                if (isMulti) {
                    app.library = app.library.filter(s => !app.selectedSongs.has(s.id));
                    app.playlists.forEach(p => {
                        p.songs = p.songs.filter(id => !app.selectedSongs.has(id));
                    });
                } else {
                    app.library = app.library.filter(s => s.id !== song.id);
                    app.playlists.forEach(p => {
                        p.songs = p.songs.filter(id => id !== song.id);
                    });
                }
                await window.electronAPI.saveLibrary(app.library);
                await window.electronAPI.savePlaylists(app.playlists);

                if (app.currentView === 'playlist' && playlist) {
                    app.openPlaylist(playlist);
                } else {
                    app.renderLibrary();
                }

                app.selectedSongs.clear();
                menu.classList.add('hidden');
            }
        };
    },


    openAddToPlaylistModal: (song) => {
        const modal = document.getElementById('add-to-playlist-modal');
        const list = document.getElementById('add-to-playlist-list');
        const cancelBtn = document.getElementById('cancel-add-pl-btn');
        const title = modal.querySelector('h2');

        list.innerHTML = '';

        const isMulti = !song && app.selectedSongs.size > 0;
        const songsToAdd = isMulti ? Array.from(app.selectedSongs) : [song.id];

        if (title) {
            title.textContent = isMulti ? `Add ${songsToAdd.length} songs to Playlist` : 'Add to Playlist';
        }

        if (app.playlists.length === 0) {
            list.innerHTML = '<div style="padding:10px; color:#888;">No playlists found. Create one first!</div>';
        } else {
            app.playlists.forEach(pl => {
                const item = document.createElement('div');
                item.className = 'playlist-option';
                item.textContent = pl.name;
                item.onclick = async () => {
                    let addedCount = 0;
                    songsToAdd.forEach(songId => {
                        if (!pl.songs.includes(songId)) {
                            pl.songs.push(songId);
                            addedCount++;
                        }
                    });

                    if (addedCount > 0) {
                        await window.electronAPI.savePlaylists(app.playlists);
                        await CustomModal.alert(isMulti
                            ? `Added ${addedCount} songs to "${pl.name}"`
                            : `Added "${song.title}" to "${pl.name}"`);
                    } else {
                        await CustomModal.alert('Selected song(s) already in playlist');
                    }
                    modal.classList.add('hidden');

                    // Clear selection if multi-add
                    if (isMulti) {
                        app.selectedSongs.clear();
                        app.updateSelectionUI();
                    }
                };
                list.appendChild(item);
            });
        }


        modal.classList.remove('hidden');

        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
        };

        const closeHandler = (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.removeEventListener('click', closeHandler);
            }
        };
        modal.addEventListener('click', closeHandler);
    },

    showPlaylistContextMenu: (e, playlist) => {
        e.preventDefault();

        const existingMenu = document.getElementById('playlist-ctx-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'playlist-ctx-menu';
        menu.className = 'context-menu';
        // Position will be set by adjustMenuPosition
        menu.style.opacity = '0';
        menu.innerHTML = `
            <div class="menu-item" id="pl-ctx-rename">Rename</div>
            <div class="menu-item delete" id="pl-ctx-delete">Delete</div>
        `;

        document.body.appendChild(menu);
        app.adjustMenuPosition(menu, e.clientX, e.clientY);
        menu.style.opacity = '1';

        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);

        document.getElementById('pl-ctx-rename').onclick = async () => {
            const newName = await CustomModal.prompt('Rename Playlist:', playlist.name);
            if (newName && newName !== playlist.name) {
                playlist.name = newName;
                await window.electronAPI.savePlaylists(app.playlists);
                app.renderPlaylistsSidebar();
                if (app.currentView === 'playlist' && document.getElementById('playlist-title').textContent === playlist.name) {
                    document.getElementById('playlist-title').textContent = newName;
                }
            }
            menu.remove();
        };

        document.getElementById('pl-ctx-delete').onclick = async () => {
            if (await CustomModal.confirm(`Delete playlist "${playlist.name}"?`)) {
                app.playlists = app.playlists.filter(p => p.id !== playlist.id);
                await window.electronAPI.savePlaylists(app.playlists);
                app.renderPlaylistsSidebar();
                if (app.currentView === 'playlist') {
                    app.switchView('home');
                }
            }
            menu.remove();
        };
    },

    showPlaylistCoverContextMenu: (e, playlist) => {
        e.preventDefault();
        const existingMenu = document.getElementById('playlist-cover-ctx-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'playlist-cover-ctx-menu';
        menu.className = 'context-menu';
        menu.style.opacity = '0';

        let menuHtml = '<div class="menu-item" id="pl-cover-ctx-change">Change Cover</div>';
        if (playlist.cover) {
            menuHtml += '<div class="menu-item" id="pl-cover-ctx-remove">Remove Cover</div>';
        }
        menu.innerHTML = menuHtml;

        document.body.appendChild(menu);
        app.adjustMenuPosition(menu, e.clientX, e.clientY);
        menu.style.opacity = '1';

        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);

        document.getElementById('pl-cover-ctx-change').onclick = async () => {
            const coverData = await window.electronAPI.selectCover();
            if (coverData) {
                playlist.cover = coverData;
                await window.electronAPI.savePlaylists(app.playlists);
                app.renderPlaylistsSidebar();
                app.openPlaylist(playlist); // Refresh view
            }
            menu.remove();
        };

        if (playlist.cover) {
            document.getElementById('pl-cover-ctx-remove').onclick = async () => {
                delete playlist.cover;
                await window.electronAPI.savePlaylists(app.playlists);
                app.renderPlaylistsSidebar();
                app.openPlaylist(playlist);
                menu.remove();
            };
        }
    },

    openEditModal: (song) => {
        const modal = document.getElementById('edit-modal');
        document.getElementById('edit-title').value = song.title;
        document.getElementById('edit-artist').value = song.artist;
        document.getElementById('edit-album').value = song.album;
        document.getElementById('edit-cover-preview').src = song.cover || '';

        modal.classList.remove('hidden');

        let newCover = null;

        document.getElementById('change-cover-btn').onclick = async () => {
            const coverData = await window.electronAPI.selectCover();
            if (coverData) {
                newCover = coverData;
                document.getElementById('edit-cover-preview').src = newCover;
            }
        };

        document.getElementById('save-edit-btn').onclick = async () => {
            song.title = document.getElementById('edit-title').value;
            song.artist = document.getElementById('edit-artist').value;
            song.album = document.getElementById('edit-album').value;
            if (newCover) song.cover = newCover;

            await window.electronAPI.saveLibrary(app.library);
            app.renderLibrary();
            if (app.currentView === 'playlist') {
                // Refresh playlist view if open
            }
            modal.classList.add('hidden');
        };

        document.getElementById('cancel-edit-btn').onclick = () => {
            modal.classList.add('hidden');
        };
    },

    setupPlayerControls: () => {
        document.getElementById('play-pause-btn').addEventListener('click', app.togglePlay);
        document.getElementById('next-btn').addEventListener('click', () => app.playNext());
        document.getElementById('prev-btn').addEventListener('click', app.playPrev);
        document.getElementById('shuffle-btn').addEventListener('click', app.toggleShuffle);
        document.getElementById('repeat-btn').addEventListener('click', app.toggleRepeat);
        document.getElementById('mute-btn').addEventListener('click', app.toggleMute);

        // Initialize Repeat State
        if (app.repeatMode === 'all') {
            const btn = document.getElementById('repeat-btn');
            btn.classList.add('active');
            btn.title = "Repeat All";
        }

        const seekBar = document.getElementById('seek-bar');
        app.updateRangeBackground(seekBar);
        seekBar.addEventListener('input', (e) => {
            const time = (e.target.value / 100) * app.audio.duration;
            app.audio.currentTime = time;
            app.updateRangeBackground(e.target);
        });

        const volumeBar = document.getElementById('volume-bar');
        app.updateRangeBackground(volumeBar);
        volumeBar.addEventListener('input', (e) => {
            app.audio.volume = e.target.value / 100;
            app.updateRangeBackground(e.target);
            if (app.audio.muted && app.audio.volume > 0) {
                app.audio.muted = false;
            }
            app.updateVolumeIcon();
        });

        // Mouse wheel volume control
        volumeBar.addEventListener('wheel', (e) => {
            e.preventDefault();
            const step = 5;
            let currentVal = parseInt(volumeBar.value);

            if (e.deltaY < 0) {
                // Scroll Up -> Increase
                currentVal = Math.min(100, currentVal + step);
            } else {
                // Scroll Down -> Decrease
                currentVal = Math.max(0, currentVal - step);
            }

            volumeBar.value = currentVal;
            app.audio.volume = currentVal / 100;
            app.updateRangeBackground(volumeBar);
            if (app.audio.muted && app.audio.volume > 0) {
                app.audio.muted = false;
            }
            app.updateVolumeIcon();
        });

        // Spacebar to play/pause
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                app.togglePlay();
            }
        });
    },

    setupAudioListeners: (audioElem) => {
        audioElem.addEventListener('timeupdate', app.updateProgress);
        audioElem.addEventListener('ended', app.handleSongEnd);
        audioElem.addEventListener('loadedmetadata', app.updateDuration);
    },

    setSongSource: (audioElem, song) => {
        if (window.electronAPI.isMock) {
            // Browser Mode
            if (song.file) {
                audioElem.src = URL.createObjectURL(song.file);
            } else if (window.fileStorage && window.fileStorage.has(song.id)) {
                audioElem.src = URL.createObjectURL(window.fileStorage.get(song.id));
            } else {
                console.error("File not found in browser memory");
                CustomModal.alert("Cannot play file. Please re-import your music for this session.");
                return;
            }
        } else {
            // Electron Mode
            const fileUrl = `file://${song.path.replace(/\\/g, '/')}`;
            audioElem.src = fileUrl;
        }
    },

    playSong: (song, queue) => {
        app.queue = queue;
        app.currentIndex = queue.findIndex(s => s.id === song.id);

        if (app.settings.crossfade > 0 && app.isPlaying && !app.isCrossfading) {
            app.performCrossfade(song, app.settings.crossfade);
        } else {
            app.playImmediate(song);
        }
    },

    playImmediate: (song) => {
        if (app.fadeInterval) {
            clearInterval(app.fadeInterval);
            app.fadeInterval = null;
            app.isCrossfading = false;
            // Stop the non-active one if it was fading
            const other = (app.audio === app.audioA) ? app.audioB : app.audioA;
            other.pause();
            other.volume = 1; // Reset volume
        }

        const audio = app.audio;
        app.setSongSource(audio, song);

        // Reset volume to master setting
        const masterVol = document.getElementById('volume-bar').value / 100;
        audio.volume = masterVol;
        audio.currentTime = 0;

        audio.play().catch(e => console.error("Playback failed:", e));
        app.isPlaying = true;
        app.commonPlayUpdates(song);
    },

    performCrossfade: (song, duration) => {
        if (app.fadeInterval) clearInterval(app.fadeInterval);

        const outgoing = app.audio;
        const incoming = (app.audio === app.audioA) ? app.audioB : app.audioA;

        app.setSongSource(incoming, song);
        incoming.currentTime = 0;
        incoming.volume = 0;

        const masterVol = document.getElementById('volume-bar').value / 100;

        incoming.play().catch(e => console.error("Crossfade play failed", e));

        // Swap control logic immediately
        app.audio = incoming;
        app.isPlaying = true;
        app.commonPlayUpdates(song);

        app.isCrossfading = true;
        const start = Date.now();
        const fadeDuration = duration * 1000;

        app.fadeInterval = setInterval(() => {
            const elapsed = Date.now() - start;
            const progress = elapsed / fadeDuration;

            if (progress >= 1) {
                // Done
                clearInterval(app.fadeInterval);
                app.fadeInterval = null;
                app.isCrossfading = false;

                incoming.volume = masterVol;
                outgoing.volume = 0;
                outgoing.pause();
                outgoing.currentTime = 0;
                outgoing.volume = masterVol; // Reset for future use
            } else {
                // Linear fade
                incoming.volume = progress * masterVol;
                outgoing.volume = (1 - progress) * masterVol;
            }
        }, 50);
    },

    commonPlayUpdates: (song) => {
        app.updatePlayerUI(song);
        app.updateMediaSession(song);
        app.updateDiscordRPC(song);
        app.addToRecentlyPlayed(song);

        app.updateSelectionUI();
    },

    togglePlay: () => {
        if (!app.audio.src) return;

        if (app.audio.paused) {
            app.audio.play();
            app.isPlaying = true;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        } else {
            app.audio.pause();
            app.isPlaying = false;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        }
        app.updatePlayerUI(app.queue[app.currentIndex]);
        app.updateDiscordRPC(app.queue[app.currentIndex]);
    },

    handleSongEnd: (e) => {
        // Only handle end event from the currently active audio
        if (e.target !== app.audio) return;

        if (app.repeatMode === 'one') {
            app.audio.currentTime = 0;
            app.audio.play();
            return;
        }
        app.playNext({ auto: true });
    },

    toggleShuffle: () => {
        app.isShuffle = !app.isShuffle;
        document.getElementById('shuffle-btn').classList.toggle('active', app.isShuffle);
    },

    toggleRepeat: () => {
        const btn = document.getElementById('repeat-btn');
        if (app.repeatMode === 'off') {
            app.repeatMode = 'all';
            btn.classList.add('active');
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v6z"/></svg>`;
            btn.title = "Repeat All";
        } else if (app.repeatMode === 'all') {
            app.repeatMode = 'one';
            btn.classList.add('active');
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v6z"/><text x="12" y="16" font-size="8" text-anchor="middle" fill="currentColor" font-weight="bold">1</text></svg>`;
            btn.title = "Repeat One";
        } else {
            app.repeatMode = 'off';
            btn.classList.remove('active');
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v6z"/></svg>`;
            btn.title = "Repeat Off";
        }
    },

    toggleMute: () => {
        app.audio.muted = !app.audio.muted;
        app.updateVolumeIcon();
    },

    updateVolumeIcon: () => {
        const btn = document.getElementById('mute-btn');
        const icon = btn.querySelector('svg');
        const vol = app.audio.volume;
        const isMuted = app.audio.muted || vol === 0;

        if (isMuted) {
            btn.title = "Unmute";
            btn.classList.add('active'); // Optional: indicates 'active' state (muted)
            icon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />`;
        } else {
            btn.title = "Mute";
            btn.classList.remove('active');
            // Show different icons for volume levels if desired, but user just asked for mute/unmute
            // Using standard 'high' volume icon for now as a default
            if (vol < 0.5) {
                // Low volume icon
                icon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />`;
            } else {
                // High volume icon
                icon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />`;
            }
        }
    },

    playNext: (options = {}) => {
        if (app.queue.length === 0) return;

        if (app.isShuffle) {
            let nextIndex;
            // Try to find a different song if possible
            let attempts = 0;
            do {
                nextIndex = Math.floor(Math.random() * app.queue.length);
                attempts++;
            } while (app.queue.length > 1 && nextIndex === app.currentIndex && attempts < 5);

            app.currentIndex = nextIndex;
        } else {
            // Stop if Repeat Off and at end (only for auto/ended event)
            if (options.auto && app.repeatMode === 'off' && app.currentIndex === app.queue.length - 1) {
                return;
            }
            app.currentIndex = (app.currentIndex + 1) % app.queue.length;
        }
        app.playSong(app.queue[app.currentIndex], app.queue);
    },

    playPrev: () => {
        if (app.queue.length === 0) return;
        app.currentIndex = (app.currentIndex - 1 + app.queue.length) % app.queue.length;
        app.playSong(app.queue[app.currentIndex], app.queue);
    },

    updatePlayerUI: (song) => {
        if (!song) return;
        document.getElementById('np-title').textContent = song.title;
        document.getElementById('np-artist').textContent = song.artist;
        document.getElementById('np-cover').src = song.cover || 'assets/placeholder.svg';

        const btn = document.getElementById('play-pause-btn');
        btn.innerHTML = app.isPlaying
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    },

    updateProgress: (e) => {
        // e might be undefined if called manually, check target if present
        if (e && e.target && e.target !== app.audio) return;

        const { currentTime, duration } = app.audio;
        if (isNaN(duration)) return;

        // Auto Crossfade Trigger
        if (app.isPlaying && app.settings.crossfade > 0 && !app.isCrossfading && duration > app.settings.crossfade) {
            const timeLeft = duration - currentTime;
            if (timeLeft <= app.settings.crossfade) {
                app.playNext({ auto: true });
            }
        }

        const percent = (currentTime / duration) * 100;
        const seekBar = document.getElementById('seek-bar');
        seekBar.value = percent;
        app.updateRangeBackground(seekBar);
        document.getElementById('current-time').textContent = app.formatTime(currentTime);
        document.getElementById('total-time').textContent = app.formatTime(duration);
    },

    updateDuration: () => {
        document.getElementById('total-time').textContent = app.formatTime(app.audio.duration);
    },

    formatTime: (seconds) => {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    },

    updateRangeBackground: (rangeInput) => {
        if (!rangeInput) return;
        const value = (rangeInput.value - rangeInput.min) / (rangeInput.max - rangeInput.min) * 100;
        rangeInput.style.setProperty('--seek-value', `${value}%`);
    },

    updateMediaSession: (song) => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.artist,
                album: song.album,
                artwork: [
                    { src: song.cover || 'icon.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                app.togglePlay();
                navigator.mediaSession.playbackState = 'playing';
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                app.togglePlay();
                navigator.mediaSession.playbackState = 'paused';
            });
            navigator.mediaSession.setActionHandler('previoustrack', app.playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', app.playNext);

            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                app.audio.currentTime = Math.max(app.audio.currentTime - (details.seekOffset || 10), 0);
            });

            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                app.audio.currentTime = Math.min(app.audio.currentTime + (details.seekOffset || 10), app.audio.duration);
            });

            // Add seek handlers for complete integration
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime && !isNaN(details.seekTime)) {
                    app.audio.currentTime = details.seekTime;
                }
            });
        }
    },

    updateDiscordRPC: (song) => {
        if (!song) return;
        if (app.settings && !app.settings.discordRpc) return;
        window.electronAPI.setDiscordActivity({
            details: `Listening to ${song.title}`,
            state: `By ${song.artist}`,
        });
    },

    // Settings
    settings: {
        theme: 'dark',
        accentColor: '#00E5FF',
        compactMode: false,
        sidebarAutohide: false,
        audioOutput: 'default',

        crossfade: 0,

        musicFolder: '',
        discordRpc: false,
        autostart: false,
        mediaKeys: true,
        debugLogs: false,
        fileSync: false,
        customTitleBar: true,
        middleClick: true
    },

    setupSettings: () => {
        app.loadSettings();
        // Store initial state to prevent visual glitches before restart
        app.initialCustomTitleBar = app.settings.customTitleBar;

        // Theme
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = app.settings.theme;
            themeSelect.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                app.settings.theme = newTheme;

                // Update accent color if theme provides one
                // app.themes is populated by applySettings, which is called at init
                if (app.themes && app.themes[newTheme] && app.themes[newTheme].accentColor) {
                    app.settings.accentColor = app.themes[newTheme].accentColor;
                    // Update picker UI
                    const colorPicker = document.getElementById('accent-color-picker');
                    if (colorPicker) colorPicker.value = app.settings.accentColor;
                }

                app.saveSettings();
                app.applySettings();
            });
        }

        // Accent Color
        const colorPicker = document.getElementById('accent-color-picker');
        if (colorPicker) {
            colorPicker.value = app.settings.accentColor;
            colorPicker.addEventListener('input', (e) => {
                app.settings.accentColor = e.target.value;
                app.saveSettings();
                app.applySettings();
            });
        }

        // Compact Mode
        const compactToggle = document.getElementById('compact-mode-toggle');
        if (compactToggle) {
            compactToggle.checked = app.settings.compactMode;
            if (app.settings.compactMode) document.body.classList.add('compact-mode');
            compactToggle.addEventListener('change', async (e) => {
                app.settings.compactMode = e.target.checked;
                if (app.settings.compactMode) document.body.classList.add('compact-mode');
                else document.body.classList.remove('compact-mode');
                await window.electronAPI.saveSettings(app.settings);
            });
        }

        // Always On Top
        const aotToggle = document.getElementById('always-on-top-toggle');
        if (aotToggle) {
            window.electronAPI.getAlwaysOnTopSetting().then(isAot => {
                aotToggle.checked = isAot;
                app.settings.alwaysOnTop = isAot;
            });
            aotToggle.addEventListener('change', async (e) => {
                await window.electronAPI.setAlwaysOnTopSetting(e.target.checked);
                app.settings.alwaysOnTop = e.target.checked;
            });
        }

        // Sidebar Autohide
        const sidebarToggle = document.getElementById('sidebar-autohide-toggle');
        if (sidebarToggle) {
            sidebarToggle.checked = app.settings.sidebarAutohide;
            sidebarToggle.addEventListener('change', (e) => {
                app.settings.sidebarAutohide = e.target.checked;
                app.saveSettings();
                app.applySettings();
            });
        }

        // Audio Output
        const outputSelect = document.getElementById('audio-output-select');
        if (outputSelect) {
            // Populate devices
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
                audioOutputs.forEach(device => {
                    if (device.deviceId !== 'default') {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        option.textContent = device.label || `Speaker ${device.deviceId.slice(0, 5)}`;
                        outputSelect.appendChild(option);
                    }
                });
                outputSelect.value = app.settings.audioOutput;

                // Refresh custom dropdown if it exists
                if (outputSelect.customDropdown) {
                    outputSelect.customDropdown.refresh();
                }
            }).catch(e => console.warn('Media Device Error:', e));

            outputSelect.addEventListener('change', (e) => {
                app.settings.audioOutput = e.target.value;
                app.saveSettings();
                app.applySettings();
            });
        }


        // Crossfade
        const crossfadeSlider = document.getElementById('crossfade-slider');
        const crossfadeVal = document.getElementById('crossfade-value');
        if (crossfadeSlider) {
            crossfadeSlider.value = app.settings.crossfade;
            if (crossfadeVal) crossfadeVal.textContent = `${app.settings.crossfade}s`;
            crossfadeSlider.addEventListener('input', (e) => {
                app.settings.crossfade = parseInt(e.target.value);
                if (crossfadeVal) crossfadeVal.textContent = `${app.settings.crossfade}s`;
                app.saveSettings();
            });
        }

        // Music Folder
        const folderBtn = document.getElementById('change-folder-btn');
        const folderPath = document.getElementById('music-folder-path');
        if (folderPath) folderPath.textContent = app.settings.musicFolder || 'No folder selected';
        if (folderBtn) {
            folderBtn.addEventListener('click', async () => {
                const path = await window.electronAPI.selectFolder();
                if (path) {
                    app.settings.musicFolder = path;
                    if (folderPath) folderPath.textContent = path;
                    app.saveSettings();
                }
            });
        }

        // Cache (Fake)
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                await CustomModal.alert('Cache cleared!');
                const cacheSizeEl = document.getElementById('cache-size');
                if (cacheSizeEl) cacheSizeEl.textContent = '0 MB';
            });
        }
        // Random cache size
        const cacheSizeEl = document.getElementById('cache-size');
        if (cacheSizeEl) cacheSizeEl.textContent = Math.floor(Math.random() * 500 + 50) + ' MB';


        // Other toggles generic binding
        const bindToggle = (id, key) => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = app.settings[key];
                el.addEventListener('change', (e) => {
                    app.settings[key] = e.target.checked;
                    app.saveSettings();
                    app.applySettings();
                });
            }
        };


        bindToggle('discord-rpc-toggle', 'discordRpc');

        // Auto-start (Custom logic to sync with system)
        const autostartEl = document.getElementById('autostart-toggle');
        if (autostartEl) {
            // Check actual system status
            window.electronAPI.getAutostartStatus().then(isEnabled => {
                app.settings.autostart = isEnabled;
                autostartEl.checked = isEnabled;
                app.saveSettings();
            });

            autostartEl.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                app.settings.autostart = enabled;
                app.saveSettings();
                await window.electronAPI.toggleAutostart(enabled);
            });
        }

        // File Sync
        const fileSyncEl = document.getElementById('manage-files-toggle');
        if (fileSyncEl) {
            window.electronAPI.getFileSyncStatus().then(isEnabled => {
                app.settings.fileSync = isEnabled;
                fileSyncEl.checked = isEnabled;
                app.saveSettings();
            });

            fileSyncEl.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                // app.settings.fileSync = enabled; // Handled in toggle-file-sync response if successful?
                // Actually better to wait for main process confirmation
                try {
                    const result = await window.electronAPI.toggleFileSync(enabled);
                    app.settings.fileSync = result;
                    app.saveSettings();
                } catch (err) {
                    console.error("Failed to toggle file sync", err);
                    e.target.checked = !enabled; // Revert
                }
            });
        }

        // Custom Title Bar
        const customTitleBarToggle = document.getElementById('custom-titlebar-toggle');
        if (customTitleBarToggle) {
            customTitleBarToggle.checked = app.settings.customTitleBar !== false;
            customTitleBarToggle.addEventListener('change', (e) => {
                app.settings.customTitleBar = e.target.checked;
                app.saveSettings();
                CustomModal.alert("Please restart the app for this change to take effect.");
            });
        }

        bindToggle('media-keys-toggle', 'mediaKeys');
        bindToggle('middle-click-toggle', 'middleClick');

        // Developer Mode Logic
        const debugToggle = document.getElementById('debug-logs-toggle');
        const openToolsBtn = document.getElementById('open-devtools-btn');

        if (debugToggle && openToolsBtn) {
            // Init State
            debugToggle.checked = app.settings.debugLogs;
            if (app.settings.debugLogs) {
                openToolsBtn.classList.remove('hidden');
            } else {
                openToolsBtn.classList.add('hidden');
            }

            debugToggle.addEventListener('change', (e) => {
                app.settings.debugLogs = e.target.checked;
                app.saveSettings();

                if (e.target.checked) {
                    openToolsBtn.classList.remove('hidden');
                } else {
                    openToolsBtn.classList.add('hidden');
                    // Optional: Close if turned off
                    // window.electronAPI.setDebugMode(false); 
                }
            });

            openToolsBtn.addEventListener('click', () => {
                openToolsBtn.textContent = "Opening...";
                window.electronAPI.setDebugMode(true);
                setTimeout(() => {
                    openToolsBtn.textContent = "Open Tools";
                }, 2000);
            });
        }

        // Reset
        const resetBtn = document.getElementById('reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (await CustomModal.confirm('Factory Reset: Delete all data (Library, Playlists, Settings) and restart?')) {
                    await window.electronAPI.resetApp();
                    localStorage.removeItem('moadify-settings');
                    location.reload();
                }
            });
        }
        const openConfigBtn = document.getElementById('open-config-btn');
        if (openConfigBtn) {
            openConfigBtn.addEventListener('click', () => {
                window.electronAPI.openConfigFolder();
            });
        }

        app.applySettings();
    },

    setupUpdates: () => {
        const updateArea = document.getElementById('update-status-area');
        const statusText = document.getElementById('update-status-text');
        const checkBtn = document.getElementById('check-for-updates-btn');
        const restartBtn = document.getElementById('restart-to-update-btn');
        const manualDlBtn = document.getElementById('manual-download-btn');
        const versionDisplay = document.getElementById('settings-version-display');
        const autoToggle = document.getElementById('auto-update-toggle');
        const progressBar = document.getElementById('update-progress-bar');
        const progressContainer = document.getElementById('update-progress-container');
        const progressPercent = document.getElementById('update-download-percent');

        if (!checkBtn) return;

        // Init Version
        window.electronAPI.getVersion().then(ver => {
            if (versionDisplay) versionDisplay.textContent = `v${ver}`;
        });

        // Init Auto-Update Toggle
        window.electronAPI.getAutoUpdateStatus().then(enabled => {
            if (autoToggle) {
                autoToggle.checked = enabled;
                autoToggle.addEventListener('change', (e) => {
                    window.electronAPI.toggleAutoUpdate(e.target.checked);
                });
            }
        });

        // Manual Check
        checkBtn.onclick = () => {
            checkBtn.disabled = true;
            statusText.textContent = "Checking...";
            if (updateArea) updateArea.classList.remove('hidden');
            window.electronAPI.checkForUpdates();
            // Re-enable safety
            setTimeout(() => { checkBtn.disabled = false; }, 5000);
        };

        if (manualDlBtn) {
            manualDlBtn.onclick = () => {
                manualDlBtn.classList.add('hidden');
                window.electronAPI.downloadUpdate();
            };
        }

        if (restartBtn) {
            restartBtn.onclick = () => {
                window.electronAPI.quitAndInstall();
            };
        }

        // Listeners
        window.electronAPI.onUpdateStatus((data) => {
            if (updateArea) updateArea.classList.remove('hidden');
            if (statusText) statusText.textContent = data.text;

            // Handle States
            if (data.status === 'checking') {
                checkBtn.disabled = true;
            } else {
                checkBtn.disabled = false;
            }

            if (data.status === 'available') {
                app.showToast(`Update available: v${data.info.version}`);
                // If auto-update is off, show download button
                if (autoToggle && !autoToggle.checked) {
                    if (manualDlBtn) manualDlBtn.classList.remove('hidden');
                }
            } else if (data.status === 'downloaded') {
                app.showToast('Update ready to install');
                if (restartBtn) restartBtn.classList.remove('hidden');
                if (progressContainer) progressContainer.classList.add('hidden');
                if (statusText) statusText.textContent = "Update downloaded. Restart to install.";
            } else if (data.status === 'error') {
                // app.showToast('Update check failed');
            } else if (data.status === 'not-available') {
                if (data.info && data.info.version) {
                    statusText.textContent = `You are up to date. Latest available: v${data.info.version}`;
                }
            }
        });

        window.electronAPI.onUpdateProgress((data) => {
            if (updateArea) updateArea.classList.remove('hidden');
            if (progressContainer) progressContainer.classList.remove('hidden');
            const percent = Math.round(data.percent);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressPercent) progressPercent.textContent = `${percent}%`;
            if (statusText) statusText.textContent = `Downloading... ${percent}%`;
        });
    },

    loadSettings: () => {
        const saved = localStorage.getItem('moadify-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                app.settings = { ...app.settings, ...parsed };
            } catch (e) { console.error('Settings load error', e); }
        }
    },

    saveSettings: () => {
        localStorage.setItem('moadify-settings', JSON.stringify(app.settings));
    },

    applySettings: () => {
        const r = document.querySelector(':root');

        const themes = {
            light: {
                vars: {
                    '--bg-color': '#ffffff',
                    '--sidebar-bg': '#f3f3f3',
                    '--card-bg': '#ffffff',
                    '--card-hover': '#e0e0e0',
                    '--player-bg': '#ffffff',
                    '--text-color': '#121212',
                    '--secondary-text': '#555555',
                    '--border-color': '#e0e0e0',
                    '--modal-bg': '#ffffff',
                    '--input-bg': '#f0f0f0',
                    '--hover-bg': 'rgba(0, 0, 0, 0.05)',
                    '--selected-bg': 'rgba(0, 0, 0, 0.1)',
                    '--context-menu-bg': '#ffffff',
                    '--search-bg': '#f3f3f3',
                    '--inverse-text': '#ffffff',
                    '--slider-bg': '#ccc',
                    '--switch-bg': '#ccc',
                    '--icon-filter': 'none'
                },
                accentColor: '#007ACC'
            },
            dark: {
                vars: {
                    '--bg-color': '#121212',
                    '--sidebar-bg': '#000000',
                    '--card-bg': '#181818',
                    '--card-hover': '#282828',
                    '--player-bg': '#181818',
                    '--text-color': '#FFFFFF',
                    '--secondary-text': '#B3B3B3',
                    '--border-color': '#333',
                    '--modal-bg': '#282828',
                    '--input-bg': '#3E3E3E',
                    '--hover-bg': 'rgba(255, 255, 255, 0.1)',
                    '--selected-bg': 'rgba(255, 255, 255, 0.2)',
                    '--context-menu-bg': '#282828',
                    '--search-bg': '#2a2a2a',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#555',
                    '--switch-bg': '#444',
                    '--icon-filter': 'invert(1)'
                },
                accentColor: '#00E5FF'
            },
            midnight: {
                vars: {
                    '--bg-color': '#05070a',
                    '--sidebar-bg': '#000000',
                    '--card-bg': '#0f131a',
                    '--card-hover': '#1a212d',
                    '--player-bg': '#020406',
                    '--text-color': '#c9d1d9',
                    '--secondary-text': '#8b949e',
                    '--border-color': '#21262d',
                    '--modal-bg': '#0d1117',
                    '--input-bg': '#161b22',
                    '--hover-bg': 'rgba(121, 184, 255, 0.1)',
                    '--selected-bg': 'rgba(121, 184, 255, 0.2)',
                    '--context-menu-bg': '#0d1117',
                    '--search-bg': '#161b22',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#21262d',
                    '--switch-bg': '#21262d',
                    '--icon-filter': 'invert(1) hue-rotate(180deg)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': 'none'
                },
                accentColor: '#0077ffff'
            },
            aurora: {
                vars: {
                    '--bg-color': 'linear-gradient(135deg, #1a0b2e 0%, #16213e 50%, #0f3460 100%)',
                    '--sidebar-bg': '#0a0a18',
                    '--card-bg': 'rgba(255, 255, 255, 0.05)',
                    '--card-hover': 'rgba(255, 255, 255, 0.1)',
                    '--player-bg': '#0a0a18',
                    '--text-color': '#ffffff',
                    '--secondary-text': '#a0a0ff',
                    '--border-color': 'rgba(255, 255, 255, 0.1)',
                    '--modal-bg': '#16213e',
                    '--input-bg': 'rgba(0, 0, 0, 0.3)',
                    '--hover-bg': 'rgba(255, 255, 255, 0.1)',
                    '--selected-bg': 'rgba(255, 255, 255, 0.2)',
                    '--context-menu-bg': '#16213e',
                    '--search-bg': 'rgba(0,0,0,0.3)',
                    '--inverse-text': '#000000',
                    '--slider-bg': 'rgba(255,255,255,0.2)',
                    '--switch-bg': 'rgba(255,255,255,0.2)',
                    '--icon-filter': 'invert(1)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': 'none'
                },
                accentColor: '#d2a8ff'
            },
            sunset: {
                vars: {
                    '--bg-color': 'linear-gradient(135deg, #4a1c40 0%, #b75d69 60%, #ffc4a3 100%)',
                    '--sidebar-bg': '#2d1b2e',
                    '--card-bg': 'rgba(255, 255, 255, 0.1)',
                    '--card-hover': 'rgba(255, 255, 255, 0.2)',
                    '--player-bg': '#1f1220',
                    '--text-color': '#fff4e6',
                    '--secondary-text': '#ffdac1',
                    '--border-color': 'rgba(255, 255, 255, 0.2)',
                    '--modal-bg': '#4a1c40',
                    '--input-bg': 'rgba(0, 0, 0, 0.3)',
                    '--hover-bg': 'rgba(255, 255, 255, 0.15)',
                    '--selected-bg': 'rgba(255, 255, 255, 0.25)',
                    '--context-menu-bg': '#4a1c40',
                    '--search-bg': 'rgba(0,0,0,0.3)',
                    '--inverse-text': '#4a1c40',
                    '--slider-bg': 'rgba(255,255,255,0.3)',
                    '--switch-bg': 'rgba(255,255,255,0.3)',
                    '--icon-filter': 'invert(1) sepia(1) saturate(3) hue-rotate(300deg)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': 'none'
                },
                accentColor: '#ffca80'
            },
            'pure-black': {
                vars: {
                    '--bg-color': '#000000',
                    '--sidebar-bg': '#000000',
                    '--card-bg': '#111111',
                    '--card-hover': '#222222',
                    '--player-bg': '#000000',
                    '--text-color': '#ffffff',
                    '--secondary-text': '#888888',
                    '--border-color': '#222',
                    '--modal-bg': '#111',
                    '--input-bg': '#222',
                    '--hover-bg': 'rgba(255, 255, 255, 0.15)',
                    '--selected-bg': 'rgba(255, 255, 255, 0.3)',
                    '--context-menu-bg': '#111',
                    '--search-bg': '#111',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#333',
                    '--switch-bg': '#333',
                    '--icon-filter': 'invert(1)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': 'none'
                },
                accentColor: '#ffffff'
            },
            forest: {
                vars: {
                    '--bg-color': '#0a140d',
                    '--sidebar-bg': '#050a06',
                    '--card-bg': '#142018',
                    '--card-hover': '#1e3024',
                    '--player-bg': '#050a06',
                    '--text-color': '#e0f0e0',
                    '--secondary-text': '#80a080',
                    '--border-color': '#1e3024',
                    '--modal-bg': '#142018',
                    '--input-bg': '#1e3024',
                    '--hover-bg': 'rgba(100, 255, 100, 0.1)',
                    '--selected-bg': 'rgba(100, 255, 100, 0.2)',
                    '--context-menu-bg': '#142018',
                    '--search-bg': '#142018',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#2e4a36',
                    '--switch-bg': '#2e4a36',
                    '--icon-filter': 'invert(1) sepia(1) saturate(5) hue-rotate(90deg)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': 'none'
                },
                accentColor: '#4caf50'
            },
            'neon-night': {
                vars: {
                    '--bg-color': '#050505',
                    '--sidebar-bg': '#000000',
                    '--card-bg': '#0a0a0a',
                    '--card-hover': '#141414',
                    '--player-bg': '#000000',
                    '--text-color': '#ffffff',
                    '--secondary-text': '#00ffcc',
                    '--border-color': '#333',
                    '--modal-bg': '#0a0a0a',
                    '--input-bg': '#111',
                    '--hover-bg': 'rgba(0, 255, 204, 0.1)',
                    '--selected-bg': 'rgba(0, 255, 204, 0.2)',
                    '--context-menu-bg': '#0a0a0a',
                    '--search-bg': '#111',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#333',
                    '--switch-bg': '#333',
                    '--icon-filter': 'invert(1) drop-shadow(0 0 2px cyan)',
                    '--bg-animation': 'none',
                    '--bg-size': 'auto',
                    '--active-glow': '0 0 10px var(--primary-color)'
                },
                accentColor: '#00ffcc'
            },
            frost: {
                vars: {
                    '--bg-color': '#f0f4f8',
                    '--sidebar-bg': '#e1e8ef',
                    '--card-bg': '#ffffff',
                    '--card-hover': '#d9e2ec',
                    '--player-bg': '#ffffff',
                    '--text-color': '#102a43',
                    '--secondary-text': '#486581',
                    '--border-color': '#d9e2ec',
                    '--modal-bg': '#f0f4f8',
                    '--input-bg': '#d9e2ec',
                    '--hover-bg': 'rgba(16, 42, 67, 0.05)',
                    '--selected-bg': 'rgba(16, 42, 67, 0.1)',
                    '--context-menu-bg': '#ffffff',
                    '--search-bg': '#ffffff',
                    '--inverse-text': '#ffffff',
                    '--slider-bg': '#bcccdc',
                    '--switch-bg': '#bcccdc',
                    '--icon-filter': 'none',
                    '--active-glow': 'none'
                },
                accentColor: '#334e68'
            },
            ember: {
                vars: {
                    '--bg-color': '#1f1a1a',
                    '--sidebar-bg': '#141010',
                    '--card-bg': '#292020',
                    '--card-hover': '#362b2b',
                    '--player-bg': '#141010',
                    '--text-color': '#ffeaea',
                    '--secondary-text': '#ff8a80',
                    '--border-color': '#362b2b',
                    '--modal-bg': '#292020',
                    '--input-bg': '#362b2b',
                    '--hover-bg': 'rgba(255, 87, 34, 0.1)',
                    '--selected-bg': 'rgba(255, 87, 34, 0.2)',
                    '--context-menu-bg': '#292020',
                    '--search-bg': '#362b2b',
                    '--inverse-text': '#000000',
                    '--slider-bg': '#4e342e',
                    '--switch-bg': '#4e342e',
                    '--icon-filter': 'invert(1) sepia(1) saturate(5) hue-rotate(-30deg)',
                    '--active-glow': '0 0 8px rgba(255, 87, 34, 0.6)'
                },
                accentColor: '#ff5722'
            },
            'deep-ocean': {
                vars: {
                    '--bg-color': 'linear-gradient(180deg, #02182b 0%, #032b4b 100%)',
                    '--sidebar-bg': '#011220',
                    '--card-bg': 'rgba(3, 43, 75, 0.5)',
                    '--card-hover': 'rgba(3, 43, 75, 0.8)',
                    '--player-bg': '#011220',
                    '--text-color': '#e0f7fa',
                    '--secondary-text': '#4fc3f7',
                    '--border-color': 'rgba(79, 195, 247, 0.2)',
                    '--modal-bg': '#02182b',
                    '--input-bg': 'rgba(0, 0, 0, 0.3)',
                    '--hover-bg': 'rgba(79, 195, 247, 0.1)',
                    '--selected-bg': 'rgba(79, 195, 247, 0.2)',
                    '--context-menu-bg': '#02182b',
                    '--search-bg': 'rgba(0,0,0,0.3)',
                    '--inverse-text': '#000000',
                    '--slider-bg': 'rgba(255,255,255,0.2)',
                    '--switch-bg': 'rgba(255,255,255,0.2)',
                    '--icon-filter': 'invert(1) hue-rotate(180deg)',
                    '--active-glow': 'none'
                },
                accentColor: '#00bcd4'
            },
            mono: {
                vars: {
                    '--bg-color': '#eaeaea',
                    '--sidebar-bg': '#f5f5f5',
                    '--card-bg': '#ffffff',
                    '--card-hover': '#dedede',
                    '--player-bg': '#ffffff',
                    '--text-color': '#000000',
                    '--secondary-text': '#666666',
                    '--border-color': '#ccc',
                    '--modal-bg': '#ffffff',
                    '--input-bg': '#f5f5f5',
                    '--hover-bg': 'rgba(0, 0, 0, 0.05)',
                    '--selected-bg': 'rgba(0, 0, 0, 0.1)',
                    '--context-menu-bg': '#ffffff',
                    '--search-bg': '#f5f5f5',
                    '--inverse-text': '#ffffff',
                    '--slider-bg': '#999',
                    '--switch-bg': '#999',
                    '--icon-filter': 'grayscale(100%)',
                    '--active-glow': 'none'
                },
                accentColor: '#333333'
            },
            galaxy: {
                vars: {
                    '--bg-color': 'linear-gradient(270deg, #1a0b2e, #4a1c40, #16213e)',
                    '--bg-size': '600% 600%',
                    '--bg-animation': 'galaxyGradient 30s ease infinite',
                    '--sidebar-bg': 'rgba(10, 10, 24, 0.9)',
                    '--card-bg': 'rgba(255, 255, 255, 0.05)',
                    '--card-hover': 'rgba(255, 255, 255, 0.1)',
                    '--player-bg': '#0f0f1b',
                    '--text-color': '#ffffff',
                    '--secondary-text': '#d2a8ff',
                    '--border-color': 'rgba(255, 255, 255, 0.1)',
                    '--modal-bg': '#16213e',
                    '--input-bg': 'rgba(0, 0, 0, 0.4)',
                    '--hover-bg': 'rgba(210, 168, 255, 0.1)',
                    '--selected-bg': 'rgba(210, 168, 255, 0.2)',
                    '--context-menu-bg': '#1a0b2e',
                    '--search-bg': 'rgba(0,0,0,0.3)',
                    '--inverse-text': '#000000',
                    '--slider-bg': 'rgba(255,255,255,0.2)',
                    '--switch-bg': 'rgba(255,255,255,0.2)',
                    '--icon-filter': 'invert(1)',
                    '--active-glow': 'none'
                },
                accentColor: '#d2a8ff'
            },
            'frosted-glass': {
                vars: {
                    '--bg-color': 'linear-gradient(135deg, #1f2937, #111827, #0f172a)',
                    '--bg-size': '200% 200%',
                    '--bg-animation': 'galaxyGradient 20s ease infinite',
                    '--sidebar-bg': 'rgba(31, 41, 55, 0.4)',
                    '--card-bg': 'rgba(255, 255, 255, 0.05)',
                    '--card-hover': 'rgba(255, 255, 255, 0.1)',
                    '--player-bg': 'rgba(17, 24, 39, 0.3)',
                    '--text-color': '#f3f4f6',
                    '--secondary-text': '#9ca3af',
                    '--border-color': 'rgba(255, 255, 255, 0.1)',
                    '--modal-bg': 'rgba(31, 41, 55, 0.7)',
                    '--input-bg': 'rgba(0, 0, 0, 0.2)',
                    '--hover-bg': 'rgba(255, 255, 255, 0.1)',
                    '--selected-bg': 'rgba(255, 255, 255, 0.2)',
                    '--context-menu-bg': 'rgba(31, 41, 55, 0.9)',
                    '--search-bg': 'rgba(0, 0, 0, 0.2)',
                    '--inverse-text': '#000000',
                    '--slider-bg': 'rgba(255, 255, 255, 0.2)',
                    '--switch-bg': 'rgba(255, 255, 255, 0.2)',
                    '--icon-filter': 'invert(1)',
                    '--active-glow': '0 0 10px rgba(255, 255, 255, 0.3)',
                    '--backdrop-filter': 'blur(20px)'
                },
                accentColor: '#38bdf8'
            }
        };

        // Expose themes to app for settings use
        app.themes = themes;

        const applyTheme = (themeName) => {
            let theme = themes[themeName] || themes['dark'];

            // Handle System
            if (themeName === 'system') {
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                    theme = themes['light'];
                } else {
                    theme = themes['dark'];
                }
            }

            // Apply Variables
            Object.entries(theme.vars).forEach(([key, value]) => {
                r.style.setProperty(key, value);
            });

            // Handle optional vars defaults
            if (!theme.vars['--backdrop-filter']) r.style.setProperty('--backdrop-filter', 'none');
        };

        applyTheme(app.settings.theme);

        // Accent
        r.style.setProperty('--primary-color', app.settings.accentColor);

        // Compact Mode
        if (app.settings.compactMode) {
            document.body.classList.add('compact');
        } else {
            document.body.classList.remove('compact');
        }

        // Sidebar Auto-hide
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            if (app.settings.sidebarAutohide) {
                sidebar.classList.add('autohide'); // Needs CSS support
            } else {
                sidebar.classList.remove('autohide');
            }
        }

        // Audio Output
        if (app.audio.setSinkId && app.settings.audioOutput !== 'default') {
            app.audio.setSinkId(app.settings.audioOutput).catch(e => console.warn(e));
        }

        // Custom Title Bar
        const titleBar = document.getElementById('title-bar');
        // Use initial state to match current window frame
        const useTitleBar = (typeof app.initialCustomTitleBar !== 'undefined')
            ? app.initialCustomTitleBar
            : app.settings.customTitleBar;

        if (useTitleBar === false) {
            if (titleBar) titleBar.classList.add('hidden');
            r.style.setProperty('--title-bar-height', '0px');
        } else {
            if (titleBar) titleBar.classList.remove('hidden');
            r.style.setProperty('--title-bar-height', '30px');
        }
    }
};

window.addEventListener('DOMContentLoaded', app.init);
