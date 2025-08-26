// Clipboard utility module
class ClipboardManager {
    static async writeText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers
                return this.fallbackCopy(text);
            }
        } catch (error) {
            console.error('Failed to copy text:', error);
            return false;
        }
    }

    static async readText() {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                return await navigator.clipboard.readText();
            }
            return null;
        } catch (error) {
            console.error('Failed to read clipboard:', error);
            return null;
        }
    }

    static fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (error) {
            document.body.removeChild(textArea);
            return false;
        }
    }

    static sanitizeText(text) {
        // Remove potentially harmful content
        return text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .trim();
    }

    static truncateText(text, maxLength = 1000) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    static formatForExport(items) {
        return items.map(item => ({
            text: item.text,
            timestamp: new Date(item.timestamp).toISOString(),
            isPinned: item.isPinned || false
        }));
    }

    static async detectFormat(text) {
        // Detect the format of clipboard content
        const formats = {
            url: /^https?:\/\//i,
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            json: /^\s*[\[{]/,
            code: /^(function|class|const|let|var|import|export|if|for|while)\s/,
            markdown: /^#|^\*|^\-|^\d+\./m
        };

        for (const [format, regex] of Object.entries(formats)) {
            if (regex.test(text)) {
                return format;
            }
        }

        return 'text';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClipboardManager;
}