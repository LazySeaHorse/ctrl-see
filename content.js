// Content script for monitoring clipboard events
class ClipboardMonitor {
  constructor() {
    this.isMonitoring = false;
    this.lastClipboardText = '';
    this.initializeMonitoring();
  }

  async initializeMonitoring() {
    // Get initial settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response?.data?.isEnabled) {
      this.startMonitoring();
    }

    // Listen for setting changes
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'toggleMonitoring') {
        if (request.enabled) {
          this.startMonitoring();
        } else {
          this.stopMonitoring();
        }
      }
    });
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Listen for copy events
    document.addEventListener('copy', this.handleCopy);
    
    // Listen for cut events
    document.addEventListener('cut', this.handleCut);
    
    // Listen for paste events to detect clipboard changes
    document.addEventListener('paste', this.handlePaste);
  }

  stopMonitoring() {
    this.isMonitoring = false;
    document.removeEventListener('copy', this.handleCopy);
    document.removeEventListener('cut', this.handleCut);
    document.removeEventListener('paste', this.handlePaste);
  }

  handleCopy = async (event) => {
    await this.captureClipboard();
  }

  handleCut = async (event) => {
    await this.captureClipboard();
  }

  handlePaste = async (event) => {
    // Optional: capture paste content if needed
  }

  async captureClipboard() {
    try {
      // Try to read from clipboard
      const text = await this.readClipboard();
      
      if (text && text !== this.lastClipboardText) {
        this.lastClipboardText = text;
        await chrome.runtime.sendMessage({
          action: 'addClipboardItem',
          data: text
        });
      }
    } catch (error) {
      // Fallback to selection text
      const selectedText = window.getSelection().toString();
      if (selectedText && selectedText !== this.lastClipboardText) {
        this.lastClipboardText = selectedText;
        await chrome.runtime.sendMessage({
          action: 'addClipboardItem',
          data: selectedText
        });
      }
    }
  }

  async readClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        return await navigator.clipboard.readText();
      }
    } catch (error) {
      // Clipboard API might not be available or permitted
      return null;
    }
  }
}

// Initialize clipboard monitor
new ClipboardMonitor();