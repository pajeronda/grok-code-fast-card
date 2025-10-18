/**
 * Grok Code Fast Card
 * Custom Lovelace card for xAI Grok Code Fast integration
 * This card work only xAI Conversation custom component
 * Installation:
 * 1. Copy this file to /config/www/grok-code-fast-card.js
 * 2. Add to Lovelace resources:
 *    Configuration > Dashboards > Resources > Add Resource
 *    URL: /local/grok-code-fast-card.js
 *    Type: JavaScript Module
 * 3. Add card to dashboard with type: custom:grok-code-fast-card
 */

const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class GrokCodeFastCard extends LitElement {

  static async getConfigElement() {
    return document.createElement("grok-code-fast-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  static CONSTANTS = {
    VERSION: '1.8.0',
    LOCAL_STORAGE_KEY: 'grok_code_fast_data',
    SERVICE_DOMAIN: 'xai_conversation',
    SERVICE_SEND_PROMPT: 'grok_code_fast',
    SERVICE_CLEAR_MEMORY: 'clear_code_memory',
    SERVICE_SYNC_HISTORY: 'sync_chat_history',
    MAX_FILE_SIZE_BYTES: 102400, // 100KB
    MAX_CHAT_HISTORY_MESSAGES: 100, // Maximum messages to keep in localStorage
    BANNER_DISPLAY_DURATION_MS: 7500, // Duration in milliseconds for banner display (7.5 seconds)
    BANNER_ANIMATION_DURATION_MS: 400, // Duration of banner slide animation
    SAVE_DEBOUNCE_DELAY_MS: 500, // Delay before saving to storage after code changes
    SCROLL_UPDATE_DELAY_MS: 100, // Delay before scrolling chat after loading state changes
    SERVICE_RETRY_ATTEMPTS: 3, // Number of retry attempts for failed service calls
    SERVICE_RETRY_DELAY_MS: 1000, // Base delay between retry attempts (increases exponentially)
    CHAT_HISTORY_ROTATION_SIZE: 20, // Messages to keep when storage quota is exceeded
    ALLOWED_FILES_MAP: {
        '.py': ['text/x-python', 'application/x-python-code'],
        '.yaml': ['text/yaml', 'application/x-yaml'],
        '.yml': ['text/yaml', 'application/x-yaml'],
        '.jinja': ['text/jinja'],
        '.jinja2': ['text/jinja2'],
        '.log': ['text/plain'],
        '.txt': ['text/plain'],
        '.md': ['text/markdown'],
        '.js': ['text/javascript', 'application/javascript'],
        '.css': ['text/css'],
    },
    get ALLOWED_FILE_EXTENSIONS() {
        return Object.keys(this.ALLOWED_FILES_MAP);
    }
  };

  static get properties() {
    return {
      _hass: { type: Object },
      _config: { type: Object },
      _chatHistory: { type: Array, state: true },
      _currentCode: { type: String, state: true },
      _sendOnEnter: { type: Boolean, state: true },
      _isEditorFallback: { type: Boolean, state: true },
      _isCodeUserModified: { type: Boolean, state: true },
      _previousResponseId: { type: String, state: true },
      _pendingAttachments: { type: Array, state: true },
      _isLoading: { type: Boolean, state: true },
      _error: { type: String, state: true },
      _errorType: { type: String, state: true },
      _errorClosing: { type: Boolean, state: true },
      _confirmDialogOpen: { type: Boolean, state: true },
    };
  }

  constructor() {
    super();
    this._config = {};
    this._chatHistory = [];
    this._currentCode = '';
    this._sendOnEnter = false;
    this._isEditorFallback = false;
    this._isCodeUserModified = false;
    this._previousResponseId = null;
    this._pendingAttachments = [];
    this._appliedThemeVars = [];
    this._isLoading = false;
    this._error = null;
    this._errorType = null;
    this._errorClosing = false;
    this._errorTimeout = null;
    this._saveDebounceTimeout = null;
    this._storageKey = null; // Will be set when hass is available

    // Confirmation Dialog State
    this._confirmDialogOpen = false;
    this._confirmDialogTitle = '';
    this._confirmDialogText = '';
    this._confirmDialogConfirmText = 'Confirm';
    this._confirmDialogCancelText = 'Cancel';
    this._confirmDialogAction = null;

    this._promptInput = null;
    this._chatHistoryEl = null;
    this._codeEditorContainer = null;
  }

  // ==================== LIFECYCLE METHODS ====================

  /**
   * LitElement lifecycle: cleanup when element is removed from DOM
   */
  disconnectedCallback() {
    super.disconnectedCallback();
  }

  /**
   * Home Assistant: set card configuration
   * @param {Object} config - Configuration object from Lovelace
   */
  setConfig(config) {
    this._config = config || {};
  }

  /**
   * Home Assistant: set hass object and initialize storage
   * @param {Object} hass - Home Assistant object
   */
  set hass(hass) {
    const wasFirstSet = !this._hass;
    this._hass = hass;

    // Initialize storage key with user_id on first set
    if (wasFirstSet && hass?.user?.id) {
      this._storageKey = `${GrokCodeFastCard.CONSTANTS.LOCAL_STORAGE_KEY}_${hass.user.id}`;
      this._loadFromStorage();
    }
  }

  /**
   * LitElement lifecycle: called after first render
   * Initializes DOM references and creates code editor
   * @param {Map} changedProperties - Changed properties
   */
  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    this._promptInput = this.shadowRoot.querySelector('#prompt-input');
    this._chatHistoryEl = this.shadowRoot.querySelector('.chat-history');
    this._codeEditorContainer = this.shadowRoot.querySelector('#code-editor-container');
    this._createCodeEditor();
  }

  /**
   * LitElement lifecycle: called after every render
   * Handles auto-scrolling and theme changes
   * @param {Map} changedProperties - Changed properties
   */
  updated(changedProperties) {
    if (changedProperties.has('_chatHistory')) {
      this._smoothScrollToBottom('smooth');
    }
    // Force scroll when loading state changes (e.g., loading overlay appears/disappears)
    if (changedProperties.has('_isLoading')) {
      // Small delay to let the DOM update
      setTimeout(() => this._smoothScrollToBottom('smooth'), GrokCodeFastCard.CONSTANTS.SCROLL_UPDATE_DELAY_MS);
    }
    if (changedProperties.has('_config') || changedProperties.has('_hass')) {
      this._applyTheme();
    }
  }

  // ==================== THEME & STYLING ====================

  /**
   * Apply Home Assistant theme to card
   * Sets theme CSS variables on host element
   */
  _applyTheme() {
    if (!this._config || !this._hass) return;

    if (this._appliedThemeVars) {
      for (const varName of this._appliedThemeVars) {
        this.style.removeProperty(varName);
      }
    }
    this._appliedThemeVars = [];

    if (this._config.theme) {
      const themeData = this._hass.themes.themes[this._config.theme];
      if (themeData) {
        for (const [key, value] of Object.entries(themeData)) {
          const varName = `--${key}`;
          this.style.setProperty(varName, value);
          this._appliedThemeVars.push(varName);
        }
      }
    }
  }

  static get styles() {
    return css`
      :host { display: block; position: relative; container-type: inline-size; --spacing: 16px; --spacing-small: 12px; }
      ha-card { height: 100%; display: flex; flex-direction: column; overflow: visible; }
      .error-banner { position: absolute; top: 0; left: 0; right: 0; padding: 12px; color: var(--text-primary-color); text-align: center; cursor: pointer; background-color: var(--error-color); z-index: 9999; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); animation: slideDownFade 0.4s ease-out; }
      .error-banner.warning { background-color: var(--warning-color); }
      .error-banner.success { background-color: var(--success-color); }
      .error-banner.closing { animation: slideUpFade 0.4s ease-in forwards; }
      @keyframes slideDownFade { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }
      @keyframes slideUpFade { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-100%); } }
      .card-content { padding: var(--spacing); flex: 1; display: flex; flex-direction: column; gap: var(--spacing); }
      @container (min-width: 768px) {
        .card-content { flex-direction: row; gap: var(--spacing); align-items: stretch; }
        .area-left { display: flex; flex-direction: column; flex: 1; gap: var(--spacing); order: 1; }
        .area-right { display: flex; flex-direction: column; flex: 2; order: 2; }
        .section-chat { display: flex; flex-direction: column; overflow: hidden; }
        .chat-history { max-height: 450px; overflow-y: auto; }
        .area-right .section { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        #code-editor-container { flex: 1; overflow: auto; }
      }
      @container (max-width: 767px) {
        .card-content { flex-direction: column; }
        .area-left, .area-right { width: 100%; }
        .chat-history { max-height: 270px; overflow-y: auto; }
        #code-editor-container { max-height: 250px; overflow: auto; }
      }
      @container (max-width: 600px) {
        .card-content { padding: var(--spacing-small); gap: var(--spacing-small); }
        .header { padding: var(--spacing-small); }
        .header h2 { font-size: 18px; }
        .footer { padding: 4px var(--spacing-small) var(--spacing-small) var(--spacing-small); }
        .section-title { font-size: 12px; }
        .chat-history { max-height: 250px; }
      }
      .header { display: flex; align-items: center; justify-content: space-between; padding: var(--spacing) var(--spacing) var(--spacing-small) var(--spacing); border-bottom: 2px solid var(--primary-color); flex-shrink: 0; }
      .header h2 { margin: 0; font-size: 24px; color: var(--primary-text-color); }
      .header-subtitle { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; }
      .footer { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--secondary-text-color); opacity: 0.7; font-style: italic; padding: 4px var(--spacing) var(--spacing-small) var(--spacing); flex-shrink: 0; gap: 8px; }
      .footer-left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .footer-left label { display: flex; align-items: center; gap: 4px; cursor: pointer; font-style: normal; }
      .footer-left input[type="checkbox"] { cursor: pointer; }
      .footer-right { font-style: italic; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .section { margin-bottom: var(--spacing); }
      .section:last-of-type { margin-bottom: 8px; }
      .section-title { font-weight: 500; color: var(--primary-color); font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .section-subtitle { color: var(--primary-text-color); font-size: 10px; font-style: oblique; }
      .btn-sync, .btn-upload { background: transparent; border: 0px solid var(--primary-color); color: var(--primary-color); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; text-transform: none; letter-spacing: 0; transition: all 0.2s ease; }
      .btn-sync:hover, .btn-upload:hover { background: var(--primary-color); border: 1px solid var(--primary-color); color: var(--text-primary-color); }
      #code-editor-container { border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 8px); min-height: 100px; overflow: auto; display: flex; flex-direction: column; }
      #code-editor-container ha-code-editor { flex: 1; min-height: 100px; }
      @container (min-width: 768px) { #code-editor-container, #code-editor-container ha-code-editor { height: 100%; } }
      .copy-btn { position: absolute; top: 8px; right: 8px; background: var(--primary-color); color: var(--text-primary-color); border: none; padding: 6px 12px; border-radius: var(--ha-card-border-radius, 4px); cursor: pointer; font-size: 12px; z-index: 1; }
      .chat-container { position: relative; }
      .chat-history { background: var(--secondary-background-color); padding: var(--spacing-small); border-radius: var(--ha-card-border-radius, 8px); border: 1px solid var(--divider-color); overflow-y: auto; scroll-behavior: smooth; max-height: 300px; user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }
      .chat-message { margin-bottom: 8px; padding: 8px 10px; border-radius: var(--ha-card-border-radius, 8px); word-break: break-word; animation: slideIn 0.3s ease-out; user-select: text; -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; }
      @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .chat-message.user { background: var(--primary-color); color: var(--text-primary-color); margin-left: 15%; }
      .chat-message.assistant { background: var(--card-background-color); border: 1px solid var(--divider-color); color: var(--primary-text-color); margin-right: 15%; }
      .chat-message .role { font-weight: 500; margin-bottom: 2px; font-size: 12px; opacity: 0.9; user-select: text; -webkit-user-select: text; }
      .chat-message .content { line-height: 1.4; font-size: 14px; word-break: break-word; margin: 0; user-select: text; -webkit-user-select: text; }
      .chat-message .code-snippet { background: var(--secondary-background-color); padding: 8px; border-radius: 4px; border: 1px solid var(--divider-color); margin-top: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; color: var(--secondary-text-color); }
      .prompt-input { width: 100%; min-height: 40px; padding: 10px var(--spacing-small); background: var(--card-background-color); color: var(--primary-text-color); border: 2px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 8px); font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box; transition: border-color 0.2s; }
      .prompt-input:focus { outline: none; border-color: var(--primary-color); }
      .button-row { display: flex; gap: 8px; margin-top: 8px; }
      .btn { flex: 1; padding: 8px 12px; border: none; border-radius: var(--ha-card-border-radius, 8px); cursor: pointer; font-size: 14px; font-weight: 500; }
      .btn-primary { background: var(--primary-color); color: var(--text-primary-color); }
      .btn-danger { background: var(--error-color); color: var(--text-primary-color); }
      .empty-state { text-align: center; padding: calc(var(--spacing) * 2); color: var(--secondary-text-color); }

      .attachments { margin-top: 8px; }
      .attachment-chip { display: inline-flex; align-items: center; background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 16px; padding: 4px 8px; font-size: 12px; margin-right: 8px; margin-bottom: 8px; }
      .attachment-chip span { max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .attachment-chip button { background: transparent; border: none; color: var(--secondary-text-color); cursor: pointer; margin-left: 4px; padding: 0; font-size: 14px; }

      .confirm-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease-out; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .confirm-dialog { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 8px); padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); animation: slideUp 0.2s ease-out; }
      @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      .confirm-dialog h3 { margin: 0 0 12px 0; color: var(--primary-text-color); font-size: 20px; }
      .confirm-dialog p { margin: 0 0 20px 0; color: var(--primary-text-color); line-height: 1.5; }
      .dialog-buttons { display: flex; gap: 12px; justify-content: flex-end; }
      .dialog-buttons button { padding: 10px 20px; border: none; border-radius: var(--ha-card-border-radius, 8px); cursor: pointer; font-size: 14px; font-weight: 500; transition: opacity 0.2s; }
      .dialog-buttons button:hover { opacity: 0.8; }
      .dialog-buttons button:first-child { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .dialog-buttons button.confirm-btn { background: var(--primary-color); color: var(--text-primary-color); }

      .loading-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; border-radius: var(--ha-card-border-radius, 8px); animation: fadeIn 0.3s ease-out; }
      .loading-spinner { width: 40px; height: 40px; border: 4px solid var(--divider-color); border-top-color: var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .loading-text { color: var(--text-primary-color); margin-top: 16px; font-size: 14px; font-weight: 500; }
    `;
  }

  // ==================== RENDERING METHODS ====================

  render() {
    return html`
      <ha-card>
        ${this._error ? html`
          <div class="error-banner ${this._errorType} ${this._errorClosing ? 'closing' : ''}" @click=${() => this._hideError()}>
            ${this._error}
          </div>
        ` : ''}
        <div class="header">
          <div>
            <h2>🤖 Grok Code Fast</h2>
            <div class="header-subtitle">AI-powered code assistant for Home Assistant</div>
          </div>
        </div>

        <div class="card-content">
          <div class="area-right">
            <div class="section">
              <div class="section-title">
                <span>📝 Code Editor</span>
                ${this._currentCode ? html`<button class="btn-sync" @click=${this._clearCodeEditor} title="Clear code editor">🗑️ Clear editor</button>` : ''}
              </div>
              <div class="section-subtitle">send, modify and receive code</div>
              <div style="position: relative;">
                ${this._currentCode && this._isEditorFallback ? html`<button class="copy-btn" @click=${this._copyCode}>📋 Copy</button>` : ''}
                <div id="code-editor-container"></div>
              </div>
            </div>
          </div>
          <div class="area-left">
            ${this._renderChatSection()}
            ${this._renderPromptSection()}
          </div>
        </div>

        <div class="footer">
          <div class="footer-left">
            <label>
              <input type="checkbox" .checked=${this._sendOnEnter} @click=${this._toggleSendOnEnter}>
              Send on Enter
            </label>
          </div>
          <div class="footer-right">
            Made by <a href="https://github.com/pajeronda" target="_blank" rel="noopener noreferrer">Pajeronda</a> • v${GrokCodeFastCard.CONSTANTS.VERSION}
          </div>
        </div>
                      </ha-card>
                    ${this._confirmDialogOpen ? this._renderConfirmationDialog() : ''}    `;
  }

  _renderConfirmationDialog() {
      return html`
        <div class="confirm-overlay">
          <div class="confirm-dialog">
            <h3>${this._confirmDialogTitle}</h3>
            <p>${this._confirmDialogText}</p>
            <div class="dialog-buttons">
              <button @click=${this._handleConfirmCancel}>${this._confirmDialogCancelText}</button>
              <button class="confirm-btn" @click=${this._handleConfirmAccept}>${this._confirmDialogConfirmText}</button>
            </div>
          </div>
        </div>
      `;
  }

  _renderChatSection() {
    return html`
      <div class="section section-chat">
        <div class="section-title">
          <span>💬 Conversation</span>
          <button class="btn-sync" @click=${this._syncChatHistory} .disabled=${this._isLoading} title="Sync chat history from server">🔄 Sync</button>
        </div>
        <div class="chat-container">
          <div class="chat-history">
            ${this._chatHistory.length === 0 && !this._isLoading
              ? html`<div class="empty-state">No messages yet.</div>`
              : this._chatHistory.map(msg => this._renderMessage(msg))}
          </div>
          ${this._isLoading ? html`
            <div class="loading-overlay">
              <div class="loading-spinner"></div>
              <div class="loading-text">Grok is thinking...</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderMessage(msg) {
    return html`
      <div class="chat-message ${msg.role}">
        <div class="role">${msg.role === 'user' ? '👤 You' : '🤖 Grok'}</div>
        <div class="content">
          ${msg.role === 'user' ? msg.content : msg.text}
          ${msg.code ? html`
            <div class="code-snippet" style="cursor: pointer;" @click=${() => this._loadCodeFromMessage(msg)} title="Click to load this code in the editor">
              💻 Code [${msg.code.split('\n').length} lines]${msg.timestamp ? ` • ${this._formatTime(msg.timestamp)}` : ''}
            </div>
          ` : ''}
          ${msg.role === 'user' && msg.attachments && msg.attachments.length > 0 ? html`
            <div style="margin-top: 8px;">
              ${msg.attachments.map(att => html`
                <div class="code-snippet">📄 ${att.filename}</div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderPromptSection() {
    return html`
      <div class="section">
        <div class="section-title">
          <span>✍️ Your Request</span>
          <label class="btn-upload" title="Upload ${GrokCodeFastCard.CONSTANTS.ALLOWED_FILE_EXTENSIONS.join(', ')}">
            ${this._pendingAttachments.length === 0 ? '📤 Upload file' : `📤 ${this._pendingAttachments.length} file${this._pendingAttachments.length > 1 ? 's' : ''}`}
            <input type="file" multiple hidden id="file-input" @change=${this._handleFileSelect} accept=${GrokCodeFastCard.CONSTANTS.ALLOWED_FILE_EXTENSIONS.join(',')}>
          </label>
        </div>
        <div class="attachments">
          ${this._pendingAttachments.map((file, index) => html`
            <div class="attachment-chip">
              <span>📄 ${file.filename}</span>
              <button @click=${() => this._clearAttachment(index)} title="Remove">×</button>
            </div>
          `)}
        </div>
        <textarea id="prompt-input" class="prompt-input" placeholder="Describe what you want to create or fix..." @keydown=${this._handleKeyDown} .disabled=${this._isLoading}></textarea>
        <div class="button-row">
          <button class="btn btn-danger" @click=${this._clearChat} .disabled=${this._isLoading}>🗑️ Clear Chat</button>
          <button class="btn btn-primary" @click=${this._sendPrompt} .disabled=${this._isLoading}>🚀 Send to Grok</button>
        </div>
      </div>
    `;
  }

  // ==================== UI FEEDBACK & NOTIFICATIONS ====================

  /**
   * Display banner notification to user
   * @param {string} message - Message to display
   * @param {string} type - Banner type: 'error', 'warning', or 'success'
   * @param {number} duration - Display duration in milliseconds
   */
  _showError(message, type = 'error', duration = GrokCodeFastCard.CONSTANTS.BANNER_DISPLAY_DURATION_MS) {
    this._error = message;
    this._errorType = type;
    this._errorClosing = false;

    if (this._errorTimeout) {
      clearTimeout(this._errorTimeout);
    }

    this._errorTimeout = setTimeout(() => {
      this._hideError();
    }, duration);
  }

  /**
   * Hide notification banner with animation
   */
  _hideError() {
    // Trigger closing animation
    this._errorClosing = true;
    this.requestUpdate();

    // Wait for animation to complete before removing
    setTimeout(() => {
      this._error = null;
      this._errorType = null;
      this._errorClosing = false;
    }, GrokCodeFastCard.CONSTANTS.BANNER_ANIMATION_DURATION_MS);
  }

  /**
   * Show confirmation dialog
   * @param {Object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.text - Dialog message
   * @param {string} options.confirmText - Confirm button text
   * @param {string} options.cancelText - Cancel button text
   * @param {Function} options.confirmAction - Callback when confirmed
   */
  _showConfirmationDialog({ title, text, confirmText, cancelText, confirmAction }) {
    this._confirmDialogTitle = title;
    this._confirmDialogText = text;
    this._confirmDialogConfirmText = confirmText || 'Confirm';
    this._confirmDialogCancelText = cancelText || 'Cancel';
    this._confirmDialogAction = confirmAction;
    this._confirmDialogOpen = true;
  }

  _handleConfirmCancel() {
      this._confirmDialogOpen = false;
      this._confirmDialogAction = null;
  }

  _handleConfirmAccept() {
      if (this._confirmDialogAction) {
          this._confirmDialogAction();
      }
      this._handleConfirmCancel(); // Close dialog
  }

  // ==================== SERVICE CALLS & API ====================

  /**
   * Smoothly scroll chat history to bottom
   * @param {string} behavior - Scroll behavior: 'smooth' or 'auto'
   */
  _smoothScrollToBottom(behavior = 'smooth') {
    requestAnimationFrame(() => {
        if (this._chatHistoryEl) {
            this._chatHistoryEl.scrollTo({
                top: this._chatHistoryEl.scrollHeight,
                behavior
            });
        }
    });
  }

  /**
   * Call Home Assistant service with exponential backoff retry
   * @param {Object} serviceData - Service call data
   * @param {number} retries - Number of retry attempts
   * @param {number} delay - Base delay between retries (ms)
   * @returns {Promise<Object>} Service response
   */
  async _callServiceWithRetry(serviceData, retries = GrokCodeFastCard.CONSTANTS.SERVICE_RETRY_ATTEMPTS, delay = GrokCodeFastCard.CONSTANTS.SERVICE_RETRY_DELAY_MS) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this._hass.connection.sendMessagePromise(serviceData);
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        const nextAttemptIn = delay * (i + 1);
        console.warn(`Service call failed. Retrying in ${nextAttemptIn}ms... (Attempt ${i + 1}/${retries})`, error);
        this._showError(`Network error. Retrying... (Attempt ${i + 1})`, 'warning', nextAttemptIn);
        await new Promise(resolve => setTimeout(resolve, nextAttemptIn));
      }
    }
  }

  /**
   * Parse response from Grok service with multiple fallback strategies
   * @param {string|Object} dataToParse - Raw response from service
   * @returns {{assistantText: string, assistantCode: string}}
   */
  _parseResponse(dataToParse) {
    // Handle object response directly
    if (typeof dataToParse === 'object' && dataToParse !== null) {
      return this._extractResponseFields(dataToParse);
    }

    // Validate string input
    if (typeof dataToParse !== 'string') {
      return this._handleInvalidFormat();
    }

    // Try parsing with multiple strategies
    return this._tryParseWithFallbacks(dataToParse);
  }

  /**
   * Extract response fields from object
   */
  _extractResponseFields(data) {
    return {
      assistantText: data.response_text || '',
      assistantCode: data.response_code || ''
    };
  }

  /**
   * Handle invalid data format
   */
  _handleInvalidFormat() {
    this._showError('Received unexpected data format from server.', 'warning');
    return { assistantText: '[Error: Unexpected data format]', assistantCode: '' };
  }

  /**
   * Try parsing with multiple fallback strategies
   */
  _tryParseWithFallbacks(dataString) {
    // Strategy 1: Standard JSON parsing
    const standardResult = this._tryStandardJsonParse(dataString);
    if (standardResult) return standardResult;

    // Strategy 2: Repair and re-parse
    const repairedResult = this._tryRepairAndParse(dataString);
    if (repairedResult) return repairedResult;

    // Strategy 3: Regex extraction
    const extractedResult = this._tryRegexExtraction(dataString);
    if (extractedResult) return extractedResult;

    // Strategy 4: Last resort - plain text
    return this._fallbackToPlainText(dataString);
  }

  /**
   * Try standard JSON parsing
   */
  _tryStandardJsonParse(dataString) {
    try {
      const parsed = JSON.parse(dataString);
      return this._extractResponseFields(parsed);
    } catch (e) {
      console.warn('Standard JSON parsing failed:', e.message);
      return null;
    }
  }

  /**
   * Try to repair malformed JSON and re-parse
   */
  _tryRepairAndParse(dataString) {
    try {
      // Fix common JSON issues with control characters
      const fixed = dataString.replace(/"(response_text|response_code)"\s*:\s*"((?:[^"\\]|\\.)*)"/gs, (match, key, value) => {
        const escaped = value
          .replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\')
          .replace(/(?<!\\)\n/g, '\\n')
          .replace(/(?<!\\)\r/g, '\\r')
          .replace(/(?<!\\)\t/g, '\\t');
        return `"${key}":"${escaped}"`;
      });

      const parsed = JSON.parse(fixed);
      console.info('Successfully parsed after fixing common JSON issues');
      return this._extractResponseFields(parsed);
    } catch (e) {
      console.warn('JSON repair attempt failed:', e.message);
      return null;
    }
  }

  /**
   * Try regex extraction as fallback for severely malformed JSON
   */
  _tryRegexExtraction(dataString) {
    try {
      const textPattern = /"response_text"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/s;
      const codePattern = /"response_code"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/s;

      const textMatch = dataString.match(textPattern);
      const codeMatch = dataString.match(codePattern);

      if (textMatch || codeMatch) {
        const assistantText = textMatch ? this._unescapeJsonString(textMatch[1]) : '';
        const assistantCode = codeMatch ? this._unescapeJsonString(codeMatch[1]) : '';
        console.info('Successfully extracted data using greedy regex fallback');
        return { assistantText, assistantCode };
      }
      return null;
    } catch (e) {
      console.warn('Regex extraction failed:', e.message);
      return null;
    }
  }

  /**
   * Unescape JSON string sequences
   */
  _unescapeJsonString(str) {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Last resort: treat entire response as plain text
   */
  _fallbackToPlainText(dataString) {
    console.error('All parsing strategies failed. Treating as plain text.');
    this._showError('Received malformed response. Displaying raw data.', 'warning');
    return { assistantText: dataString, assistantCode: '' };
  }

  /**
   * Send user prompt to Grok service
   * Handles message creation, service call, response parsing, and storage
   * @returns {Promise<void>}
   */
  async _sendPrompt() {
    const prompt = this._promptInput.value.trim();
    if (!prompt && this._pendingAttachments.length === 0) return;

    this._isLoading = true;
    const userMessage = {
      role: 'user',
      content: prompt,
      attachments: this._pendingAttachments,
      timestamp: new Date().toISOString()
    };
    if (this._currentCode && this._isCodeUserModified) {
      userMessage.code = this._currentCode;
    }
    this._chatHistory = [...this._chatHistory, userMessage];
    const attachmentsToSend = [...this._pendingAttachments];
    this._pendingAttachments = [];
    this._promptInput.value = '';
    this._saveToStorage();

    const requestData = { prompt };
    if (this._hass.user?.id) { requestData.user_id = this._hass.user.id; }
    if (this._previousResponseId) { requestData.previous_response_id = this._previousResponseId; }
    if (this._currentCode && this._isCodeUserModified) { requestData.code = this._currentCode; }
    if (attachmentsToSend.length > 0) { requestData.attachments = attachmentsToSend; }

    try {
      const response = await this._callServiceWithRetry({ type: 'call_service', domain: GrokCodeFastCard.CONSTANTS.SERVICE_DOMAIN, service: GrokCodeFastCard.CONSTANTS.SERVICE_SEND_PROMPT, service_data: { instructions: JSON.stringify(requestData) }, return_response: true });
      const { assistantText, assistantCode } = this._parseResponse(response.response);

      if (assistantCode) { 
        this._currentCode = assistantCode; 
        this._isCodeUserModified = false;
        const editor = this.shadowRoot.querySelector('ha-code-editor');
        if (editor) { editor.value = assistantCode; }
      }      

      if (response.response && typeof response.response === 'object' && response.response.previous_response_id) { 
        this._previousResponseId = response.response.previous_response_id; 
      }

      this._chatHistory = [...this._chatHistory, { role: 'assistant', text: assistantText, code: assistantCode, timestamp: new Date().toISOString() }];
    } catch (error) {
      const errorMessage = `Error: ${error.message || JSON.stringify(error)}`;
      console.error('Error calling grok_code_fast:', error);
      this._showError(errorMessage);
      this._chatHistory = [...this._chatHistory, { role: 'assistant', text: errorMessage, code: '', timestamp: new Date().toISOString() }];
    } finally {
      this._isLoading = false;
      this._saveToStorage();

      // Restore focus to prompt input after response
      await this.updateComplete;
      requestAnimationFrame(() => {
        if (this._promptInput) {
          this._promptInput.focus();
        }
      });
    }
  }

  // ==================== DATA PERSISTENCE & STORAGE ====================

  /**
   * Load card state from localStorage
   * Restores chat history, code, and settings
   */
  _loadFromStorage() {
    if (!this._storageKey) {
      console.warn('Storage key not initialized yet (user_id not available)');
      return;
    }

    try {
      const stored = localStorage.getItem(this._storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this._chatHistory = data.chatHistory || [];
        this._currentCode = data.currentCode || '';
        this._sendOnEnter = data.sendOnEnter || false;
        this._isCodeUserModified = data.isCodeUserModified || false;
        this._previousResponseId = data.previousResponseId || null;
      }
    } catch (e) { console.error('Failed to load from storage:', e); this._showError('Failed to load saved state.', 'warning'); }
  }

  /**
   * Prepare chat history for storage by stripping attachment content
   * @param {Array} chatHistory - Raw chat history
   * @returns {Array} Chat history prepared for storage
   */
  _prepareChatHistoryForStorage(chatHistory) {
    return chatHistory.map(msg => {
      if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
        return {
          ...msg,
          attachments: msg.attachments.map(att => ({
            filename: att.filename,
            contentLength: att.content ? att.content.length : 0
          }))
        };
      }
      return msg;
    });
  }

  /**
   * Build storage data object
   * @param {Array} chatHistory - Prepared chat history
   * @returns {string} JSON stringified data
   */
  _buildStorageData(chatHistory) {
    return JSON.stringify({
      chatHistory,
      currentCode: this._currentCode,
      sendOnEnter: this._sendOnEnter,
      isCodeUserModified: this._isCodeUserModified,
      previousResponseId: this._previousResponseId,
    });
  }

  /**
   * Save state to localStorage with quota handling
   */
  _saveToStorage() {
    if (!this._storageKey) {
      console.warn('Storage key not initialized yet (user_id not available)');
      return;
    }

    try {
      // Rotate chat history if it exceeds max limit
      let chatToSave = this._chatHistory;
      if (chatToSave.length > GrokCodeFastCard.CONSTANTS.MAX_CHAT_HISTORY_MESSAGES) {
        chatToSave = chatToSave.slice(-GrokCodeFastCard.CONSTANTS.MAX_CHAT_HISTORY_MESSAGES);
      }

      const chatHistoryForStorage = this._prepareChatHistoryForStorage(chatToSave);
      const dataToStore = this._buildStorageData(chatHistoryForStorage);

      localStorage.setItem(this._storageKey, dataToStore);
    } catch (e) {
      // Handle quota exceeded error
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('localStorage quota exceeded. Rotating chat history...');
        // Aggressively reduce history and retry
        const reducedHistory = this._chatHistory.slice(-GrokCodeFastCard.CONSTANTS.CHAT_HISTORY_ROTATION_SIZE);
        try {
          const chatHistoryForStorage = this._prepareChatHistoryForStorage(reducedHistory);
          const dataToStore = this._buildStorageData(chatHistoryForStorage);
          localStorage.setItem(this._storageKey, dataToStore);
          this._showError('Chat history trimmed to save space.', 'warning', 3000);
        } catch (e2) {
          console.error('Failed to save even after rotation:', e2);
          this._showError('Storage full. Consider clearing chat.', 'error');
        }
      } else {
        console.error('Failed to save to storage:', e);
        this._showError('Failed to save state to local storage.', 'error');
      }
    }
  }

  // ==================== BUSINESS LOGIC (CHAT, SYNC, FILES) ====================

  /**
   * Clear chat history, code, and backend memory
   * Shows confirmation dialog before proceeding
   * @returns {Promise<void>}
   */
  async _clearChat() {
    this._showConfirmationDialog({
        title: 'Clear Chat',
        text: 'This will clear the entire conversation and the code in the editor. This action cannot be undone. Are you sure?',
        confirmText: 'Clear',
        cancelText: 'Cancel',
        confirmAction: async () => {
            this._isLoading = true;
            try {
                const serviceData = {};
                if (this._hass.user?.id) { serviceData.user_id = this._hass.user.id; }
                await this._callServiceWithRetry({ type: 'call_service', domain: GrokCodeFastCard.CONSTANTS.SERVICE_DOMAIN, service: GrokCodeFastCard.CONSTANTS.SERVICE_CLEAR_MEMORY, service_data: serviceData, return_response: false });
            } catch (error) { 
                console.warn('Failed to clear backend memory:', error); 
                this._showError('Could not clear backend memory. Cleared frontend state only.', 'warning');
            } finally {
                this._isLoading = false;
                this._chatHistory = [];
                this._currentCode = '';
                this._isCodeUserModified = false;
                this._previousResponseId = null;
                this._pendingAttachments = [];
                this._saveToStorage();

                const editor = this.shadowRoot.querySelector('ha-code-editor');
                if (editor) { editor.value = ''; }
                const textarea = this.shadowRoot.querySelector('.code-output');
                if (textarea) { textarea.value = ''; }
            }
        }
    });
  }

  /**
   * Sync chat history from backend server
   * Shows confirmation dialog before proceeding
   * @returns {Promise<void>}
   */
  async _syncChatHistory() {
    this._showConfirmationDialog({
        title: 'Sync History',
        text: 'This will replace your current chat history with the version from the server. Any unsent messages may be lost. Continue?',
        confirmText: 'Sync',
        cancelText: 'Cancel',
        confirmAction: async () => {
            this._isLoading = true;
            try {
                const serviceData = { mode: 'code', limit: 50 };
                if (this._hass.user?.id) { serviceData.user_id = this._hass.user.id; }
                const response = await this._callServiceWithRetry({ type: 'call_service', domain: GrokCodeFastCard.CONSTANTS.SERVICE_DOMAIN, service: GrokCodeFastCard.CONSTANTS.SERVICE_SYNC_HISTORY, service_data: serviceData, return_response: true });
                if (response.response?.messages) {
                    this._chatHistory = response.response.messages.map(msg => {
                        if (msg.role === 'user') {
                            return { 
                                role: 'user', 
                                content: msg.content, 
                                timestamp: new Date(msg.timestamp * 1000).toISOString() 
                            };
                        } else { // Assistant message
                            const { assistantText, assistantCode } = this._parseResponse(msg.content);
                            return { 
                                role: 'assistant', 
                                text: assistantText, 
                                code: assistantCode, 
                                timestamp: new Date(msg.timestamp * 1000).toISOString() 
                            };
                        }
                    });
                    const lastAssistant = [...this._chatHistory].reverse().find(m => m.role === 'assistant' && m.code);
                    if (lastAssistant) {
                        this._currentCode = lastAssistant.code;
                        this._isCodeUserModified = false;
                        // Update editor UI
                        await this.updateComplete;
                        const editor = this.shadowRoot.querySelector('ha-code-editor');
                        if (editor) {
                            editor.value = lastAssistant.code;
                        }
                        const textarea = this.shadowRoot.querySelector('.code-output');
                        if (textarea) {
                            textarea.value = lastAssistant.code;
                        }
                    }
                    this._saveToStorage();
                    this._showError(`Synced ${response.response.messages.length} messages.`, 'success', 3000);
                }
            } catch (error) {
                console.error('Failed to sync chat history:', error);
                this._showError('Failed to sync chat history from server.');
            } finally {
                this._isLoading = false;
            }
        }
    });
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Toggle "Send on Enter" setting
   */
  _toggleSendOnEnter() {
    this._sendOnEnter = !this._sendOnEnter;
    this._saveToStorage();
  }

  /**
   * Handle keyboard events in prompt input
   * Sends prompt on Enter if setting enabled
   * @param {KeyboardEvent} event - Keyboard event
   */
  _handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && this._sendOnEnter) {
      event.preventDefault();
      this._sendPrompt();
    }
  }

  /**
   * Handle file selection for attachments
   * Validates file types and sizes
   * @param {Event} event - File input change event
   */
  _handleFileSelect(event) {
    const files = event.target.files;
    if (!files) return;

    for (const file of files) {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      const allowedMimes = GrokCodeFastCard.CONSTANTS.ALLOWED_FILES_MAP[extension] || [];

      if (!allowedMimes.length) {
        this._showError(`File type not allowed: ${file.name}`);
        continue;
      }

      if (file.size > GrokCodeFastCard.CONSTANTS.MAX_FILE_SIZE_BYTES) {
        this._showError(`File is too large: ${file.name} (max ${GrokCodeFastCard.CONSTANTS.MAX_FILE_SIZE_BYTES / 1024}KB)`);
        continue;
      }

      if (!allowedMimes.includes(file.type)) {
        console.warn(`File ${file.name} has unexpected MIME type: ${file.type}. Allowing based on extension, but this could be a risk.`);
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        this._pendingAttachments = [...this._pendingAttachments, { filename: file.name, content: e.target.result }];
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  }

  /**
   * Remove attachment from pending attachments
   * @param {number} index - Attachment index to remove
   */
  _clearAttachment(index) {
    this._pendingAttachments = this._pendingAttachments.filter((_, i) => i !== index);
  }

  /**
   * Debounced save to localStorage
   * Delays save to reduce write frequency during code editing
   */
  _debouncedSave() {
    if (this._saveDebounceTimeout) {
      clearTimeout(this._saveDebounceTimeout);
    }
    this._saveDebounceTimeout = setTimeout(() => {
      this._saveToStorage();
    }, GrokCodeFastCard.CONSTANTS.SAVE_DEBOUNCE_DELAY_MS);
  }

  // ==================== CODE EDITOR MANAGEMENT ====================

  /**
   * Create code editor component
   * Uses ha-code-editor if available, falls back to textarea
   */
  _createCodeEditor() {
    const container = this._codeEditorContainer;
    if (!container) return;
    container.innerHTML = '';
    if (customElements.get('ha-code-editor')) {
      this._isEditorFallback = false;
      const codeEditor = document.createElement('ha-code-editor');
      codeEditor.hass = this._hass;
      codeEditor.mode = 'jinja2';
      codeEditor.value = this._currentCode || ' ';
      codeEditor.setAttribute('dir', 'ltr');
      codeEditor.addEventListener('value-changed', (e) => {
        if (e.detail.value !== this._currentCode) {
            this._currentCode = e.detail.value;
            this._isCodeUserModified = true;
            this._debouncedSave();
        }
      });
      container.appendChild(codeEditor);
    } else {
      console.warn('<ha-code-editor> not found. Using fallback <textarea>.');
      this._isEditorFallback = true;
      const textarea = document.createElement('textarea');
      textarea.className = 'code-output';
      textarea.value = this._currentCode || '# Error: ha-code-editor not found.';
      textarea.spellcheck = false;
      textarea.addEventListener('input', (e) => {
        this._currentCode = e.target.value;
        this._isCodeUserModified = true;
        this._debouncedSave();
      });
      container.appendChild(textarea);
    }
  }

  /**
   * Copy current code to clipboard
   */
  _copyCode() {
    if (!this._currentCode) return;
    navigator.clipboard.writeText(this._currentCode).then(() => {
      this._showError('Code copied to clipboard!', 'success', 2000);
    }).catch(err => this._showError('Failed to copy code.'));
  }

  /**
   * Clear code editor content
   * Shows confirmation dialog before proceeding
   */
  _clearCodeEditor() {
    this._showConfirmationDialog({
      title: 'Clear Code Editor',
      text: 'This will clear all code in the editor. This action cannot be undone. Are you sure?',
      confirmText: 'Clear',
      cancelText: 'Cancel',
      confirmAction: () => {
        // Clear code in memory and UI only (don't save to storage)
        this._currentCode = '';
        this._isCodeUserModified = false;

        // Update the editor UI
        const editor = this.shadowRoot.querySelector('ha-code-editor');
        if (editor) {
          editor.value = '';
        }
        const textarea = this.shadowRoot.querySelector('.code-output');
        if (textarea) {
          textarea.value = '';
        }

        this._showError('Code editor cleared.', 'success', 2000);
      }
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Format timestamp for display
   * Shows HH:MM for today, HH:MM (MM/DD) for other days
   * @param {string} timestamp - ISO timestamp string
   * @returns {string} Formatted time string
   */
  _formatTime(timestamp) {
    try {
      const date = new Date(timestamp);
      const now = new Date();

      // Check if same day
      const isSameDay = date.getDate() === now.getDate() &&
                        date.getMonth() === now.getMonth() &&
                        date.getFullYear() === now.getFullYear();

      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const time = `${hours}:${minutes}`;

      if (isSameDay) {
        return time;
      } else {
        // Different day: show HH:MM (MM/DD)
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${time} (${month}/${day})`;
      }
    } catch (e) {
      return '';
    }
  }

  /**
   * Load code from chat message into editor
   * @param {Object} msg - Chat message object with code property
   */
  _loadCodeFromMessage(msg) {
    if (!msg.code) return;

    // Load the code into the editor
    this._currentCode = msg.code;
    this._isCodeUserModified = false; // Code from history, not user-modified

    // Update the editor UI
    const editor = this.shadowRoot.querySelector('ha-code-editor');
    if (editor) {
      editor.value = msg.code;
    }
    const textarea = this.shadowRoot.querySelector('.code-output');
    if (textarea) {
      textarea.value = msg.code;
    }

    this._showError('Code loaded into editor.', 'success', 2000);
  }

  /**
   * Calculate card grid options for Home Assistant layout
   * @returns {Object} Grid options with columns and rows
   */
  getGridOptions() {
    let rows = 6;
    if (this._currentCode) { rows += 3; }
    rows += Math.min(Math.ceil(this._chatHistory.length / 3), 5);
    return { columns: 12, rows: Math.max(rows, 6) };
  }
}

customElements.define('grok-code-fast-card', GrokCodeFastCard);

class GrokCodeFastCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
    };
  }

  setConfig(config) {
    this._config = config;
  }

  _valueChanged(ev) {
    if (!this.hass) return;
    const newConfig = ev.detail.value;
    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  render() {
    if (!this.hass) {
      return html``;
    }

    const schema = [{
        name: "theme",
        selector: { theme: {} },
    }];

    return html`
      <div class="card-config">
        <ha-form
          .hass=${this.hass}
          .data=${this._config}
          .schema=${schema}
          .computeLabel=${(schema) => 'Theme'}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  static get styles() {
    return css`
      .card-config { padding: 16px; }
    `;
  }
}

customElements.define('grok-code-fast-card-editor', GrokCodeFastCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "grok-code-fast-card",
  name: "Grok Code Fast Card",
  description: "AI-powered code assistant interface for xAI Grok",
  preview: true,
});

console.info(
  `%c GROK-CODE-FAST-CARD %c Version ${GrokCodeFastCard.CONSTANTS.VERSION} (Final) `,
  'color: white; background: #00bcd4; font-weight: bold;',
  'color: #00bcd4; background: white; font-weight: bold;'
);
