class CustomModal {
    static init() {
        this.modal = document.getElementById('custom-modal');
        this.title = document.getElementById('custom-modal-title');
        this.message = document.getElementById('custom-modal-message');
        this.inputContainer = document.getElementById('custom-modal-input-container');
        this.input = document.getElementById('custom-modal-input');
        this.cancelBtn = document.getElementById('custom-modal-cancel');
        this.confirmBtn = document.getElementById('custom-modal-confirm');
    }

    static show(title, msg, type = 'alert', defaultValue = '') {
        return new Promise((resolve) => {
            if (!this.modal) this.init();

            this.title.textContent = title;
            // Use innerHTML for message to allow line breaks or simple formatting if needed, 
            // but textContent is safer. Let's use textContent for now to match alert behavior.
            this.message.textContent = msg;
            this.input.value = defaultValue;

            // Reset state
            this.inputContainer.classList.add('hidden');
            this.cancelBtn.classList.add('hidden');
            this.confirmBtn.textContent = 'OK';

            // Remove old event listeners by cloning or just reassigning onclick
            // Reassigning onclick is sufficient for single-listener usage.

            // Type specific setup
            if (type === 'confirm') {
                this.cancelBtn.classList.remove('hidden');
                this.cancelBtn.textContent = 'Cancel';
            } else if (type === 'prompt') {
                this.cancelBtn.classList.remove('hidden');
                this.inputContainer.classList.remove('hidden');
                setTimeout(() => this.input.focus(), 50); // Small delay to ensure visibility
            }

            const close = (value) => {
                this.modal.classList.add('hidden');
                resolve(value);
            };

            this.confirmBtn.onclick = () => {
                if (type === 'prompt') {
                    close(this.input.value);
                } else if (type === 'confirm') {
                    close(true);
                } else {
                    close(true); // Alert
                }
            };

            this.cancelBtn.onclick = () => {
                if (type === 'prompt') {
                    close(null);
                } else {
                    close(false);
                }
            };

            // key handlers
            const keyHandler = (e) => {
                if (this.modal.classList.contains('hidden')) return;

                if (e.key === 'Enter') {
                    // Start playing music triggers on Space/Enter usually, need to stop propagation
                    e.stopPropagation();
                    this.confirmBtn.click();
                } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    if (type === 'alert') this.confirmBtn.click();
                    else this.cancelBtn.click();
                }
            };

            // Use 'once' or just remove it on close
            // For simplicity, attaching to input for prompt, but for alert/confirm we need window listener
            // Ideally we'd manage a global listener stack, but for this simple app:

            if (type === 'prompt') {
                this.input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        this.confirmBtn.click();
                    } else if (e.key === 'Escape') {
                        this.cancelBtn.click();
                    }
                };
            }
            // For generic Alert/Confirm enter/escape
            // We'll rely on button focus or just click for now to avoid conflict with app shortcuts

            this.modal.classList.remove('hidden');
        });
    }

    static async alert(msg) {
        return this.show('Alert', msg, 'alert');
    }

    static async confirm(msg) {
        return this.show('Confirm', msg, 'confirm');
    }

    static async prompt(msg, defaultValue = '') {
        return this.show('Prompt', msg, 'prompt', defaultValue);
    }
}
