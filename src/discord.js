const Client = require('discord-rpc').Client;

class DiscordRPC {
    constructor(clientId) {
        this.clientId = clientId || 'ur id here';
        this.rpc = null;
        this.startTimestamp = new Date();
        this.isConnected = false;

        this.activityQueue = [];
        this.isProcessing = false;
        this.lastUpdateTime = 0;
        this.lastConnectionAttempt = 0;

        // Try to connect initially
        this.connect();

        // Keep-alive loop
        setInterval(() => {
            this.checkConnection();
        }, 5000);
    }

    async connect() {
        const now = Date.now();
        if (now - this.lastConnectionAttempt < 5000) return;
        this.lastConnectionAttempt = now;

        // Cleanup
        if (this.rpc) {
            try { await this.rpc.destroy(); } catch (e) { }
            this.rpc = null;
        }

        this.rpc = new Client({ transport: 'ipc' });

        this.rpc.on('ready', () => {
            this.isConnected = true;
            console.log('Discord RPC Ready');
            this.processQueue();
        });

        this.rpc.on('disconnected', () => {
            console.log('Discord RPC Disconnected');
            this.isConnected = false;
        });

        try {
            await this.rpc.login({ clientId: this.clientId });
        } catch (e) {
            console.log('Discord RPC Connection Failed:', e.message);
            this.isConnected = false;
            this.rpc = null;
        }
    }

    async checkConnection() {
        if (!this.isConnected && (!this.rpc || !this.isConnected)) {
            await this.connect();
        }
    }

    setActivity(details, state, largeImageKey = 'modsic_logo', largeImageText = 'Moadify') {
        const activity = {
            type: 2, // Listening
            details: details,
            state: state,
            startTimestamp: this.startTimestamp,
            largeImageKey: largeImageKey,
            largeImageText: largeImageText,
            instance: false,
        };
        this.addToQueue(activity);
    }

    clearActivity() {
        this.addToQueue(null); // null means clear
    }

    addToQueue(item) {
        // Optimization: Limit size to prevent memory leaks if RPC is dead
        if (this.activityQueue.length > 20) {
            this.activityQueue.shift();
        }
        this.activityQueue.push(item);
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing) return;
        if (this.activityQueue.length === 0) return;
        if (!this.isConnected || !this.rpc) return;

        this.isProcessing = true;

        while (this.activityQueue.length > 0) {
            // Rate Limit Removed as requested


            // Get next item
            const activity = this.activityQueue.shift();

            // Double check connection in case it dropped while waiting
            if (!this.isConnected || !this.rpc) {
                // Put it back? Or just abort. Abort is safer to avoid loops.
                this.isProcessing = false;
                return;
            }

            try {
                if (activity) {
                    await this.rpc.setActivity(activity);
                } else {
                    await this.rpc.clearActivity();
                }
                this.lastUpdateTime = Date.now();
            } catch (e) {
                console.log('Failed to update activity:', e.message);
                if (e.message.includes('Could not connect') || e.message.includes('connection closed')) {
                    this.isConnected = false;
                    this.isProcessing = false;
                    return;
                }
                // If it's just a random error, we continue to next item
            }
        }

        this.isProcessing = false;
    }
}

module.exports = DiscordRPC;
