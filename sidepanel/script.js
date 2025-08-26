// Main application controller
class ClipboardHistoryApp {
    constructor() {
        this.clipboardHistory = [];
        this.filteredHistory = [];
        this.selectedItems = new Set();
        this.isSelectMode = false;
        this.searchQuery = '';
        this.editingItemId = null;
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadClipboardHistory();
        this.initializeEventListeners();
        this.setupMessageListeners();
        this.render();
    }

    async loadSettings() {
        const { settings } = await chrome.storage.local.get('settings');
        this.settings = settings || { isEnabled: true, theme: 'light', maxHistorySize: 1000 };
        
        // Apply theme
        document.querySelector('.app').setAttribute('data-theme', this.settings.theme);
        document.getElementById('monitoringToggle').checked = this.settings.isEnabled;
    }

    async loadClipboardHistory() {
        const { clipboardHistory } = await chrome.storage.local.get('clipboardHistory');
        this.clipboardHistory = clipboardHistory || [];
        this.applySearch();
    }

    initializeEventListeners() {
        // Theme toggle
        document.querySelector('.theme-toggle-btn').addEventListener('click', () => this.toggleTheme());
        
        // Monitoring toggle
        document.getElementById('monitoringToggle').addEventListener('change', (e) => {
            this.toggleMonitoring(e.target.checked);
        });
        
        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.applySearch();
            this.render();
        });
        
        // Action buttons
        document.getElementById('addNewBtn').addEventListener('click', () => this.showTextModal());
        document.getElementById('selectModeBtn').addEventListener('click', () => this.toggleSelectMode());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportAll());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAll());
        
        // Bulk action buttons
        document.getElementById('selectAllBtn').addEventListener('click', () => this.selectAll());
        document.getElementById('bulkPinBtn').addEventListener('click', () => this.bulkPin());
        document.getElementById('bulkExportBtn').addEventListener('click', () => this.bulkExport());
        document.getElementById('bulkDeleteBtn').addEventListener('click', () => this.bulkDelete());
        document.getElementById('cancelSelectBtn').addEventListener('click', () => this.cancelSelectMode());
        
        // Modal
        document.getElementById('saveTextBtn').addEventListener('click', () => this.saveText());
        document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => this.hideTextModal());
        });
        
        // Close modal on background click
        document.getElementById('textModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideTextModal();
            }
        });
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'clipboardUpdated') {
                this.clipboardHistory = request.data;
                this.applySearch();
                this.render();
            }
        });
    }

    toggleTheme() {
        const app = document.querySelector('.app');
        const currentTheme = app.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        app.setAttribute('data-theme', newTheme);
        this.updateSettings({ theme: newTheme });
    }

    async toggleMonitoring(enabled) {
        await this.updateSettings({ isEnabled: enabled });
        
        // Notify content scripts
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'toggleMonitoring', 
                enabled 
            }).catch(() => {
                // Tab might not have content script
            });
        });
        
        this.showToast(enabled ? 'Monitoring enabled' : 'Monitoring disabled', 'success');
    }

    async updateSettings(updates) {
        this.settings = { ...this.settings, ...updates };
        await chrome.storage.local.set({ settings: this.settings });
        await chrome.runtime.sendMessage({ 
            action: 'updateSettings', 
            data: updates 
        });
    }

    applySearch() {
        if (!this.searchQuery) {
            this.filteredHistory = [...this.clipboardHistory];
        } else {
            const query = this.searchQuery.toLowerCase();
            this.filteredHistory = this.clipboardHistory.filter(item => 
                item.text.toLowerCase().includes(query)
            );
        }
    }

    toggleSelectMode() {
        this.isSelectMode = !this.isSelectMode;
        this.selectedItems.clear();
        
        const bulkActions = document.querySelector('.bulk-actions');
        const selectBtn = document.getElementById('selectModeBtn');
        const list = document.getElementById('clipboardList');
        
        if (this.isSelectMode) {
            bulkActions.classList.remove('hidden');
            selectBtn.textContent = 'Cancel';
            list.classList.add('select-mode');
        } else {
            bulkActions.classList.add('hidden');
            selectBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                Select
            `;
            list.classList.remove('select-mode');
        }
        
        this.render();
    }

    cancelSelectMode() {
        this.toggleSelectMode();
    }

    selectAll() {
        if (this.selectedItems.size === this.filteredHistory.length) {
            this.selectedItems.clear();
        } else {
            this.filteredHistory.forEach(item => this.selectedItems.add(item.id));
        }
        this.updateBulkInfo();
        this.render();
    }

    updateBulkInfo() {
        const count = this.selectedItems.size;
        document.querySelector('.selected-count').textContent = `${count} selected`;
        document.getElementById('selectAllBtn').textContent = 
            count === this.filteredHistory.length ? 'Deselect All' : 'Select All';
    }

    async bulkPin() {
        const updates = this.clipboardHistory.map(item => {
            if (this.selectedItems.has(item.id)) {
                return { ...item, isPinned: true };
            }
            return item;
        });
        
        await this.updateClipboardHistory(updates);
        this.toggleSelectMode();
        this.showToast(`${this.selectedItems.size} items pinned`, 'success');
    }

    async bulkDelete() {
        if (!confirm(`Delete ${this.selectedItems.size} items?`)) return;
        
        const updates = this.clipboardHistory.filter(item => 
            !this.selectedItems.has(item.id)
        );
        
        await this.updateClipboardHistory(updates);
        this.toggleSelectMode();
        this.showToast(`${this.selectedItems.size} items deleted`, 'success');
    }

    bulkExport() {
        const items = this.clipboardHistory.filter(item => 
            this.selectedItems.has(item.id)
        );
        this.exportItems(items);
        this.toggleSelectMode();
    }

    exportAll() {
        this.exportItems(this.clipboardHistory);
    }

    exportItems(items) {
        const data = {
            exported: new Date().toISOString(),
            count: items.length,
            items: items.map(item => ({
                text: item.text,
                timestamp: new Date(item.timestamp).toISOString(),
                isPinned: item.isPinned
            }))
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clipboard-history-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast(`Exported ${items.length} items`, 'success');
    }

    async clearAll() {
        if (!confirm('Clear all clipboard history? Pinned items will be kept.')) return;
        
        const pinnedItems = this.clipboardHistory.filter(item => item.isPinned);
        await this.updateClipboardHistory(pinnedItems);
        this.showToast('Clipboard history cleared', 'success');
    }

    showTextModal(itemId = null) {
        const modal = document.getElementById('textModal');
        const input = document.getElementById('textInput');
        const title = modal.querySelector('.modal-title');
        
        if (itemId) {
            const item = this.clipboardHistory.find(i => i.id === itemId);
            if (item) {
                input.value = item.text;
                title.textContent = 'Edit Text';
                this.editingItemId = itemId;
            }
        } else {
            input.value = '';
            title.textContent = 'Add New Text';
            this.editingItemId = null;
        }
        
        modal.classList.remove('hidden');
        input.focus();
    }

    hideTextModal() {
        document.getElementById('textModal').classList.add('hidden');
        document.getElementById('textInput').value = '';
        this.editingItemId = null;
    }

    async saveText() {
        const text = document.getElementById('textInput').value.trim();
        if (!text) return;
        
        if (this.editingItemId) {
            // Edit existing item
            const updates = this.clipboardHistory.map(item => {
                if (item.id === this.editingItemId) {
                    return { ...item, text, timestamp: Date.now() };
                }
                return item;
            });
            await this.updateClipboardHistory(updates);
            this.showToast('Text updated', 'success');
        } else {
            // Add new item
            const newItem = {
                id: Date.now() + Math.random(),
                text,
                timestamp: Date.now(),
                isPinned: false
            };
            
            const updates = [newItem, ...this.clipboardHistory];
            await this.updateClipboardHistory(updates);
            this.showToast('Text added', 'success');
        }
        
        this.hideTextModal();
    }

    async updateClipboardHistory(history) {
        this.clipboardHistory = history;
        await chrome.storage.local.set({ clipboardHistory: history });
        this.applySearch();
        this.render();
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard', 'success');
        } catch (error) {
            this.showToast('Failed to copy', 'error');
        }
    }

    async togglePin(itemId) {
        const updates = this.clipboardHistory.map(item => {
            if (item.id === itemId) {
                return { ...item, isPinned: !item.isPinned };
            }
            return item;
        });
        
        await this.updateClipboardHistory(updates);
    }

    async deleteItem(itemId) {
        const updates = this.clipboardHistory.filter(item => item.id !== itemId);
        await this.updateClipboardHistory(updates);
        this.showToast('Item deleted', 'success');
    }

    toggleItemSelection(itemId) {
        if (this.selectedItems.has(itemId)) {
            this.selectedItems.delete(itemId);
        } else {
            this.selectedItems.add(itemId);
        }
        this.updateBulkInfo();
        this.render();
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        
        return date.toLocaleDateString();
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    render() {
        const list = document.getElementById('clipboardList');
        const emptyState = document.getElementById('emptyState');
        
        if (this.filteredHistory.length === 0) {
            list.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        list.innerHTML = this.filteredHistory.map(item => {
            const isSelected = this.selectedItems.has(item.id);
            
            return `
                <div class="clipboard-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                    <input type="checkbox" 
                           class="item-checkbox" 
                           ${isSelected ? 'checked' : ''}
                           data-id="${item.id}">
                    
                    <div class="item-content">
                        <div class="item-text">${this.escapeHtml(item.text)}</div>
                        <div class="item-meta">
                            ${item.isPinned ? `
                                <span class="pin-indicator">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/>
                                    </svg>
                                    Pinned
                                </span>
                            ` : ''}
                            <span>${this.formatDate(item.timestamp)}</span>
                        </div>
                    </div>
                    
                    <div class="item-actions">
                        <button class="item-btn" data-action="copy" data-id="${item.id}" title="Copy">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                        <button class="item-btn ${item.isPinned ? 'pinned' : ''}" 
                                data-action="pin" 
                                data-id="${item.id}" 
                                title="${item.isPinned ? 'Unpin' : 'Pin'}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="${item.isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/>
                            </svg>
                        </button>
                        <button class="item-btn" data-action="edit" data-id="${item.id}" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="item-btn" data-action="delete" data-id="${item.id}" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to rendered items
        this.attachItemEventListeners();
    }

    attachItemEventListeners() {
        // Checkbox events
        document.querySelectorAll('.item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const itemId = parseFloat(e.target.dataset.id);
                this.toggleItemSelection(itemId);
            });
        });
        
        // Action button events
        document.querySelectorAll('.item-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.dataset.action;
                const itemId = parseFloat(btn.dataset.id);
                const item = this.clipboardHistory.find(i => i.id === itemId);
                
                if (!item) return;
                
                switch (action) {
                    case 'copy':
                        await this.copyToClipboard(item.text);
                        break;
                    case 'pin':
                        await this.togglePin(itemId);
                        break;
                    case 'edit':
                        this.showTextModal(itemId);
                        break;
                    case 'delete':
                        if (confirm('Delete this item?')) {
                            await this.deleteItem(itemId);
                        }
                        break;
                }
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ClipboardHistoryApp();
});