const Client = require('discord-rpc').Client;

class DiscordRPC {
    constructor(clientId) {
        this.clientId = 'ur client id here'; // Hardcoded ID as per original implementation
        this.rpc = null;
        this.startTimestamp = new Date();
        this.isConnected = false;

        this.currentActivity = null;
        this.lastSentActivity = null;
        this.lastUpdateTime = 0;
        this.lastConnectionAttempt = 0;

        // Try to connect initially
        this.connect();

        // Check for updates every second as requested
        // Also checks connection status
        setInterval(() => {
            this.checkConnection();
            this.checkAndSetActivity();
        }, 1000);
    }

    async connect() {
        const now = Date.now();
        // Prevent spamming connection attempts (wait at least 5 seconds between tries)
        if (now - this.lastConnectionAttempt < 5000) {
            return;
        }
        this.lastConnectionAttempt = now;

        // Cleanup existing client if it exists but isn't working
        if (this.rpc) {
            try {
                await this.rpc.destroy();
            } catch (e) {
                // Ignore cleanup errors
            }
            this.rpc = null;
        }

        this.rpc = new Client({ transport: 'ipc' });

        this.rpc.on('ready', () => {
            this.isConnected = true;
            console.log('Discord RPC Ready');
            this.checkAndSetActivity();
        });

        this.rpc.on('disconnected', () => {
            console.log('Discord RPC Disconnected');
            this.isConnected = false;
        });

        try {
            await this.rpc.login({ clientId: this.clientId });
        } catch (e) {
            console.log('Discord RPC Connection Failed (will retry):', e.message);
            this.isConnected = false;
        }
    }

    async checkConnection() {
        if (!this.isConnected) {
            await this.connect();
        }
    }

    setActivity(details, state, largeImageKey = 'modsic_logo', largeImageText = 'Moadify') {
        // Update local state instantly
        this.currentActivity = {
            details: details,
            state: state,
            startTimestamp: this.startTimestamp,
            largeImageKey: largeImageKey,
            largeImageText: largeImageText,
            instance: false,
        };
    }

    clearActivity() {
        this.currentActivity = null;
    }

    async checkAndSetActivity() {
        if (!this.isConnected) return;

        // Rate limit check: Don't send updates faster than every 2 seconds
        // This prevents being rate-limited by Discord (which causes freezing)
        const now = Date.now();
        if (this.lastUpdateTime && (now - this.lastUpdateTime) < 2000) {
            return;
        }

        // Only send if the activity has actually changed
        if (JSON.stringify(this.currentActivity) === JSON.stringify(this.lastSentActivity)) {
            return;
        }

        try {
            if (this.currentActivity) {
                await this.rpc.setActivity(this.currentActivity);
            } else {
                await this.rpc.clearActivity();
            }
            // Only update this AFTER success
            this.lastSentActivity = this.currentActivity ? JSON.parse(JSON.stringify(this.currentActivity)) : null;
            this.lastUpdateTime = now;
        } catch (e) {
            console.log('Failed to set activity (will retry):', e.message);
            // We do NOT update lastSentActivity, so it will retry on the next loop

            // If setting activity fails, implementation might have lost connection
            // Let's not assume isConnected = false immediately, but usually 'disconnected' event handles it.
            // But sometimes the socket dies without event.
        }
    }
}

module.exports = DiscordRPC;
