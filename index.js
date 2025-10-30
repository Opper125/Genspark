
// Configuration
const CONFIG = {
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
    ANTHROPIC_API_URL: 'https://api.anthropic.com/v1/messages',
    STORAGE_KEYS: {
        GEMINI_API_KEY: 'gemini_api_key',
        GROQ_API_KEY: 'groq_api_key',
        OPENAI_API_KEY: 'openai_api_key',
        ANTHROPIC_API_KEY: 'anthropic_api_key',
        CHAT_HISTORY: 'chat_history',
        SETTINGS: 'app_settings'
    }
};

// State Management
class AppState {
    constructor() {
        this.currentPage = 'chat';
        this.currentConversation = [];
        this.chatHistory = this.loadChatHistory();
        this.apiKeys = this.loadAPIKeys();
        this.isGenerating = false;
        this.currentCode = { html: '', css: '', js: '' };
    }

    loadAPIKeys() {
        return {
            gemini: localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_API_KEY) || '',
            groq: localStorage.getItem(CONFIG.STORAGE_KEYS.GROQ_API_KEY) || '',
            openai: localStorage.getItem(CONFIG.STORAGE_KEYS.OPENAI_API_KEY) || '',
            anthropic: localStorage.getItem(CONFIG.STORAGE_KEYS.ANTHROPIC_API_KEY) || ''
        };
    }

    saveAPIKey(provider, key) {
        this.apiKeys[provider] = key;
        localStorage.setItem(CONFIG.STORAGE_KEYS[`${provider.toUpperCase()}_API_KEY`], key);
    }

    loadChatHistory() {
        const history = localStorage.getItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
        return history ? JSON.parse(history) : [];
    }

    saveChatHistory() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(this.chatHistory));
    }

    addMessage(role, content) {
        this.currentConversation.push({ role, content, timestamp: Date.now() });
    }

    saveCurrentChat() {
        if (this.currentConversation.length > 0) {
            const chatSession = {
                id: Date.now(),
                messages: this.currentConversation,
                timestamp: Date.now()
            };
            this.chatHistory.unshift(chatSession);
            this.saveChatHistory();
        }
    }

    clearCurrentChat() {
        this.saveCurrentChat();
        this.currentConversation = [];
    }

    clearAllHistory() {
        this.chatHistory = [];
        this.saveChatHistory();
    }
}

// API Service
class APIService {
    constructor(state) {
        this.state = state;
    }

    async callGeminiAPI(model, messages) {
        const apiKey = this.state.apiKeys.gemini;
        if (!apiKey) throw new Error('Gemini API key not configured');

        const modelName = model.replace('gemini-', 'gemini-');
        const url = `${CONFIG.GEMINI_API_URL}${modelName}:generateContent?key=${apiKey}`;

        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async callGroqAPI(model, messages) {
        const apiKey = this.state.apiKeys.groq;
        if (!apiKey) throw new Error('Groq API key not configured');

        const modelMap = {
            'groq-llama-3.1-70b': 'llama-3.1-70b-versatile',
            'groq-llama-3.1-8b': 'llama-3.1-8b-instant',
            'groq-mixtral-8x7b': 'mixtral-8x7b-32768'
        };

        const response = await fetch(CONFIG.GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelMap[model],
                messages: messages,
                temperature: 0.7,
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Groq API error');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async callOpenAIAPI(model, messages) {
        const apiKey = this.state.apiKeys.openai;
        if (!apiKey) throw new Error('OpenAI API key not configured');

        const modelMap = {
            'openai-gpt-4o': 'gpt-4o',
            'openai-gpt-4o-mini': 'gpt-4o-mini',
            'openai-gpt-3.5-turbo': 'gpt-3.5-turbo'
        };

        const response = await fetch(CONFIG.OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelMap[model],
                messages: messages,
                temperature: 0.7,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API error');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async callAnthropicAPI(model, messages) {
        const apiKey = this.state.apiKeys.anthropic;
        if (!apiKey) throw new Error('Anthropic API key not configured');

        const modelMap = {
            'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
            'claude-3-haiku': 'claude-3-haiku-20240307'
        };

        const response = await fetch(CONFIG.ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelMap[model],
                messages: messages,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Anthropic API error');
        }

        const data = await response.json();
        return data.content[0].text;
    }

    async sendMessage(model, messages) {
        // Add system prompt for better code generation
        const systemPrompt = {
            role: 'user',
            content: `You are an expert web developer. When asked to create websites or web components:
1. Always provide COMPLETE, PRODUCTION-READY code
2. Separate HTML, CSS, and JavaScript clearly
3. Use modern, responsive design principles
4. Include comments for clarity
5. Make sure all code is fully functional
6. Use best practices and clean code
7. Provide unlimited lines of code as needed

Format your response with clear sections:
### HTML
\`\`\`html
[complete HTML code]
\`\`\`

### CSS
\`\`\`css
[complete CSS code]
\`\`\`

### JavaScript
\`\`\`javascript
[complete JavaScript code]
\`\`\`

Make the code beautiful, functional, and ready to use immediately.`
        };

        const enhancedMessages = [systemPrompt, ...messages];

        if (model.startsWith('gemini')) {
            return await this.callGeminiAPI(model, enhancedMessages);
        } else if (model.startsWith('groq')) {
            return await this.callGroqAPI(model, enhancedMessages);
        } else if (model.startsWith('openai')) {
            return await this.callOpenAIAPI(model, enhancedMessages);
        } else if (model.startsWith('claude')) {
            return await this.callAnthropicAPI(model, enhancedMessages);
        } else {
            throw new Error('Invalid model selected');
        }
    }

    async testConnection(provider) {
        const testMessages = [{ role: 'user', content: 'Hello, respond with "Connected successfully"' }];
        
        try {
            if (provider === 'gemini') {
                await this.callGeminiAPI('gemini-1.5-flash', testMessages);
            } else if (provider === 'groq') {
                await this.callGroqAPI('groq-llama-3.1-8b', testMessages);
            } else if (provider === 'openai') {
                await this.callOpenAIAPI('openai-gpt-3.5-turbo', testMessages);
            } else if (provider === 'anthropic') {
                await this.callAnthropicAPI('claude-3-haiku', testMessages);
            }
            return true;
        } catch (error) {
            throw error;
        }
    }
}

// UI Controller
class UIController {
    constructor(state, apiService) {
        this.state = state;
        this.apiService = apiService;
        this.initializeElements();
        this.attachEventListeners();
        this.checkAPIStatus();
        this.renderHistory();
    }

    initializeElements() {
        this.elements = {
            // Navigation
            navBtns: document.querySelectorAll('.nav-btn'),
            pages: document.querySelectorAll('.page'),
            
            // Chat
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            sendBtn: document.getElementById('sendBtn'),
            modelSelect: document.getElementById('modelSelect'),
            clearChatBtn: document.getElementById('clearChatBtn'),
            exportChatBtn: document.getElementById('exportChatBtn'),
            quickPromptBtns: document.querySelectorAll('.quick-prompt-btn'),
            
            // Settings
            geminiApiKey: document.getElementById('geminiApiKey'),
            groqApiKey: document.getElementById('groqApiKey'),
            openaiApiKey: document.getElementById('openaiApiKey'),
            anthropicApiKey: document.getElementById('anthropicApiKey'),
            saveSettingsBtn: document.getElementById('saveSettingsBtn'),
            resetSettingsBtn: document.getElementById('resetSettingsBtn'),
            testBtns: document.querySelectorAll('.test-btn'),
            
            // History
            historyList: document.getElementById('historyList'),
            clearHistoryBtn: document.getElementById('clearHistoryBtn'),
            
            // Modal
            codeModal: document.getElementById('codeModal'),
            closeModalBtn: document.querySelector('.close-modal'),
            codeTabs: document.querySelectorAll('.code-tab'),
            codePanels: document.querySelectorAll('.code-panel'),
            previewFrame: document.getElementById('previewFrame'),
            htmlCode: document.getElementById('htmlCode'),
            cssCode: document.getElementById('cssCode'),
            jsCode: document.getElementById('jsCode'),
            downloadCodeBtn: document.getElementById('downloadCodeBtn'),
            openFullPreviewBtn: document.getElementById('openFullPreviewBtn'),
            copyBtns: document.querySelectorAll('.copy-btn'),
            
            // UI
            loadingOverlay: document.getElementById('loadingOverlay'),
            toast: document.getElementById('toast'),
            apiStatus: document.getElementById('apiStatus'),
            apiStatusText: document.getElementById('apiStatusText')
        };
    }

    attachEventListeners() {
        // Navigation
        this.elements.navBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
        });

        // Chat
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.elements.chatInput.addEventListener('input', () => this.autoResizeTextarea());
        this.elements.clearChatBtn.addEventListener('click', () => this.clearChat());
        this.elements.exportChatBtn.addEventListener('click', () => this.exportChat());
        
        this.elements.quickPromptBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.chatInput.value = btn.dataset.prompt;
                this.autoResizeTextarea();
                this.sendMessage();
            });
        });

        // Settings
        this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.elements.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        
        this.elements.testBtns.forEach(btn => {
            btn.addEventListener('click', () => this.testAPIConnection(btn.dataset.api));
        });

        // Load saved API keys
        this.elements.geminiApiKey.value = this.state.apiKeys.gemini;
        this.elements.groqApiKey.value = this.state.apiKeys.groq;
        this.elements.openaiApiKey.value = this.state.apiKeys.openai;
        this.elements.anthropicApiKey.value = this.state.apiKeys.anthropic;

        // History
        this.elements.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        // Modal
        this.elements.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.elements.codeModal.addEventListener('click', (e) => {
            if (e.target === this.elements.codeModal) this.closeModal();
        });
        
        this.elements.codeTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchCodeTab(tab.dataset.tab));
        });

        this.elements.downloadCodeBtn.addEventListener('click', () => this.downloadCode());
        this.elements.openFullPreviewBtn.addEventListener('click', () => this.openFullPreview());
        
        this.elements.copyBtns.forEach(btn => {
            btn.addEventListener('click', () => this.copyCode(btn.dataset.target));
        });
    }

    switchPage(pageName) {
        this.state.currentPage = pageName;
        
        this.elements.pages.forEach(page => page.classList.remove('active'));
        this.elements.navBtns.forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(`${pageName}Page`).classList.add('active');
        document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

        if (pageName === 'history') {
            this.renderHistory();
        }
    }

    autoResizeTextarea() {
        const textarea = this.elements.chatInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }

    async sendMessage() {
        const message = this.elements.chatInput.value.trim();
        if (!message || this.state.isGenerating) return;

        const model = this.elements.modelSelect.value;
        
        // Check if API key is configured for selected model
        const provider = this.getProviderFromModel(model);
        if (!this.state.apiKeys[provider]) {
            this.showToast('Please configure API key in Settings', 'error');
            this.switchPage('settings');
            return;
        }

        // Add user message
        this.state.addMessage('user', message);
        this.appendMessage('user', message);
        
        // Clear input
        this.elements.chatInput.value = '';
        this.autoResizeTextarea();
        
        // Show loading
        this.state.isGenerating = true;
        this.showLoading();
        this.elements.sendBtn.disabled = true;

        try {
            // Call API
            const response = await this.apiService.sendMessage(model, this.state.currentConversation);
            
            // Add assistant message
            this.state.addMessage('assistant', response);
            this.appendMessage('assistant', response);
            
            // Extract and store code if present
            this.extractCode(response);
            
            this.showToast('Response generated successfully', 'success');
        } catch (error) {
            console.error('Error:', error);
            this.showToast(error.message, 'error');
            this.appendMessage('assistant', `Error: ${error.message}`);
        } finally {
            this.state.isGenerating = false;
            this.hideLoading();
            this.elements.sendBtn.disabled = false;
        }
    }

    getProviderFromModel(model) {
        if (model.startsWith('gemini')) return 'gemini';
        if (model.startsWith('groq')) return 'groq';
        if (model.startsWith('openai')) return 'openai';
        if (model.startsWith('claude')) return 'anthropic';
        return null;
    }

    appendMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Process content for code blocks
        const processedContent = this.processMessageContent(content);
        messageContent.innerHTML = processedContent;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        this.elements.chatMessages.appendChild(messageDiv);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;

        // Add event listeners for view code buttons
        const viewCodeBtns = messageContent.querySelectorAll('.view-code-btn');
        viewCodeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.openModal());
        });
    }

    processMessageContent(content) {
        // Convert markdown code blocks to HTML with syntax highlighting
        let processed = content;
        
        // Replace code blocks
        processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            return `
                <div class="code-block">
                    <div class="code-block-header">
                        <span class="code-block-language">${language}</span>
                    </div>
                    <pre><code>${this.escapeHtml(code.trim())}</code></pre>
                </div>
            `;
        });

        // Replace inline code
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Add line breaks
        processed = processed.replace(/\n/g, '<br>');

        // Add view code button if code detected
        if (this.state.currentCode.html || this.state.currentCode.css || this.state.currentCode.js) {
            processed += '<button class="view-code-btn"><i class="fas fa-code"></i> View & Preview Code</button>';
        }

        return processed;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    extractCode(content) {
        // Extract HTML
        const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
        if (htmlMatch) {
            this.state.currentCode.html = htmlMatch[1].trim();
        }

        // Extract CSS
        const cssMatch = content.match(/```css\n([\s\S]*?)```/);
        if (cssMatch) {
            this.state.currentCode.css = cssMatch[1].trim();
        }

        // Extract JavaScript
        const jsMatch = content.match(/```javascript\n([\s\S]*?)```/);
        if (jsMatch) {
            this.state.currentCode.js = jsMatch[1].trim();
        }
    }

    openModal() {
        if (!this.state.currentCode.html && !this.state.currentCode.css && !this.state.currentCode.js) {
            this.showToast('No code to display', 'warning');
            return;
        }

        // Update code displays
        this.elements.htmlCode.textContent = this.state.currentCode.html;
        this.elements.cssCode.textContent = this.state.currentCode.css;
        this.elements.jsCode.textContent = this.state.currentCode.js;

        // Update preview
        this.updatePreview();

        // Show modal
        this.elements.codeModal.classList.add('active');
    }

    closeModal() {
        this.elements.codeModal.classList.remove('active');
    }

    switchCodeTab(tabName) {
        this.elements.codeTabs.forEach(tab => tab.classList.remove('active'));
        this.elements.codePanels.forEach(panel => panel.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Panel`).classList.add('active');
    }

    updatePreview() {
        const html = this.state.currentCode.html;
        const css = this.state.currentCode.css;
        const js = this.state.currentCode.js;

        const fullHTML = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${css}</style>
            </head>
            <body>
                ${html}
                <script>${js}<\/script>
            </body>
            </html>
        `;

        const iframe = this.elements.previewFrame;
        iframe.srcdoc = fullHTML;
    }

    copyCode(targetId) {
        const code = document.getElementById(targetId).textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.showToast('Code copied to clipboard', 'success');
        }).catch(() => {
            this.showToast('Failed to copy code', 'error');
        });
    }

    downloadCode() {
        const files = [
            { name: 'index.html', content: this.state.currentCode.html },
            { name: 'style.css', content: this.state.currentCode.css },
            { name: 'script.js', content: this.state.currentCode.js }
        ];

        files.forEach(file => {
            if (file.content) {
                const blob = new Blob([file.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
            }
        });

        this.showToast('Files downloaded successfully', 'success');
    }

    openFullPreview() {
        const html = this.state.currentCode.html;
        const css = this.state.currentCode.css;
        const js = this.state.currentCode.js;

        const fullHTML = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Preview</title>
                <style>${css}</style>
            </head>
            <body>
                ${html}
                <script>${js}<\/script>
            </body>
            </html>
        `;

        const newWindow = window.open();
        newWindow.document.write(fullHTML);
        newWindow.document.close();
    }

    clearChat() {
        if (confirm('Clear current chat? This will save it to history.')) {
            this.state.clearCurrentChat();
            this.elements.chatMessages.innerHTML = '<div class="welcome-message"><i class="fas fa-magic"></i><h2>Chat cleared</h2><p>Start a new conversation</p></div>';
            this.showToast('Chat cleared and saved to history', 'success');
        }
    }

    exportChat() {
        const chatData = JSON.stringify(this.state.currentConversation, null, 2);
        const blob = new Blob([chatData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Chat exported successfully', 'success');
    }

    saveSettings() {
        this.state.saveAPIKey('gemini', this.elements.geminiApiKey.value);
        this.state.saveAPIKey('groq', this.elements.groqApiKey.value);
        this.state.saveAPIKey('openai', this.elements.openaiApiKey.value);
        this.state.saveAPIKey('anthropic', this.elements.anthropicApiKey.value);
        
        this.showToast('Settings saved successfully', 'success');
        this.checkAPIStatus();
    }

    resetSettings() {
        if (confirm('Reset all settings? This will clear all API keys.')) {
            localStorage.clear();
            this.elements.geminiApiKey.value = '';
            this.elements.groqApiKey.value = '';
            this.elements.openaiApiKey.value = '';
            this.elements.anthropicApiKey.value = '';
            this.state.apiKeys = { gemini: '', groq: '', openai: '', anthropic: '' };
            this.showToast('Settings reset successfully', 'success');
            this.checkAPIStatus();
        }
    }

    async testAPIConnection(provider) {
        const keyInput = document.getElementById(`${provider}ApiKey`);
        const key = keyInput.value.trim();
        
        if (!key) {
            this.showToast('Please enter API key first', 'warning');
            return;
        }

        // Temporarily set the key
        const originalKey = this.state.apiKeys[provider];
        this.state.apiKeys[provider] = key;

        this.showLoading();
        try {
            await this.apiService.testConnection(provider);
            this.showToast(`${provider.toUpperCase()} connection successful!`, 'success');
        } catch (error) {
            this.showToast(`Connection failed: ${error.message}`, 'error');
            this.state.apiKeys[provider] = originalKey;
        } finally {
            this.hideLoading();
        }
    }

    checkAPIStatus() {
        const hasAnyKey = Object.values(this.state.apiKeys).some(key => key !== '');
        
        if (hasAnyKey) {
            this.elements.apiStatus.classList.add('connected');
            this.elements.apiStatusText.textContent = 'Connected';
        } else {
            this.elements.apiStatus.classList.remove('connected');
            this.elements.apiStatusText.textContent = 'Not Configured';
        }
    }

    renderHistory() {
        this.elements.historyList.innerHTML = '';
        
        if (this.state.chatHistory.length === 0) {
            this.elements.historyList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No chat history yet</p>';
            return;
        }

        this.state.chatHistory.forEach(session => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const firstMessage = session.messages[0]?.content || 'No messages';
            const date = new Date(session.timestamp).toLocaleString();
            
            item.innerHTML = `
                <div class="history-item-header">
                    <span class="history-item-title">Chat Session</span>
                    <span class="history-item-date">${date}</span>
                </div>
                <div class="history-item-preview">${firstMessage.substring(0, 100)}...</div>
            `;
            
            item.addEventListener('click', () => this.loadHistorySession(session));
            this.elements.historyList.appendChild(item);
        });
    }

    loadHistorySession(session) {
        this.state.currentConversation = [...session.messages];
        this.elements.chatMessages.innerHTML = '';
        
        session.messages.forEach(msg => {
            this.appendMessage(msg.role, msg.content);
        });
        
        this.switchPage('chat');
        this.showToast('Chat session loaded', 'success');
    }

    clearHistory() {
        if (confirm('Clear all chat history? This cannot be undone.')) {
            this.state.clearAllHistory();
            this.renderHistory();
            this.showToast('History cleared successfully', 'success');
        }
    }

    showLoading() {
        this.elements.loadingOverlay.classList.add('active');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.remove('active');
    }

    showToast(message, type = 'success') {
        this.elements.toast.textContent = message;
        this.elements.toast.className = `toast ${type} active`;
        
        setTimeout(() => {
            this.elements.toast.classList.remove('active');
        }, 3000);
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    const state = new AppState();
    const apiService = new APIService(state);
    const ui = new UIController(state, apiService);
    
    console.log('AI Website Builder initialized successfully!');
});
