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

      #handled-widget-typing {
        align-self: flex-start;
        padding: 12px 16px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        display: none;
      }

      #handled-widget-typing.visible {
        display: flex;
        gap: 4px;
      }

      .handled-typing-dot {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        animation: handled-typing 1.4s infinite;
      }

      .handled-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .handled-typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes handled-typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
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
            <svg viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <div id="handled-widget-header-info">
            <div id="handled-widget-header-name">${businessConfig?.name || 'Chat'}</div>
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
            <span class="handled-typing-dot"></span>
            <span class="handled-typing-dot"></span>
            <span class="handled-typing-dot"></span>
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

    // Use markdown parsing for assistant messages, plain text for user
    const content = message.role === 'ASSISTANT'
      ? parseMarkdown(message.content)
      : escapeHtml(message.content);

    const div = document.createElement('div');
    div.className = `handled-message handled-message-${message.role.toLowerCase()}`;
    div.innerHTML = `
      <div class="handled-message-content">${content}</div>
      <div class="handled-message-time">${formatTime(message.createdAt)}</div>
    `;

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
    document.getElementById('handled-widget-typing').classList.add('visible');
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

  function parseMarkdown(text) {
    // Escape HTML first for security
    let html = escapeHtml(text);

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
