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

            // Init Custom UI Components
            CustomDropdown.convertAll();

            // Initial Render
            app.renderLibrary();
            app.renderPlaylistsSidebar();
            app.renderHome();

            // Ensure correct view is shown
            app.switchView(app.currentView);

            // Global Click to close context menu
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.context-menu')) {
                    // Hide static context menu
                    const staticMenu = document.getElementById('context-menu');
                    if (staticMenu) staticMenu.classList.add('hidden');

                    // Remove dynamic context menus (like playlist menu)
                    const dynamicMenu = document.getElementById('playlist-ctx-menu');
                    if (dynamicMenu) dynamicMenu.remove();
                }
            });
        } catch (e) {
            console.error("Initialization Error:", e);
            await CustomModal.alert("An error occurred while starting the app: " + e.message);
        }
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
                    matches.slice(0, 10).forEach(song => {
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
    },

    setupIPC: () => {
        window.electronAPI.onPlayPause(() => app.togglePlay());
        window.electronAPI.onNextTrack(() => app.playNext());
        window.electronAPI.onPrevTrack(() => app.playPrev());
    },

    importMusic: async () => {
        const paths = await window.electronAPI.selectFiles();
        if (!paths || paths.length === 0) return;

        app.switchView('library');

        // Process sequentially to avoid freezing, but update UI as we go
        for (const filePath of paths) {
            try {
                const song = await window.electronAPI.parseMetadata(filePath);
                if (song) {
                    // Check if song already exists
                    const exists = app.library.some(s => s.path === song.path);
                    if (!exists) {
                        app.library.push(song);
                        app.appendSongToLibrary(song);
                    }
                }
            } catch (e) {
                console.error("Error parsing", filePath, e);
            }
        }
        await window.electronAPI.saveLibrary(app.library);
    },

    appendSongToLibrary: (song) => {
        const list = document.getElementById('song-list');
        const row = document.createElement('div');
        row.className = 'song-row';
        row.dataset.id = song.id;
        row.innerHTML = `
            <div class="col-title">
                <img src="${song.cover || 'assets/placeholder.svg'}" class="song-img" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMzMzMiLz48L3N2Zz4='">
                <span>${song.title}</span>
            </div>
            <div class="col-artist">${song.artist}</div>
            <div class="col-album">${song.album}</div>
            <div class="col-duration">${app.formatTime(song.duration)}</div>
        `;

        row.addEventListener('click', (e) => app.handleSongClick(e, song, app.library));
        row.addEventListener('dblclick', () => app.playSong(song, app.library));
        row.addEventListener('contextmenu', (e) => app.showContextMenu(e, song));
        list.appendChild(row);
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

    updateSelectionUI: () => {
        document.querySelectorAll('.song-row').forEach(row => {
            if (app.selectedSongs.has(row.dataset.id)) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
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
            const row = document.createElement('div');
            row.className = 'song-row';
            row.dataset.id = song.id;
            row.innerHTML = `
                <div class="col-title">
                    <img src="${song.cover || 'assets/placeholder.svg'}" class="song-img" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMzMzMiLz48L3N2Zz4='">
                    <span>${song.title}</span>
                </div>
                <div class="col-artist">${song.artist}</div>
                <div class="col-album">${song.album}</div>
                <div class="col-duration">${app.formatTime(song.duration)}</div>
            `;

            row.addEventListener('click', (e) => app.handleSongClick(e, song, app.library));
            row.addEventListener('dblclick', () => app.playSong(song, app.library));
            row.addEventListener('contextmenu', (e) => app.showContextMenu(e, song));
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
        document.getElementById('playlist-title').textContent = playlist.name;
        document.getElementById('playlist-stats').textContent = `${playlist.songs.length} songs`;

        const list = document.getElementById('playlist-songs');
        list.innerHTML = '';

        // Filter songs that are in the playlist
        const playlistSongs = app.library.filter(s => playlist.songs.includes(s.id));

        const coverImg = document.getElementById('playlist-cover');
        coverImg.src = playlist.cover || 'assets/placeholder.svg';

        coverImg.oncontextmenu = (e) => {
            app.showPlaylistCoverContextMenu(e, playlist);
        };

        playlistSongs.forEach(song => {
            const row = document.createElement('div');
            row.className = 'song-row';
            row.dataset.id = song.id;
            row.innerHTML = `
                <div class="col-title">
                    <img src="${song.cover || ''}" class="song-img" onerror="this.style.display='none'">
                    <span>${song.title}</span>
                </div>
                <div class="col-artist">${song.artist}</div>
                <div class="col-album">${song.album}</div>
                <div class="col-duration">${app.formatTime(song.duration)}</div>
            `;
            row.addEventListener('click', (e) => app.handleSongClick(e, song, playlistSongs));
            row.addEventListener('dblclick', () => app.playSong(song, playlistSongs));
            row.addEventListener('contextmenu', (e) => app.showContextMenu(e, song, playlist));
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
        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;
        menu.classList.remove('hidden');

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
        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;
        menu.innerHTML = `
            <div class="menu-item" id="pl-ctx-rename">Rename</div>
            <div class="menu-item delete" id="pl-ctx-delete">Delete</div>
        `;

        document.body.appendChild(menu);

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
        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;

        let menuHtml = '<div class="menu-item" id="pl-cover-ctx-change">Change Cover</div>';
        if (playlist.cover) {
            menuHtml += '<div class="menu-item" id="pl-cover-ctx-remove">Remove Cover</div>';
        }
        menu.innerHTML = menuHtml;

        document.body.appendChild(menu);

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

        // Select the currently playing song
        app.selectedSongs.clear();
        app.selectedSongs.add(song.id);
        app.lastSelectedSongId = song.id;
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
        debugLogs: false
    },

    setupSettings: () => {
        app.loadSettings();

        // Theme
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = app.settings.theme;
            themeSelect.addEventListener('change', (e) => {
                app.settings.theme = e.target.value;
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
            compactToggle.addEventListener('change', (e) => {
                app.settings.compactMode = e.target.checked;
                app.saveSettings();
                app.applySettings();
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
        bindToggle('autostart-toggle', 'autostart');
        bindToggle('media-keys-toggle', 'mediaKeys');
        bindToggle('debug-logs-toggle', 'debugLogs');

        // Reset
        const resetBtn = document.getElementById('reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (await CustomModal.confirm('Reset all settings to default?')) {
                    localStorage.removeItem('moadify-settings');
                    location.reload();
                }
            });
        }
        const openConfigBtn = document.getElementById('open-config-btn');
        if (openConfigBtn) {
            openConfigBtn.addEventListener('click', async () => {
                await CustomModal.alert('Config folder is at: ' + (app.settings.musicFolder || 'UserData'));
            });
        }

        app.applySettings();
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

        // Theme
        const applyTheme = (theme) => {
            if (theme === 'light') {
                r.style.setProperty('--bg-color', '#ffffff');
                r.style.setProperty('--sidebar-bg', '#f3f3f3');
                r.style.setProperty('--card-bg', '#ffffff');
                r.style.setProperty('--card-hover', '#e0e0e0');
                r.style.setProperty('--player-bg', '#ffffff');
                r.style.setProperty('--text-color', '#121212');
                r.style.setProperty('--secondary-text', '#555555');
                r.style.setProperty('--border-color', '#e0e0e0');
                r.style.setProperty('--modal-bg', '#ffffff');
                r.style.setProperty('--input-bg', '#f0f0f0');
                r.style.setProperty('--hover-bg', 'rgba(0, 0, 0, 0.05)');
                r.style.setProperty('--selected-bg', 'rgba(0, 0, 0, 0.1)');
                r.style.setProperty('--context-menu-bg', '#ffffff');
                r.style.setProperty('--search-bg', '#f3f3f3');
                r.style.setProperty('--inverse-text', '#ffffff');
            } else {
                // Dark (Default)
                r.style.setProperty('--bg-color', '#121212');
                r.style.setProperty('--sidebar-bg', '#000000');
                r.style.setProperty('--card-bg', '#181818');
                r.style.setProperty('--card-hover', '#282828');
                r.style.setProperty('--player-bg', '#181818');
                r.style.setProperty('--text-color', '#FFFFFF');
                r.style.setProperty('--secondary-text', '#B3B3B3');
                r.style.setProperty('--border-color', '#333');
                r.style.setProperty('--modal-bg', '#282828');
                r.style.setProperty('--input-bg', '#3E3E3E');
                r.style.setProperty('--hover-bg', 'rgba(255, 255, 255, 0.1)');
                r.style.setProperty('--selected-bg', 'rgba(255, 255, 255, 0.2)');
                r.style.setProperty('--context-menu-bg', '#282828');
                r.style.setProperty('--search-bg', '#2a2a2a');
                r.style.setProperty('--inverse-text', '#000000');
            }
        };

        if (app.settings.theme === 'light') {
            applyTheme('light');
        } else if (app.settings.theme === 'dark') {
            applyTheme('dark');
        } else {
            // System default
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                applyTheme('light');
            } else {
                applyTheme('dark');
            }
        }

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
    }
};

window.addEventListener('DOMContentLoaded', app.init);
