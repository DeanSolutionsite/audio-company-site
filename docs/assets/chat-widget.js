/**
 * 商用音响官网 - AI 智能助手 聊天组件
 *
 * 使用方式：
 *   1. 在 HTML 中引入此 JS 和 chat-widget.css
 *   2. 初始化： AudioChat.init({ workerUrl: 'https://你的worker域名' })
 *
 * 该组件会向页面注入浮动按钮和聊天窗口，
 * 作为全局单例运行。
 */

(function (global) {
  'use strict';

  // ========== 默认配置 ==========
  const DEFAULTS = {
    workerUrl: '',                        // [必填] Worker 地址
    title: '智能助手',                     // 聊天窗口标题
    subtitle: '在线为您服务',              // 副标题
    welcomeMessage: '您好！我是智能助手，很高兴为您服务。请问怎么称呼您？',  // 初始问候语
    placeholder: '输入消息...',            // 输入框占位符
    companyName: 'XX音响科技有限公司',
  };

  // ========== 图标（内联 SVG） ==========
  const ICONS = {
    chat: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    robot: '🤖',
    user: '👤',
  };

  // ========== 状态 ==========
  let state = {
    config: { ...DEFAULTS },
    messages: [],
    isOpen: false,
    isLoading: false,
    hasInteracted: false,
    summaryGenerated: false,    // 是否已生成需求档案
    el: null,          // 根元素
  };

  // ========== 工具函数 ==========
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function scrollToBottom(container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  // ========== 渲染函数 ==========
  function createButton() {
    const btn = document.createElement('button');
    btn.className = 'audio-chat__button';
    btn.setAttribute('aria-label', '打开聊天');
    btn.innerHTML = ICONS.chat + '<span class="audio-chat__badge" id="audio-chat-badge">1</span>';
    btn.addEventListener('click', () => open());
    return btn;
  }

  function createHeader() {
    const header = document.createElement('div');
    header.className = 'audio-chat__header';
    header.innerHTML = `
      <div class="audio-chat__header-left">
        <div class="audio-chat__header-avatar">${ICONS.robot}</div>
        <div class="audio-chat__header-info">
          <span class="audio-chat__header-title">${escapeHtml(state.config.title)}</span>
          <span class="audio-chat__header-status">
            <span class="audio-chat__header-dot"></span>
            ${escapeHtml(state.config.subtitle)}
          </span>
        </div>
      </div>
      <button class="audio-chat__header-close" aria-label="关闭聊天">
        ${ICONS.close}
      </button>
    `;
    header.querySelector('.audio-chat__header-close').addEventListener('click', () => close());
    return header;
  }

  function createTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'audio-chat__typing';
    div.id = 'audio-chat-typing';
    div.innerHTML = `
      <div class="audio-chat__msg-avatar">${ICONS.robot}</div>
      <div class="audio-chat__typing-dots">
        <span class="audio-chat__typing-dot"></span>
        <span class="audio-chat__typing-dot"></span>
        <span class="audio-chat__typing-dot"></span>
      </div>
    `;
    return div;
  }

  function createInputArea() {
    const area = document.createElement('div');
    area.className = 'audio-chat__input-area';
    area.innerHTML = `
      <input class="audio-chat__input" id="audio-chat-input"
             type="text" placeholder="${escapeHtml(state.config.placeholder)}"
             autocomplete="off" />
      <button class="audio-chat__send" id="audio-chat-send" aria-label="发送">
        ${ICONS.send}
      </button>
    `;

    const input = area.querySelector('#audio-chat-input');
    const sendBtn = area.querySelector('#audio-chat-send');

    function handleSend() {
      const text = input.value.trim();
      if (!text || state.isLoading) return;
      input.value = '';
      sendMessage(text);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    sendBtn.addEventListener('click', handleSend);

    return area;
  }

  function createMessageElement(role, content) {
    const isBot = role === 'assistant';
    const msgDiv = document.createElement('div');
    msgDiv.className = `audio-chat__msg audio-chat__msg--${isBot ? 'bot' : 'user'}`;
    msgDiv.innerHTML = `
      <div class="audio-chat__msg-avatar">${isBot ? ICONS.robot : ICONS.user}</div>
      <div class="audio-chat__msg-bubble">${escapeHtml(content)}</div>
      <span class="audio-chat__msg-time">${getTime()}</span>
    `;
    return msgDiv;
  }

  // ========== 核心逻辑 ==========

  /** 构建组件 DOM */
  function buildDOM() {
    if (state.el) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'audio-chat';
    wrapper.id = 'audio-chat-root';

    // 浮动按钮
    const btn = createButton();
    wrapper.appendChild(btn);

    // 聊天窗口
    const window = document.createElement('div');
    window.className = 'audio-chat__window audio-chat__window--hidden';
    window.id = 'audio-chat-window';

    window.appendChild(createHeader());

    const msgs = document.createElement('div');
    msgs.className = 'audio-chat__messages';
    msgs.id = 'audio-chat-messages';
    window.appendChild(msgs);

    window.appendChild(createInputArea());
    wrapper.appendChild(window);

    document.body.appendChild(wrapper);
    state.el = wrapper;

    // 缓存关键 DOM 引用
    state.dom = {
      window: window,
      messages: msgs,
      input: document.getElementById('audio-chat-input'),
      send: document.getElementById('audio-chat-send'),
      badge: document.getElementById('audio-chat-badge'),
    };
  }

  /** 打开聊天窗口 */
  function open() {
    if (state.isOpen) return;
    state.isOpen = true;

    const win = state.dom.window;
    win.classList.remove('audio-chat__window--hidden');

    // 隐藏角标
    state.dom.badge.classList.remove('audio-chat__badge--visible');

    // 首次打开时显示问候语
    if (!state.hasInteracted) {
      state.hasInteracted = true;
      addMessage('assistant', state.config.welcomeMessage);
    }

    // 聚焦输入框
    setTimeout(() => state.dom.input?.focus(), 300);
  }

  /** 关闭聊天窗口 */
  function close() {
    if (!state.isOpen) return;
    state.isOpen = false;
    state.dom.window.classList.add('audio-chat__window--hidden');
  }

  /** 创建联系方式表单（内联在聊天中） */
  function createContactForm(summaryText) {
    const container = document.createElement('div');
    container.className = 'audio-chat__contact';
    container.id = 'audio-chat-contact-form';

    container.innerHTML = `
      <div class="audio-chat__contact-title">📋 留下联系方式</div>
      <p class="audio-chat__contact-desc">请填写您的电话和邮箱，我们的技术顾问会尽快联系您</p>
      <div class="audio-chat__contact-field">
        <label>姓名</label>
        <input type="text" id="audio-contact-name" placeholder="请输入您的姓名" autocomplete="name" />
      </div>
      <div class="audio-chat__contact-field">
        <label>手机号 <span style="color:#ef4444">*</span></label>
        <input type="tel" id="audio-contact-phone" placeholder="请输入手机号" autocomplete="tel" />
      </div>
      <div class="audio-chat__contact-field">
        <label>邮箱</label>
        <input type="email" id="audio-contact-email" placeholder="请输入邮箱（选填）" autocomplete="email" />
      </div>
      <button class="audio-chat__contact-btn" id="audio-contact-submit">提交需求，获取方案</button>
      <p class="audio-chat__contact-tip" id="audio-contact-status"></p>
    `;

    // 提交事件
    const btn = container.querySelector('#audio-contact-submit');
    btn.addEventListener('click', async () => {
      const name = container.querySelector('#audio-contact-name').value.trim();
      const phone = container.querySelector('#audio-contact-phone').value.trim();
      const email = container.querySelector('#audio-contact-email').value.trim();
      const statusEl = container.querySelector('#audio-contact-status');

      if (!name) {
        statusEl.textContent = '请输入您的姓名';
        statusEl.style.color = '#ef4444';
        return;
      }
      if (!phone || phone.length < 7) {
        statusEl.textContent = '请输入正确的手机号';
        statusEl.style.color = '#ef4444';
        return;
      }

      btn.disabled = true;
      btn.textContent = '提交中...';
      statusEl.textContent = '';

      try {
        const resp = await fetch(state.config.workerUrl.replace(/\/+$/, '') + '/save-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, email, summary: summaryText }),
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || '提交失败');
        }

        // 成功
        statusEl.textContent = '✅ 提交成功！我们的技术顾问会尽快联系您。';
        statusEl.style.color = '#16a34a';
        btn.textContent = '已提交 ✓';
        btn.disabled = true;
        btn.style.opacity = '0.6';

        // 禁用输入框（对话结束）
        state.dom.input.disabled = true;
        state.dom.input.placeholder = '需求已提交，感谢您的咨询';
        state.dom.send.disabled = true;

      } catch (err) {
        statusEl.textContent = '提交失败，请稍后重试。' + (err.message ? ' (' + err.message + ')' : '');
        statusEl.style.color = '#ef4444';
        btn.disabled = false;
        btn.textContent = '重新提交';
        console.error('[AudioChat] 保存线索失败:', err);
      }
    });

    // 回车提交
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btn.click();
      }
    });

    return container;
  }

  /** 添加消息到界面和历史 */
  function addMessage(role, content) {
    state.messages.push({ role, content });
    const el = createMessageElement(role, content);
    state.dom.messages.appendChild(el);
    scrollToBottom(state.dom.messages);

    // 如果是机器人的回复且包含了需求档案，自动展示联系方式表单
    if (role === 'assistant' && !state.summaryGenerated && content.indexOf('需求档案') !== -1) {
      state.summaryGenerated = true;
      const form = createContactForm(content);
      state.dom.messages.appendChild(form);
      scrollToBottom(state.dom.messages);
    }
  }

  /** 显示打字指示器 */
  function showTyping() {
    const indicator = createTypingIndicator();
    state.dom.messages.appendChild(indicator);
    scrollToBottom(state.dom.messages);
    state.dom.input.disabled = true;
    state.dom.send.disabled = true;
  }

  /** 隐藏打字指示器 */
  function hideTyping() {
    const typing = document.getElementById('audio-chat-typing');
    if (typing) typing.remove();
    state.dom.input.disabled = false;
    state.dom.send.disabled = false;
    state.dom.input.focus();
  }

  /** 发送消息并获取回复 */
  async function sendMessage(text) {
    if (!text) return;

    // 显示用户消息
    addMessage('user', text);
    state.isLoading = true;
    showTyping();

    // 构建发送的历史（不含 system prompt，由 Worker 端处理）
    const sendMessages = state.messages.slice();

    try {
      const response = await fetch(state.config.workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sendMessages }),
      });

      if (!response.ok) {
        let errMsg = `请求失败 (${response.status})`;
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.detail || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const reply = data.reply || '抱歉，我没有理解您的意思，请再描述一下？';

      hideTyping();
      addMessage('assistant', reply);

    } catch (err) {
      hideTyping();
      const errorMsg = '抱歉，我暂时遇到了连接问题，请稍后再试。' +
        (err.message ? ' (' + err.message + ')' : '');
      addMessage('assistant', errorMsg);
      console.error('[AudioChat] 发送消息失败:', err);
    } finally {
      state.isLoading = false;
    }
  }

  // ========== 公开 API ==========

  const AudioChat = {
    /**
     * 初始化聊天组件
     * @param {Object} opts
     * @param {string} opts.workerUrl  [必填] Cloudflare Worker 的 URL
     * @param {string} [opts.title]     聊天窗口标题
     * @param {string} [opts.subtitle]  副标题
     * @param {string} [opts.welcomeMessage] 初始问候语
     * @param {string} [opts.placeholder]    输入框占位符
     */
    init(opts = {}) {
      if (state.el) {
        console.warn('[AudioChat] 已初始化，忽略重复调用');
        return;
      }

      if (!opts.workerUrl) {
        console.error('[AudioChat] workerUrl 为必填参数');
        return;
      }

      // 合并配置
      state.config = { ...DEFAULTS, ...opts };

      buildDOM();
    },

    /** 手动打开聊天窗口 */
    open() { open(); },

    /** 手动关闭聊天窗口 */
    close() { close(); },

    /** 获取对话历史 */
    getMessages() {
      return [...state.messages];
    },

    /** 清空对话历史重新开始 */
    reset() {
      state.messages = [];
      state.isLoading = false;
      state.hasInteracted = false;
      state.summaryGenerated = false;
      state.dom.messages.innerHTML = '';
      state.dom.input.disabled = false;
      state.dom.input.placeholder = state.config.placeholder;
      state.dom.send.disabled = false;
      if (state.isOpen) {
        addMessage('assistant', state.config.welcomeMessage);
      }
    },
  };

  // 暴露到全局
  global.AudioChat = AudioChat;

})(typeof window !== 'undefined' ? window : this);
