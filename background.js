// Service Worker for handling background tasks
class BackgroundService {
  constructor() {
    this.initializeListeners();
    this.setupSidePanel();
  }

  async setupSidePanel() {
    await chrome.sidePanel.setOptions({
      enabled: true
    });

    await chrome.sidePanel.setPanelBehavior({ 
      openPanelOnActionClick: true 
    });
  }

  initializeListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener(async () => {
      await this.initializeStorage();
    });

    // Handle messages from content scripts and sidepanel
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle action button click
    chrome.action.onClicked.addListener(async (tab) => {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    });
  }

  async initializeStorage() {
    const existingData = await chrome.storage.local.get(['settings', 'clipboardHistory']);
    
    if (!existingData.settings) {
      await chrome.storage.local.set({
        settings: {
          isEnabled: true,
          theme: 'light',
          maxHistorySize: 1000
        }
      });
    }
    
    if (!existingData.clipboardHistory) {
      await chrome.storage.local.set({
        clipboardHistory: []
      });
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'addClipboardItem':
          await this.addClipboardItem(request.data);
          sendResponse({ success: true });
          break;
          
        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ success: true, data: settings });
          break;
          
        case 'updateSettings':
          await this.updateSettings(request.data);
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async addClipboardItem(text) {
    if (!text || typeof text !== 'string') return;
    
    const { clipboardHistory = [], settings = {} } = await chrome.storage.local.get(['clipboardHistory', 'settings']);
    
    if (!settings.isEnabled) return;
    
    // Check for duplicate at the top
    if (clipboardHistory.length > 0 && clipboardHistory[0].text === text) {
      return;
    }
    
    const newItem = {
      id: Date.now() + Math.random(),
      text: text.trim(),
      timestamp: Date.now(),
      isPinned: false
    };
    
    // Remove duplicate if exists elsewhere
    const filteredHistory = clipboardHistory.filter(item => item.text !== text);
    
    // Add new item at the beginning
    filteredHistory.unshift(newItem);
    
    // Limit history size
    const maxSize = settings.maxHistorySize || 1000;
    if (filteredHistory.length > maxSize) {
      // Keep pinned items beyond max size
      const pinnedItems = filteredHistory.slice(maxSize).filter(item => item.isPinned);
      const regularItems = filteredHistory.slice(0, maxSize);
      filteredHistory.length = 0;
      filteredHistory.push(...regularItems, ...pinnedItems);
    }
    
    await chrome.storage.local.set({ clipboardHistory: filteredHistory });
    
    // Notify sidepanel of update
    chrome.runtime.sendMessage({ 
      action: 'clipboardUpdated', 
      data: filteredHistory 
    }).catch(() => {
      // Sidepanel might not be open, ignore error
    });
  }

  async getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return settings || { isEnabled: true, theme: 'light', maxHistorySize: 1000 };
  }

  async updateSettings(newSettings) {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ 
      settings: { ...settings, ...newSettings } 
    });
  }
}

// Initialize background service
new BackgroundService();