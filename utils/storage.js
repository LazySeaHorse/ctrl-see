// Storage utility module
class StorageManager {
    static async get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => {
                resolve(result);
            });
        });
    }

    static async set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    }

    static async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    }

    static async clear() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => {
                resolve();
            });
        });
    }

    static onChanged(callback) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                callback(changes);
            }
        });
    }

    static async getClipboardHistory() {
        const { clipboardHistory = [] } = await this.get('clipboardHistory');
        return clipboardHistory;
    }

    static async saveClipboardHistory(history) {
        await this.set({ clipboardHistory: history });
    }

    static async getSettings() {
        const { settings = {} } = await this.get('settings');
        return {
            isEnabled: settings.isEnabled ?? true,
            theme: settings.theme ?? 'light',
            maxHistorySize: settings.maxHistorySize ?? 1000,
            ...settings
        };
    }

    static async saveSettings(settings) {
        const current = await this.getSettings();
        await this.set({ settings: { ...current, ...settings } });
    }

    static async exportData() {
        const data = await this.get(['clipboardHistory', 'settings']);
        return {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            ...data
        };
    }

    static async importData(data) {
        if (data.version !== '1.0.0') {
            throw new Error('Incompatible data version');
        }
        
        const { clipboardHistory, settings } = data;
        
        if (clipboardHistory) {
            await this.saveClipboardHistory(clipboardHistory);
        }
        
        if (settings) {
            await this.saveSettings(settings);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}