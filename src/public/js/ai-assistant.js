/* ShopSphere - Advanced AI Shopping Advisor Client */

(function () {
  'use strict';

  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const container = document.getElementById('ai-messages-container');
  const typing = document.getElementById('ai-typing');
  const clearBtn = document.getElementById('ai-clear-history-btn');
  const voiceBtn = document.getElementById('ai-voice-btn');
  const voiceStatus = document.getElementById('ai-voice-status');

  if (!form || !input || !container) return;

  const history = [];

  function scrollToBottom() {
    container.scrollTop = container.scrollHeight;
  }

  function formatAiText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function appendUserMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-message ai-msg-user mb-3 text-end';
    msgEl.innerHTML = `
      <div class="ai-msg-bubble bg-primary text-white d-inline-block p-2 px-3 rounded-4 shadow-sm text-start" style="max-width: 85%;">
        <p class="mb-0 small">${formatAiText(text)}</p>
      </div>
    `;
    container.appendChild(msgEl);
    scrollToBottom();
  }

  function appendBotMessage(data) {
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-message ai-msg-bot mb-3';

    let productsHtml = '';
    if (data.products && data.products.length > 0) {
      productsHtml = `
        <div class="ai-recommended-products mt-2 d-flex flex-column gap-2">
          ${data.products.map((p) => `
            <div class="card border-0 shadow-sm rounded-3 p-2 bg-body">
              <div class="d-flex align-items-center gap-2">
                <a href="/products/${p.slug}" class="flex-shrink-0">
                  <img src="${p.image || '/images/placeholder.svg'}" alt="${p.name}"
                       style="width: 52px; height: 52px; object-fit: contain;" class="rounded border p-1" loading="lazy">
                </a>
                <div class="flex-grow-1 min-w-0">
                  <h6 class="mb-0 small text-truncate fw-semibold">
                    <a href="/products/${p.slug}" class="text-reset text-decoration-none">${p.name}</a>
                  </h6>
                  <div class="d-flex align-items-center gap-2 mt-1">
                    <span class="fw-bold text-primary small">$${Number(p.effectivePrice || p.price).toFixed(2)}</span>
                    ${p.rating ? `<span class="badge bg-warning-subtle text-warning-emphasis py-0 px-1" style="font-size: 0.65rem;"><i class="bi bi-star-fill me-1"></i>${Number(p.rating).toFixed(1)}</span>` : ''}
                  </div>
                </div>
                <div class="flex-shrink-0">
                  <button type="button" class="btn btn-sm btn-primary py-1 px-2 js-ai-add-cart"
                          data-product-id="${p._id}" style="font-size: 0.75rem;">
                    <i class="bi bi-cart-plus me-1"></i>Add
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    let chipsHtml = '';
    if (data.suggestions && data.suggestions.length > 0) {
      chipsHtml = `
        <div class="ai-quick-chips d-flex flex-wrap gap-1 mt-2">
          ${data.suggestions.map((s) => `
            <button type="button" class="btn btn-sm btn-outline-primary ai-chip" data-prompt="${s}">${s}</button>
          `).join('')}
        </div>
      `;
    }

    msgEl.innerHTML = `
      <div class="ai-msg-content bg-body-tertiary p-3 rounded-4 shadow-sm" style="max-width: 95%;">
        <div class="d-flex align-items-center gap-1 mb-1 text-primary fw-semibold small" style="font-size: 0.75rem;">
          <i class="bi bi-stars"></i> ShopSphere AI Advisor
        </div>
        <div class="mb-0 small">${formatAiText(data.message)}</div>
        ${productsHtml}
        ${chipsHtml}
      </div>
    `;

    container.appendChild(msgEl);
    scrollToBottom();
  }

  async function sendMessage(text) {
    const prompt = (text || '').trim();
    if (!prompt) return;

    input.value = '';
    appendUserMessage(prompt);
    history.push({ role: 'user', content: prompt });

    if (typing) typing.classList.remove('d-none');
    scrollToBottom();

    const currentLang = document.documentElement.lang || 'en';

    try {
      const result = await window.app.api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: prompt, history, lang: currentLang }),
      });

      if (typing) typing.classList.add('d-none');

      if (result && result.data) {
        history.push({ role: 'assistant', content: result.data.message });
        appendBotMessage(result.data);
      }
    } catch (_error) {
      if (typing) typing.classList.add('d-none');
      appendBotMessage({
        message: currentLang === 'fr'
          ? "Désolé, j'ai rencontré un problème temporaire pour consulter le catalogue. Veuillez réessayer !"
          : currentLang === 'ar'
            ? 'عذراً، حدث خطأ مؤقت أثناء فحص الكتالوج. يرجى إعادة المحاولة!'
            : 'Sorry, I encountered a temporary issue checking the catalog. Please try asking again!',
        suggestions: currentLang === 'fr'
          ? ['Voir les nouveautés', 'Explorer les catégories']
          : currentLang === 'ar'
            ? ['تصفح أحدث المنتجات', 'استكشاف التصنيفات']
            : ['Show trending electronics', 'Browse categories'],
        products: [],
      });
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  // Delegated click on suggestion chips
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (chip && chip.dataset.prompt) {
      sendMessage(chip.dataset.prompt);
    }
  });

  // 1-Click Add to Cart directly from AI Product Cards
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-ai-add-cart');
    if (!btn || btn.disabled) return;

    const productId = btn.dataset.productId;
    if (!productId) return;

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';

    try {
      await window.app.api('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity: 1 }),
      });

      btn.classList.remove('btn-primary');
      btn.classList.add('btn-success');
      btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Added!';

      if (window.app && typeof window.app.refreshCartDrawer === 'function') {
        window.app.refreshCartDrawer();
      }

      setTimeout(() => {
        btn.classList.remove('btn-success');
        btn.classList.add('btn-primary');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }, 2000);
    } catch (_err) {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-danger');
      btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
      setTimeout(() => {
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }, 2000);
    }
  });

  // Voice Search / Speech Recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (voiceBtn && SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceBtn.addEventListener('click', () => {
      const lang = document.documentElement.lang || 'en';
      recognition.lang = lang === 'fr' ? 'fr-FR' : (lang === 'ar' ? 'ar-SA' : 'en-US');

      if (voiceStatus) voiceStatus.classList.remove('d-none');
      voiceBtn.classList.add('btn-danger');
      voiceBtn.classList.remove('btn-outline-secondary');

      try {
        recognition.start();
      } catch (_e) {
        recognition.stop();
      }
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        input.value = transcript;
        sendMessage(transcript);
      }
    };

    recognition.onend = () => {
      if (voiceStatus) voiceStatus.classList.add('d-none');
      voiceBtn.classList.remove('btn-danger');
      voiceBtn.classList.add('btn-outline-secondary');
    };

    recognition.onerror = () => {
      if (voiceStatus) voiceStatus.classList.add('d-none');
      voiceBtn.classList.remove('btn-danger');
      voiceBtn.classList.add('btn-outline-secondary');
    };
  } else if (voiceBtn) {
    voiceBtn.classList.add('d-none');
  }

  // Clear chat history
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const currentLang = document.documentElement.lang || 'en';
      const refreshGreeting = currentLang === 'fr'
        ? "👋 Conversation réinitialisée ! Que puis-je chercher pour vous aujourd'hui ?"
        : currentLang === 'ar'
          ? '👋 تم تحديث المحادثة! كيف يمكنني مساعدتك في العثور على ما تبحث عنه اليوم؟'
          : '👋 Conversation refreshed! What can I help you find today?';

      container.innerHTML = `
        <div class="ai-message ai-msg-bot mb-3">
          <div class="ai-msg-content bg-body-tertiary p-3 rounded-4 shadow-sm">
            <p class="mb-2 small">${refreshGreeting}</p>
            <div class="ai-quick-chips d-flex flex-wrap gap-1 mt-2">
              <button type="button" class="btn btn-sm btn-outline-primary ai-chip" data-prompt="Find top-rated headphones under $100">🎧 Headphones &lt; $100</button>
              <button type="button" class="btn btn-sm btn-outline-primary ai-chip" data-prompt="Show trending electronics deals">⚡ Trending Tech</button>
              <button type="button" class="btn btn-sm btn-outline-primary ai-chip" data-prompt="Recommend gifts for fitness lovers">🏃 Fitness Gifts</button>
            </div>
          </div>
        </div>
      `;
      history.length = 0;
    });
  }
})();

