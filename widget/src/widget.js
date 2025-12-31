/**
 * Handled - Embeddable Chat Widget
 * 
 * Usage: Add this to your website:
 * <script src="https://cdn.handled.ai/widget.js" data-api-key="YOUR_API_KEY"></script>
 * 
 * Or initialize manually:
 * Handled.init({ apiKey: 'YOUR_API_KEY' });
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.Handled && window.Handled.initialized) return;

  // API URL - can be overridden via data-api-url attribute or config
  let HANDLED_API_URL = 'https://api.handled.ai';
  const HANDLED_WS_URL = 'wss://api.handled.ai';

  // Check for custom API URL from script tag
  const currentScript = document.currentScript || document.querySelector('script[data-api-key]');
  if (currentScript && currentScript.getAttribute('data-api-url')) {
    HANDLED_API_URL = currentScript.getAttribute('data-api-url');
  }

  // Default configuration
  const defaultConfig = {
    apiKey: null,
    position: 'bottom-right',
    primaryColor: '#f97316',
    greeting: 'Hi! How can I help you today?',
    placeholder: 'Type a message...',
    showBranding: true,
    autoOpen: false,
    autoOpenDelay: 5000,
    mobileBreakpoint: 768
  };

  // State
  let config = { ...defaultConfig };
  let visitorId = null;
  let conversationId = null;
  let socket = null;
  let isOpen = false;
  let isTyping = false;
  let messages = [];
  let unreadCount = 0;
  let businessConfig = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  function init(userConfig = {}) {
    // Merge configs
    config = { ...defaultConfig, ...userConfig };

    // Override API URL if provided in config
    if (userConfig.apiUrl) {
      HANDLED_API_URL = userConfig.apiUrl;
    }

    // Get API key from script tag if not provided
    if (!config.apiKey) {
      const script = document.querySelector('script[data-api-key]');
      if (script) {
        config.apiKey = script.getAttribute('data-api-key');
      }
    }

    if (!config.apiKey) {
      console.error('Handled: API key required');
      return;
    }

    // Generate or retrieve visitor ID
    visitorId = localStorage.getItem('handled_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + generateId();
      localStorage.setItem('handled_visitor_id', visitorId);
    }

    // Load saved conversation
    conversationId = sessionStorage.getItem('handled_conversation_id');

    // Fetch business config and render
    fetchBusinessConfig().then(() => {
      injectStyles();
      renderWidget();
      setupEventListeners();
      
      if (conversationId) {
        loadConversationHistory();
      }

      // Auto-open after delay
      if (config.autoOpen) {
        setTimeout(() => {
          if (!isOpen && !sessionStorage.getItem('handled_opened')) {
            openWidget();
          }
        }, config.autoOpenDelay);
      }

      window.Handled.initialized = true;
    });
  }

  async function fetchBusinessConfig() {
    try {
      const response = await fetch(`${HANDLED_API_URL}/widget/config`, {
        headers: { 'X-API-Key': config.apiKey }
      });
      
      if (response.ok) {
        businessConfig = await response.json();
        // Override config with business settings
        config.primaryColor = businessConfig.primaryColor || config.primaryColor;
        config.greeting = businessConfig.widgetGreeting || config.greeting;
        config.position = (businessConfig.widgetPosition || 'BOTTOM_RIGHT').toLowerCase().replace('_', '-');
      }
    } catch (error) {
      console.error('Handled: Failed to load config', error);
    }
  }

  // ============================================
  // RENDERING
  // ============================================

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #handled-widget-container {
        --handled-primary: ${config.primaryColor};
        --handled-primary-dark: ${adjustColor(config.primaryColor, -20)};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        position: fixed;
        z-index: 999999;
        ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      }

      #handled-widget-button {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--handled-primary);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      #handled-widget-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }

      #handled-widget-button svg {
        width: 28px;
        height: 28px;
        fill: white;
      }

      #handled-widget-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ef4444;
        color: white;
        font-size: 12px;
        font-weight: 600;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
      }

      #handled-widget-window {
        position: absolute;
        ${config.position.includes('right') ? 'right: 0;' : 'left: 0;'}
        ${config.position.includes('bottom') ? 'bottom: 75px;' : 'top: 75px;'}
        width: 380px;
        height: 520px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
      }

      #handled-widget-window.open {
        display: flex;
        animation: handled-slide-in 0.3s ease;
      }

      @keyframes handled-slide-in {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      #handled-widget-header {
        background: var(--handled-primary);
        color: white;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      #handled-widget-header-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #handled-widget-header-avatar svg {
        width: 24px;
        height: 24px;
        fill: white;
      }

      #handled-widget-header-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      #handled-widget-header-info {
        flex: 1;
      }

      #handled-widget-header-name {
        font-weight: 600;
        font-size: 16px;
      }

      #handled-widget-header-status {
        font-size: 12px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      #handled-widget-header-status::before {
        content: '';
        width: 8px;
        height: 8px;
        background: #4ade80;
        border-radius: 50%;
      }

      #handled-widget-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        opacity: 0.8;
        transition: opacity 0.2s;
      }

      #handled-widget-close:hover {
        opacity: 1;
      }

      #handled-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f9fafb;
      }

      .handled-message {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 16px;
        word-wrap: break-word;
      }

      .handled-message-user {
        align-self: flex-end;
        background: var(--handled-primary);
        color: white;
        border-bottom-right-radius: 4px;
      }

      .handled-message-assistant {
        align-self: flex-start;
        background: white;
        color: #1f2937;
        border: 1px solid #e5e7eb;
        border-bottom-left-radius: 4px;
      }

      .handled-message-time {
        font-size: 11px;
        opacity: 0.6;
        margin-top: 4px;
      }

      .handled-message-content {
        line-height: 1.5;
      }

      .handled-message-content strong {
        font-weight: 600;
      }

      .handled-message-content br + br {
        display: block;
        content: '';
        margin-top: 8px;
      }

      .handled-message-assistant .handled-message-content {
        white-space: pre-wrap;
      }

      /* Images in messages */
      .handled-message-content img {
        max-width: 100%;
        border-radius: 8px;
        margin: 8px 0;
        display: block;
      }

      .handled-message-image {
        max-width: 200px;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s;
      }

      .handled-message-image:hover {
        transform: scale(1.02);
      }

      .handled-message-content a {
        color: var(--handled-primary);
        text-decoration: none;
      }

      .handled-message-content a:hover {
        text-decoration: underline;
      }

      .handled-message-user .handled-message-content a {
        color: white;
        text-decoration: underline;
      }

      /* Image grid for multiple images */
      .handled-image-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin: 8px 0;
      }

      .handled-image-grid img {
        width: 100%;
        height: 120px;
        object-fit: cover;
        border-radius: 8px;
        cursor: pointer;
      }

      /* Message Grouping - consecutive messages from same sender */
      .handled-message-grouped {
        margin-top: -8px;
      }

      .handled-message-grouped .handled-message-time {
        display: none;
      }

      /* User message grouping - adjust corners for visual continuity */
      .handled-message-user.handled-message-group-start {
        border-bottom-right-radius: 4px;
      }

      .handled-message-user.handled-message-group-middle {
        border-top-right-radius: 4px;
        border-bottom-right-radius: 4px;
      }

      .handled-message-user.handled-message-group-end {
        border-top-right-radius: 4px;
      }

      /* Assistant message grouping */
      .handled-message-assistant.handled-message-group-start {
        border-bottom-left-radius: 4px;
      }

      .handled-message-assistant.handled-message-group-middle {
        border-top-left-radius: 4px;
        border-bottom-left-radius: 4px;
      }

      .handled-message-assistant.handled-message-group-end {
        border-top-left-radius: 4px;
      }

      .handled-quick-replies {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        padding: 0 4px;
      }

      .handled-quick-reply {
        background: white;
        border: 1px solid var(--handled-primary);
        color: var(--handled-primary);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .handled-quick-reply:hover {
        background: var(--handled-primary);
        color: white;
      }

      /* Rich Confirmation Cards */
      .handled-card {
        background: white;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        overflow: hidden;
        max-width: 90%;
        align-self: flex-start;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }

      .handled-card-header {
        background: linear-gradient(135deg, var(--handled-primary), var(--handled-primary-dark));
        color: white;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .handled-card-header-icon {
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      }

      .handled-card-header-text {
        flex: 1;
      }

      .handled-card-header-title {
        font-weight: 600;
        font-size: 14px;
      }

      .handled-card-header-subtitle {
        font-size: 12px;
        opacity: 0.9;
      }

      .handled-card-body {
        padding: 16px;
      }

      .handled-card-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #f3f4f6;
      }

      .handled-card-row:last-child {
        border-bottom: none;
      }

      .handled-card-label {
        color: #6b7280;
        font-size: 13px;
      }

      .handled-card-value {
        color: #1f2937;
        font-weight: 500;
        font-size: 13px;
        text-align: right;
      }

      .handled-card-confirmation {
        background: #f0fdf4;
        border: 1px dashed #22c55e;
        border-radius: 8px;
        padding: 12px;
        margin-top: 12px;
        text-align: center;
      }

      .handled-card-confirmation-label {
        font-size: 11px;
        color: #16a34a;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }

      .handled-card-confirmation-code {
        font-size: 18px;
        font-weight: 700;
        color: #15803d;
        font-family: 'SF Mono', Monaco, monospace;
      }

      .handled-card-footer {
        background: #f9fafb;
        padding: 12px 16px;
        font-size: 12px;
        color: #6b7280;
        border-top: 1px solid #e5e7eb;
      }

      .handled-card-items {
        margin: 8px 0;
      }

      .handled-card-item {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 13px;
      }

      .handled-card-item-name {
        color: #374151;
      }

      .handled-card-item-qty {
        color: #6b7280;
        margin-left: 4px;
      }

      .handled-card-item-price {
        color: #1f2937;
        font-weight: 500;
      }

      .handled-card-total {
        display: flex;
        justify-content: space-between;
        padding: 12px 0 0;
        margin-top: 8px;
        border-top: 2px solid #e5e7eb;
        font-weight: 600;
      }

      .handled-card-total-label {
        color: #374151;
      }

      .handled-card-total-value {
        color: var(--handled-primary);
        font-size: 16px;
      }

      #handled-widget-typing {
        align-self: flex-start;
        padding: 10px 14px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        display: none;
        align-items: center;
        gap: 8px;
      }

      #handled-widget-typing.visible {
        display: flex;
      }

      #handled-widget-typing-text {
        font-size: 13px;
        color: #6b7280;
        font-weight: 500;
      }

      .handled-typing-dots {
        display: flex;
        gap: 3px;
        align-items: center;
      }

      .handled-typing-dot {
        width: 6px;
        height: 6px;
        background: #9ca3af;
        border-radius: 50%;
        animation: handled-typing 1.4s infinite;
      }

      .handled-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .handled-typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes handled-typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-3px); }
      }

      #handled-widget-input-container {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }

      #handled-widget-input {
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      #handled-widget-input:focus {
        border-color: var(--handled-primary);
      }

      #handled-widget-send {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--handled-primary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      #handled-widget-send:hover {
        background: var(--handled-primary-dark);
      }

      #handled-widget-send:disabled {
        background: #d1d5db;
        cursor: not-allowed;
      }

      #handled-widget-send svg {
        width: 18px;
        height: 18px;
        fill: white;
      }

      #handled-widget-branding {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: #9ca3af;
        background: white;
      }

      #handled-widget-branding a {
        color: #6b7280;
        text-decoration: none;
      }

      @media (max-width: ${config.mobileBreakpoint}px) {
        #handled-widget-window {
          width: 100vw;
          height: 100vh;
          max-height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderWidget() {
    const container = document.createElement('div');
    container.id = 'handled-widget-container';
    
    container.innerHTML = `
      <button id="handled-widget-button" aria-label="Open chat">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <span id="handled-widget-badge" style="display: none;">0</span>
      </button>

      <div id="handled-widget-window">
        <div id="handled-widget-header">
          <div id="handled-widget-header-avatar">
            ${businessConfig?.logoUrl
              ? `<img src="${escapeHtml(businessConfig.logoUrl)}" alt="${escapeHtml(businessConfig.businessName || 'Logo')}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><svg viewBox="0 0 24 24" style="display:none"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`
              : `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`
            }
          </div>
          <div id="handled-widget-header-info">
            <div id="handled-widget-header-name">${businessConfig?.businessName || 'Chat'}</div>
            <div id="handled-widget-header-status">Online now</div>
          </div>
          <button id="handled-widget-close" aria-label="Close chat">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div id="handled-widget-messages">
          <div id="handled-widget-typing">
            <span id="handled-widget-typing-text">typing</span>
            <span class="handled-typing-dots">
              <span class="handled-typing-dot"></span>
              <span class="handled-typing-dot"></span>
              <span class="handled-typing-dot"></span>
            </span>
          </div>
        </div>

        <div id="handled-widget-input-container">
          <input 
            type="text" 
            id="handled-widget-input" 
            placeholder="${config.placeholder}"
            autocomplete="off"
          />
          <button id="handled-widget-send" aria-label="Send message">
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>

        ${config.showBranding ? `
          <div id="handled-widget-branding">
            Powered by <a href="https://handled.ai" target="_blank">Handled</a>
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(container);
  }

  function setupEventListeners() {
    // Toggle button
    document.getElementById('handled-widget-button').addEventListener('click', toggleWidget);
    
    // Close button
    document.getElementById('handled-widget-close').addEventListener('click', closeWidget);

    // Send button
    document.getElementById('handled-widget-send').addEventListener('click', sendMessage);

    // Input enter key
    document.getElementById('handled-widget-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeWidget();
      }
    });
  }

  // ============================================
  // WIDGET CONTROL
  // ============================================

  function toggleWidget() {
    if (isOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  function openWidget() {
    isOpen = true;
    document.getElementById('handled-widget-window').classList.add('open');
    document.getElementById('handled-widget-input').focus();
    unreadCount = 0;
    updateBadge();
    sessionStorage.setItem('handled_opened', 'true');

    // Start conversation if needed
    if (!conversationId) {
      startConversation();
    }

    // Track event
    trackEvent('widget_opened');
  }

  function closeWidget() {
    isOpen = false;
    document.getElementById('handled-widget-window').classList.remove('open');
    trackEvent('widget_closed');
  }

  // ============================================
  // CONVERSATION
  // ============================================

  async function startConversation() {
    try {
      const response = await fetch(`${HANDLED_API_URL}/widget/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        },
        body: JSON.stringify({
          visitorId,
          pageUrl: window.location.href,
          referrer: document.referrer,
          userAgent: navigator.userAgent
        })
      });

      const data = await response.json();
      conversationId = data.conversationId;
      sessionStorage.setItem('handled_conversation_id', conversationId);

      // Show greeting
      addMessage({
        role: 'ASSISTANT',
        content: data.greeting,
        createdAt: new Date().toISOString()
      });

      // Connect WebSocket
      connectSocket();
    } catch (error) {
      console.error('Handled: Failed to start conversation', error);
    }
  }

  async function loadConversationHistory() {
    try {
      const response = await fetch(
        `${HANDLED_API_URL}/widget/conversations/${conversationId}/messages`,
        { headers: { 'X-API-Key': config.apiKey } }
      );

      if (response.ok) {
        const history = await response.json();
        history.forEach(msg => addMessage(msg, false));
        scrollToBottom();
        connectSocket();
      } else {
        // Conversation expired, start new one
        conversationId = null;
        sessionStorage.removeItem('handled_conversation_id');
        if (isOpen) startConversation();
      }
    } catch (error) {
      console.error('Handled: Failed to load history', error);
    }
  }

  async function sendMessage() {
    const input = document.getElementById('handled-widget-input');
    const content = input.value.trim();
    
    if (!content) return;

    input.value = '';
    document.getElementById('handled-widget-send').disabled = true;

    // Add user message immediately
    addMessage({
      role: 'USER',
      content,
      createdAt: new Date().toISOString()
    });

    // Show typing indicator
    showTyping();

    try {
      const response = await fetch(
        `${HANDLED_API_URL}/widget/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey
          },
          body: JSON.stringify({ content, visitorId })
        }
      );

      const data = await response.json();

      hideTyping();

      // Add AI response with quick replies if provided
      addMessage({
        role: 'ASSISTANT',
        content: data.response,
        createdAt: new Date().toISOString()
      }, true, data.quickReplies || null);

    } catch (error) {
      console.error('Handled: Failed to send message', error);
      hideTyping();
      addMessage({
        role: 'ASSISTANT',
        content: "Sorry, I couldn't process that. Please try again.",
        createdAt: new Date().toISOString()
      });
    }

    document.getElementById('handled-widget-send').disabled = false;
    input.focus();
  }

  // ============================================
  // WEBSOCKET
  // ============================================

  function connectSocket() {
    // For now, use polling. WebSocket can be added for real-time
    // This keeps the widget lighter weight
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function addMessage(message, scroll = true, quickReplies = null) {
    const container = document.getElementById('handled-widget-messages');
    const typing = document.getElementById('handled-widget-typing');

    // Remove any existing quick replies
    const existingReplies = container.querySelector('.handled-quick-replies');
    if (existingReplies) existingReplies.remove();

    // Check if this message should be grouped with the previous one
    const prevMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const isGrouped = prevMessage && prevMessage.role === message.role;

    // Check if this is a confirmation message that should be rendered as a card
    const confirmationType = message.role === 'ASSISTANT'
      ? detectConfirmationType(message.content)
      : null;

    const div = document.createElement('div');

    if (confirmationType) {
      // Render as a rich card (cards don't participate in grouping)
      div.innerHTML = renderConfirmationCard(message.content, confirmationType);
    } else {
      // Use markdown parsing for assistant messages, plain text for user
      const content = message.role === 'ASSISTANT'
        ? parseMarkdown(message.content)
        : escapeHtml(message.content);

      // Build class list with grouping
      let classes = `handled-message handled-message-${message.role.toLowerCase()}`;
      if (isGrouped) {
        classes += ' handled-message-grouped handled-message-group-end';
      }

      div.className = classes;
      div.innerHTML = `
        <div class="handled-message-content">${content}</div>
        <div class="handled-message-time">${formatTime(message.createdAt)}</div>
      `;

      // Update previous message's grouping class if this is grouped
      if (isGrouped) {
        const allMessages = container.querySelectorAll('.handled-message');
        const prevDiv = allMessages[allMessages.length - 1];
        if (prevDiv) {
          // Update previous message from standalone/end to start/middle
          if (prevDiv.classList.contains('handled-message-group-end')) {
            prevDiv.classList.remove('handled-message-group-end');
            prevDiv.classList.add('handled-message-group-middle');
          } else if (!prevDiv.classList.contains('handled-message-group-start') &&
                     !prevDiv.classList.contains('handled-message-group-middle')) {
            prevDiv.classList.add('handled-message-group-start');
          }
        }
      }
    }

    container.insertBefore(div, typing);
    messages.push(message);

    // Add quick replies if provided
    if (quickReplies && quickReplies.length > 0 && message.role === 'ASSISTANT') {
      renderQuickReplies(quickReplies, container, typing);
    }

    if (scroll) scrollToBottom();

    // Update unread count if window closed
    if (!isOpen && message.role === 'ASSISTANT') {
      unreadCount++;
      updateBadge();
    }
  }

  function renderQuickReplies(replies, container, typing) {
    const div = document.createElement('div');
    div.className = 'handled-quick-replies';

    replies.forEach(reply => {
      const btn = document.createElement('button');
      btn.className = 'handled-quick-reply';
      btn.textContent = reply;
      btn.addEventListener('click', () => {
        // Remove quick replies when one is clicked
        div.remove();

        // Handle special actions
        if (reply === 'Start new conversation') {
          // Clear session and start fresh
          conversationId = null;
          sessionStorage.removeItem('handled_conversation_id');
          // Clear messages
          const messagesContainer = document.getElementById('handled-widget-messages');
          const existingMessages = messagesContainer.querySelectorAll('.handled-message');
          existingMessages.forEach(msg => msg.remove());
          messages = [];
          // Start new conversation
          startConversation();
          return;
        }

        // Set input and send
        document.getElementById('handled-widget-input').value = reply;
        sendMessage();
      });
      div.appendChild(btn);
    });

    container.insertBefore(div, typing);
  }

  function showTyping() {
    const typingEl = document.getElementById('handled-widget-typing');
    const typingText = document.getElementById('handled-widget-typing-text');

    // Set the business name in the typing indicator
    const businessName = businessConfig?.businessName || 'Assistant';
    typingText.textContent = `${businessName} is typing`;

    typingEl.classList.add('visible');
    scrollToBottom();
  }

  function hideTyping() {
    document.getElementById('handled-widget-typing').classList.remove('visible');
  }

  function scrollToBottom() {
    const container = document.getElementById('handled-widget-messages');
    container.scrollTop = container.scrollHeight;
  }

  function updateBadge() {
    const badge = document.getElementById('handled-widget-badge');
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ============================================
  // UTILITIES
  // ============================================

  function generateId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // RICH CARD DETECTION & RENDERING
  // ============================================

  function detectConfirmationType(text) {
    const lower = text.toLowerCase();

    // Check for booking confirmation
    if ((lower.includes('booking') || lower.includes('appointment') || lower.includes('reservation')) &&
        (lower.includes('confirmed') || lower.includes('confirmation') || lower.match(/hnd-[a-z0-9]+/i))) {
      return 'booking';
    }

    // Check for order confirmation
    if ((lower.includes('order') && !lower.includes('order to')) &&
        (lower.includes('confirmed') || lower.includes('confirmation') || lower.match(/order\s*#?\s*\d+/i))) {
      return 'order';
    }

    return null;
  }

  function parseConfirmationDetails(text, type) {
    const details = {};
    const lines = text.split('\n');

    // Extract confirmation code (HND-XXXX format or Order #XXX)
    const codeMatch = text.match(/(?:confirmation\s*(?:code|number|#)?:?\s*|order\s*#?\s*)([A-Z0-9-]+)/i);
    if (codeMatch) {
      details.confirmationCode = codeMatch[1].toUpperCase();
    }

    // Extract date
    const datePatterns = [
      /(?:date|on|for)[:\s]+([A-Za-z]+(?:day)?,?\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
      /([A-Za-z]+(?:day)?,?\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        details.date = match[1].trim();
        break;
      }
    }

    // Extract time
    const timeMatch = text.match(/(?:at|time)[:\s]+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i) ||
                      text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
    if (timeMatch) {
      details.time = timeMatch[1].trim();
    }

    // Extract service/treatment name
    const servicePatterns = [
      /(?:service|treatment|for)[:\s]+([^\n,]+?)(?:\s+on|\s+at|\s+for|\n|$)/i,
      /(?:booked|scheduled)[:\s]+(?:a\s+)?([^\n,]+?)(?:\s+on|\s+at|\s+for|\n|$)/i
    ];
    for (const pattern of servicePatterns) {
      const match = text.match(pattern);
      if (match && match[1].length < 50) {
        details.service = match[1].trim();
        break;
      }
    }

    // Extract party size for restaurant bookings
    const partyMatch = text.match(/(?:party\s+(?:of|size)|for)\s+(\d+)\s*(?:people|guests|persons)?/i) ||
                       text.match(/(\d+)\s*(?:people|guests|persons)/i);
    if (partyMatch) {
      details.partySize = partyMatch[1];
    }

    // Extract stylist/provider name
    const providerMatch = text.match(/(?:with|stylist|provider|by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (providerMatch) {
      details.provider = providerMatch[1];
    }

    // For orders, try to extract items and total
    if (type === 'order') {
      const items = [];
      const itemPattern = /[-•]\s*(.+?)\s*(?:x\s*(\d+)|(\d+)\s*x)?\s*[-–]\s*\$?([\d.]+)/gi;
      let match;
      while ((match = itemPattern.exec(text)) !== null) {
        items.push({
          name: match[1].trim(),
          quantity: match[2] || match[3] || '1',
          price: match[4]
        });
      }
      if (items.length > 0) {
        details.items = items;
      }

      // Extract total
      const totalMatch = text.match(/total[:\s]+\$?([\d.]+)/i);
      if (totalMatch) {
        details.total = totalMatch[1];
      }
    }

    return details;
  }

  function renderConfirmationCard(text, type) {
    const details = parseConfirmationDetails(text, type);
    const isBooking = type === 'booking';
    const icon = isBooking ? '📅' : '🛒';
    const title = isBooking ? 'Booking Confirmed' : 'Order Confirmed';
    const businessName = businessConfig?.businessName || 'Business';

    let cardHtml = `
      <div class="handled-card">
        <div class="handled-card-header">
          <div class="handled-card-header-icon">${icon}</div>
          <div class="handled-card-header-text">
            <div class="handled-card-header-title">${escapeHtml(title)}</div>
            <div class="handled-card-header-subtitle">${escapeHtml(businessName)}</div>
          </div>
        </div>
        <div class="handled-card-body">
    `;

    if (isBooking) {
      // Booking card details
      if (details.service) {
        cardHtml += `
          <div class="handled-card-row">
            <span class="handled-card-label">Service</span>
            <span class="handled-card-value">${escapeHtml(details.service)}</span>
          </div>
        `;
      }
      if (details.date) {
        cardHtml += `
          <div class="handled-card-row">
            <span class="handled-card-label">Date</span>
            <span class="handled-card-value">${escapeHtml(details.date)}</span>
          </div>
        `;
      }
      if (details.time) {
        cardHtml += `
          <div class="handled-card-row">
            <span class="handled-card-label">Time</span>
            <span class="handled-card-value">${escapeHtml(details.time)}</span>
          </div>
        `;
      }
      if (details.partySize) {
        cardHtml += `
          <div class="handled-card-row">
            <span class="handled-card-label">Party Size</span>
            <span class="handled-card-value">${escapeHtml(details.partySize)} guests</span>
          </div>
        `;
      }
      if (details.provider) {
        cardHtml += `
          <div class="handled-card-row">
            <span class="handled-card-label">With</span>
            <span class="handled-card-value">${escapeHtml(details.provider)}</span>
          </div>
        `;
      }
    } else {
      // Order card details
      if (details.items && details.items.length > 0) {
        cardHtml += `<div class="handled-card-items">`;
        details.items.forEach(item => {
          cardHtml += `
            <div class="handled-card-item">
              <span>
                <span class="handled-card-item-name">${escapeHtml(item.name)}</span>
                <span class="handled-card-item-qty">x${item.quantity}</span>
              </span>
              <span class="handled-card-item-price">$${item.price}</span>
            </div>
          `;
        });
        cardHtml += `</div>`;
      }
      if (details.total) {
        cardHtml += `
          <div class="handled-card-total">
            <span class="handled-card-total-label">Total</span>
            <span class="handled-card-total-value">$${escapeHtml(details.total)}</span>
          </div>
        `;
      }
    }

    // Confirmation code
    if (details.confirmationCode) {
      cardHtml += `
        <div class="handled-card-confirmation">
          <div class="handled-card-confirmation-label">Confirmation Code</div>
          <div class="handled-card-confirmation-code">${escapeHtml(details.confirmationCode)}</div>
        </div>
      `;
    }

    cardHtml += `
        </div>
        <div class="handled-card-footer">
          You'll receive a confirmation email shortly.
        </div>
      </div>
    `;

    return cardHtml;
  }

  function parseMarkdown(text) {
    // Escape HTML first for security
    let html = escapeHtml(text);

    // Images: ![alt](url) - only allow http/https URLs for security
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (match, alt, url) => {
      // Validate URL is an image-like URL (basic check)
      const safeAlt = alt.replace(/"/g, '&quot;');
      return `<img src="${url}" alt="${safeAlt}" class="handled-message-image" loading="lazy">`;
    });

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Bullet lists: - item or * item at start of line
    html = html.replace(/<br>[-*]\s+/g, '<br>• ');
    html = html.replace(/^[-*]\s+/, '• ');

    // Headers: remove ## and just bold
    html = html.replace(/<br>#{1,3}\s*(.+?)(<br>|$)/g, '<br><strong>$1</strong>$2');

    return html;
  }

  function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  async function trackEvent(eventType, eventData = {}) {
    try {
      await fetch(`${HANDLED_API_URL}/widget/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        },
        body: JSON.stringify({
          eventType,
          visitorId,
          sessionId: conversationId,
          eventData
        })
      });
    } catch (error) {
      // Silently fail analytics
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.Handled = {
    init,
    open: openWidget,
    close: closeWidget,
    toggle: toggleWidget,
    initialized: false,

    // Identify user
    identify: function(userData) {
      if (conversationId && userData) {
        fetch(`${HANDLED_API_URL}/widget/conversations/${conversationId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey
          },
          body: JSON.stringify({
            customerName: userData.name,
            customerEmail: userData.email,
            customerPhone: userData.phone
          })
        });
      }
    },

    // Send a message programmatically
    sendMessage: function(message) {
      if (!isOpen) openWidget();
      const input = document.getElementById('handled-widget-input');
      input.value = message;
      sendMessage();
    }
  };

  // Auto-initialize if script has data-api-key
  if (document.currentScript && document.currentScript.getAttribute('data-api-key')) {
    if (document.readyState === 'complete') {
      init();
    } else {
      window.addEventListener('load', init);
    }
  }

})();
