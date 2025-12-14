class CustomDropdown {
    constructor(selectElement) {
        this.selectElement = selectElement;
        this.options = Array.from(selectElement.options);
        this.container = null;
        this.selectedDisplay = null;
        this.optionsContainer = null;
        this.init();
    }

    init() {
        // Store instance
        this.selectElement.customDropdown = this;

        // Hide original select
        this.selectElement.style.display = 'none';

        // Create container
        this.container = document.createElement('div');
        this.container.className = 'custom-dropdown';

        // Selected value display
        this.selectedDisplay = document.createElement('div');
        this.selectedDisplay.className = 'dropdown-selected';
        this.updateSelectedDisplay();

        this.selectedDisplay.onclick = (e) => {
            e.stopPropagation();
            this.toggleOptions();
        };

        // Options container
        this.optionsContainer = document.createElement('div');
        this.optionsContainer.className = 'dropdown-options hidden';

        this.buildOptions();

        this.container.appendChild(this.selectedDisplay);
        this.container.appendChild(this.optionsContainer);

        // Insert after original select
        this.selectElement.parentNode.insertBefore(this.container, this.selectElement.nextSibling);

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.closeOptions();
            }
        });

        // Listen for external changes to the original select
        this.selectElement.addEventListener('change', () => {
            this.updateSelectedDisplay();
            this.updateOptionsSelection();
        });
    }

    buildOptions() {
        this.options = Array.from(this.selectElement.options);
        this.optionsContainer.innerHTML = '';

        this.options.forEach(opt => {
            const optionEl = document.createElement('div');
            optionEl.className = 'dropdown-option';
            if (opt.selected) optionEl.classList.add('selected');
            optionEl.textContent = opt.text;
            optionEl.dataset.value = opt.value;

            optionEl.onclick = (e) => {
                e.stopPropagation();
                this.selectOption(opt.value);
            };

            this.optionsContainer.appendChild(optionEl);
        });
    }

    refresh() {
        this.buildOptions();
        this.updateSelectedDisplay();
    }

    toggleOptions() {
        // Close all other dropdowns first
        document.querySelectorAll('.custom-dropdown .dropdown-options').forEach(el => {
            if (el !== this.optionsContainer) el.classList.add('hidden');
        });

        this.optionsContainer.classList.toggle('hidden');
        this.container.classList.toggle('active');
    }

    closeOptions() {
        this.optionsContainer.classList.add('hidden');
        this.container.classList.remove('active');
    }

    selectOption(value) {
        this.selectElement.value = value;
        // Trigger change event on original select
        this.selectElement.dispatchEvent(new Event('change'));

        this.updateSelectedDisplay();
        this.updateOptionsSelection();
        this.closeOptions();
    }

    updateSelectedDisplay() {
        const selectedOpt = this.selectElement.options[this.selectElement.selectedIndex];
        this.selectedDisplay.textContent = selectedOpt ? selectedOpt.text : 'Select...';

        // Add arrow
        const arrow = document.createElement('span');
        arrow.className = 'dropdown-arrow';
        arrow.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>';
        this.selectedDisplay.appendChild(arrow);
    }

    updateOptionsSelection() {
        const currentVal = this.selectElement.value;
        Array.from(this.optionsContainer.children).forEach(child => {
            if (child.dataset.value === currentVal) {
                child.classList.add('selected');
            } else {
                child.classList.remove('selected');
            }
        });
    }

    // Static helper to convert all selects in a container
    static convertAll(selector = 'select') {
        document.querySelectorAll(selector).forEach(el => {
            // Check if already converted
            if (el.customDropdown) return;
            if (el.nextSibling && el.nextSibling.classList && el.nextSibling.classList.contains('custom-dropdown')) return;
            new CustomDropdown(el);
        });
    }
}
