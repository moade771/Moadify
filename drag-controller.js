class DragController {
    constructor() {
        this.isDragging = false;
        this.dragThreshold = 5;
        this.startX = 0;
        this.startY = 0;
        this.ghostEl = null;
        this.dropIndicator = null;
        this.draggedSongIds = [];
        this.targetContainer = null;
        this.targetIndex = -1; // -1 means end of list, or specific logic
        this.view = null; // 'library' or 'playlist'
        this.scrollParent = null;
        this.scrollSpeed = 0;
        this.scrollInterval = null;
        this.scrollZoneSize = 50; // px
        this.maxScrollSpeed = 15; // px per frame

        // Bind methods
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        this.init();
    }

    init() {
        document.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('keydown', this.onKeyDown);
    }

    onMouseDown(e) {
        if (e.button !== 0) return; // Only Left Click

        const row = e.target.closest('.song-row');
        if (!row) return;

        // Check if we are in valid view
        const libraryList = document.getElementById('song-list');
        const playlistList = document.getElementById('playlist-songs');

        if (libraryList && libraryList.contains(row)) {
            this.view = 'library';
            this.container = libraryList;
        } else if (playlistList && playlistList.contains(row)) {
            this.view = 'playlist';
            this.container = playlistList;
        } else {
            return;
        }

        this.startX = e.clientX;
        this.startY = e.clientY;

        const songId = row.dataset.id;

        // If clicking on an unselected item, we don't change selection yet (wait for click), 
        // essentially we will drag JUST this one if drag starts.
        // If clicking on a selected item, we drag all selected items.

        if (app.selectedSongs.has(songId)) {
            this.draggedSongIds = Array.from(app.selectedSongs);
        } else {
            this.draggedSongIds = [songId];
        }

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    onMouseMove(e) {
        if (!this.isDragging) {
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;
            if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
                this.startDrag(e);
            }
        }

        if (this.isDragging) {
            this.updateDrag(e);
        }
    }

    startDrag(e) {
        this.isDragging = true;
        document.body.classList.add('dragging-active'); // Use CSS class for cursor

        // Select the item if it wasn't selected (and we are dragging it)
        // If we started dragging an unselected item, likely the user intends to drag just that.
        // We should ensure it is visually selected or handled.
        // However, standard behavior: if I drag an unselected item, it becomes selected.
        if (this.draggedSongIds.length === 1 && !app.selectedSongs.has(this.draggedSongIds[0])) {
            app.selectedSongs.clear();
            app.selectedSongs.add(this.draggedSongIds[0]);
            app.updateSelectionUI();
        }

        // Create Ghost
        this.createGhost();
        this.updateGhostPosition(e.clientX, e.clientY);

        // Create Drop Indicator
        this.dropIndicator = document.createElement('div');
        this.dropIndicator.className = 'drop-indicator';
        this.container.appendChild(this.dropIndicator);

        // Setup Auto Scroll
        this.scrollParent = this.container.closest('.view'); // The scrollable container
        this.startAutoScroll();
    }

    createGhost() {
        this.ghostEl = document.createElement('div');
        this.ghostEl.className = 'drag-ghost';

        const count = this.draggedSongIds.length;
        let text = '';
        if (count === 1) {
            // Find song title
            const song = app.library.find(s => s.id === this.draggedSongIds[0]);
            text = song ? song.title : 'Unknown Song';
        } else {
            text = `Moving ${count} songs`;
        }

        this.ghostEl.textContent = text;
        document.body.appendChild(this.ghostEl);
    }

    updateDrag(e) {
        this.updateGhostPosition(e.clientX, e.clientY);

        // Auto Scroll Calculation
        if (this.scrollParent) {
            const rect = this.scrollParent.getBoundingClientRect();
            // Calculate relative to viewport logic or element logic?
            // getBoundingClientRect is viewport relative. e.clientY is viewport relative.

            const distTop = e.clientY - rect.top;
            const distBottom = rect.bottom - e.clientY;

            this.scrollSpeed = 0;

            if (distTop < this.scrollZoneSize) {
                // Scroll Up
                // Speed increases as we get closer to edge
                const ratio = 1 - (Math.max(0, distTop) / this.scrollZoneSize);
                this.scrollSpeed = -this.maxScrollSpeed * ratio;
            } else if (distBottom < this.scrollZoneSize) {
                // Scroll Down
                const ratio = 1 - (Math.max(0, distBottom) / this.scrollZoneSize);
                this.scrollSpeed = this.maxScrollSpeed * ratio;
            }
        }

        // Hit testing
        // We only allow reordering within the SAME container for now (as per requirements Scope)
        // "Dragging between playlists is not required unless explicitly supported"

        // Use document.elementFromPoint if we are scrolling?
        // Relying on original hit detection might fail if we scrolled.
        // Actually, updateDrag is called on mousemove. 
        // If we are just scrolling without moving mouse, we should update hit test too.
        // So we will extract hit test logic to a separate method `checkDropTarget(x, y)`
        // and call it from scroll loop too.

        this.checkDropTarget(e.clientX, e.clientY);
    }

    startAutoScroll() {
        if (this.scrollInterval) return;
        this.scrollInterval = requestAnimationFrame(this.scrollLoop.bind(this));
    }

    stopAutoScroll() {
        if (this.scrollInterval) {
            cancelAnimationFrame(this.scrollInterval);
            this.scrollInterval = null;
        }
        this.scrollSpeed = 0;
    }

    scrollLoop() {
        if (!this.isDragging) {
            this.stopAutoScroll();
            return;
        }

        if (this.scrollSpeed !== 0 && this.scrollParent) {
            this.scrollParent.scrollTop += this.scrollSpeed;

            // Re-check drop target based on current mouse position
            // We need to track last known mouse position
            if (this.lastX !== undefined && this.lastY !== undefined) {
                this.checkDropTarget(this.lastX, this.lastY);
            }
        }

        this.scrollInterval = requestAnimationFrame(this.scrollLoop.bind(this));
    }

    checkDropTarget(x, y) {
        // Updated hit testing logic extracted from updateDrag
        // Check if mouse is over the container
        const containerRect = this.container.getBoundingClientRect();
        // Allow dropping even if slightly outside to the left/right, but mainly check Y
        // But strictest is within rect.

        // Relaxed constraints for scrolling usability:
        // Even if we are over the scrollbar (right side), we still might want to reorder?

        if (x < containerRect.left || x > containerRect.right + 20 ||
            y < containerRect.top || y > containerRect.bottom) {
            this.hideDropIndicator();
            this.targetIndex = -1;
            return;
        }

        // Find closest row
        // Optimization: only search rows in viewport?
        // querySelectorAll returns all, but getBoundingClientRect accounts for scroll.
        // For 500 songs, iterating might be ok, but let's be aware.
        const rows = Array.from(this.container.querySelectorAll('.song-row'));

        let closestRow = null;
        let minDist = Infinity;
        let insertAfter = false;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rect = row.getBoundingClientRect();

            // Optimization: Skip if row is totally off screen
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

            const midY = rect.top + rect.height / 2;
            const dist = Math.abs(y - midY);

            if (dist < minDist) {
                minDist = dist;
                closestRow = row;
                insertAfter = y > midY;
            }
        }

        if (closestRow) {
            this.showDropIndicator(closestRow, insertAfter);
            // Calculate target index... actually we rely on DOM order for final drop,
            // so we don't strictly need targetIndex for the logic, but we keep it.
            // But wait, my executeReorder relies on dropIndicator position in DOM.
            // So visual update IS the state update for `executeReorder`.
            this.targetIndex = 1; // Just flag as valid
        } else {
            // If we are at the very bottom of the list and below valid rows
            // Or empty list
            if (rows.length === 0) {
                this.targetIndex = 0;
                // Handle empty list case if needed
            } else {
                // Check if we are below the last item
                const lastRow = rows[rows.length - 1];
                const lastRect = lastRow.getBoundingClientRect();
                if (y > lastRect.bottom) {
                    this.showDropIndicator(lastRow, true);
                    this.targetIndex = rows.length;
                }
            }
        }
    }

    updateGhostPosition(x, y) {
        this.lastX = x;
        this.lastY = y;
        if (this.ghostEl) {
            this.ghostEl.style.left = `${x + 10}px`;
            this.ghostEl.style.top = `${y + 10}px`;
        }
    }

    showDropIndicator(targetRow, after) {
        if (!this.dropIndicator) return;

        this.dropIndicator.style.display = 'block';
        if (after) {
            targetRow.after(this.dropIndicator);
        } else {
            targetRow.before(this.dropIndicator);
        }
    }

    hideDropIndicator() {
        if (this.dropIndicator) {
            this.dropIndicator.style.display = 'none';
        }
    }

    onMouseUp(e) {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);

        if (this.isDragging) {
            this.finishDrag();
            e.preventDefault();
            e.stopPropagation(); // Stop click event

            // Hack to prevent click event propogation which happens after mouseup
            // We can capture it in capture phase
            const captureClick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                document.removeEventListener('click', captureClick, true);
            };
            document.addEventListener('click', captureClick, true);
            setTimeout(() => document.removeEventListener('click', captureClick, true), 100);
        }
    }

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isDragging) {
            this.cancelDrag();
        }
    }

    cancelDrag() {
        this.cleanup();
    }

    async finishDrag() {
        // Perform Reorder
        if (this.targetIndex !== -1 && this.draggedSongIds.length > 0) {
            await this.executeReorder();
        }
        this.cleanup();
    }

    cleanup() {
        this.stopAutoScroll();
        this.scrollParent = null;
        this.isDragging = false;
        document.body.classList.remove('dragging-active');
        if (this.ghostEl) this.ghostEl.remove();
        if (this.dropIndicator) this.dropIndicator.remove();
        this.ghostEl = null;
        this.dropIndicator = null;
        this.draggedSongIds = [];
        this.targetIndex = -1;
    }

    async executeReorder() {
        // Get current list of ID
        let currentList = [];
        if (this.view === 'library') {
            currentList = app.library.map(s => s.id);
        } else if (this.view === 'playlist') {
            const playlistTitle = document.getElementById('playlist-title').textContent;
            const playlist = app.playlists.find(p => p.name === playlistTitle);
            if (!playlist) return;
            currentList = playlist.songs; // These are IDs
        }

        // Remove dragged items
        const newOrder = currentList.filter(id => !this.draggedSongIds.includes(id));

        // Insert at target index
        // We need to adjust target index because removing items shifts indices
        // But logic is cleaner if we map visual index to logic.
        // The targetIndex is based on visual rows (which include the dragged ones? No, usually not if we didn't hide them).
        // Wait, I didn't hide the dragged items. So visual index includes them.

        // Correct approach:
        // Get all song IDs from the DOM (excluding the ghost/indicator) IN ORDER.
        // The DOM currently has the Indicator in the new position.
        // We can just iterate the DOM rows to get the new order, IGNORING the `draggedSongIds` old positions?
        // No, I didn't move the actual DOM rows of dragged items. They stayed in place.
        // So I rely on `this.targetIndex` relative to the list layout.

        // Let's refine targetIndex logic.
        // `targetIndex` is the index in the Visual List where we want to insert.
        // Since we didn't remove rows from DOM, the indices match the current state.
        // But we need to account for whether the dragged items were BEFORE the target index.

        // Easier way: 
        // 1. Get List of all IDs currently in DOM.
        // 2. Remove dragged IDs.
        // 3. Insert dragged IDs at processed index.

        // Calculate insert position in the filtered list.
        // The `targetRow` used for `targetIndex` calculation tells us where to drop.

        // Let's just use the `dropIndicator`. It is in the DOM.
        // We can iterate over children of container.
        // Construct new ID list.
        const container = this.container;
        const newIdList = [];
        const siblings = Array.from(container.children);

        for (const child of siblings) {
            if (child === this.dropIndicator) {
                // Insert dragged items here
                newIdList.push(...this.draggedSongIds);
            }
            if (child.classList.contains('song-row')) {
                const id = child.dataset.id;
                if (!this.draggedSongIds.includes(id)) {
                    newIdList.push(id);
                }
            }
        }

        // Apply changes
        if (this.view === 'library') {
            // Reorder app.library based on newIdList
            const newLibrary = [];
            // Map IDs back to objects
            // Use a map for O(1) lookup
            const libMap = new Map(app.library.map(s => [s.id, s]));

            for (const id of newIdList) {
                if (libMap.has(id)) newLibrary.push(libMap.get(id));
            }

            // Any missing? (Shouldn't be, but safety)
            // If dragging items that were not in view? No, we drag only visible.

            app.library = newLibrary;
            app.renderLibrary(); // Re-render to persist order visual
            app.debouncedSaveLibrary(); // Save

        } else if (this.view === 'playlist') {
            const playlistTitle = document.getElementById('playlist-title').textContent;
            const playlist = app.playlists.find(p => p.name === playlistTitle);
            if (playlist) {
                playlist.songs = newIdList;
                await window.electronAPI.savePlaylists(app.playlists);
                // Refresh view
                app.openPlaylist(playlist);
            }
        }
    }
}
