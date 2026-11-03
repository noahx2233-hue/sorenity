/* Milo's Study Zone wardrobe. Purchases are stored locally for each profile. */
(function () {
  const ITEMS = [
    { id: 'pup-hood', slot: 'hat', value: 'dog', name: 'Pup Hood', kind: 'Dog hat', description: 'A soft little hood with floppy ears.', mark: '🐶', price: 2 },
    { id: 'cool-shades', slot: 'shades', value: 'cool', name: 'Cool Shades', kind: 'Sunglasses', description: 'A little shade for sunny study days.', mark: '🕶️', price: 2 },
    { id: 'sleepy-face', slot: 'face', value: 'sleepy', name: 'Sleepy Smile', kind: 'Milo face', description: 'A calm, cosy expression.', mark: '☾', price: 1 },
    { id: 'wink-face', slot: 'face', value: 'wink', name: 'Little Wink', description: 'A cheerful wink for your next session.', kind: 'Milo face', mark: '☺', price: 1 },
    { id: 'bright-face', slot: 'face', value: 'bright', name: 'Starry Eyes', kind: 'Milo face', description: 'Bright eyes with tiny golden sparkles.', mark: '✧', price: 2 }
  ];
  const WARDROBE_KEY = 'sorenity_milo_wardrobe_';

  function activeUserId() {
    return window.causalStorage?.getActiveUserId?.() || 'usr_emmanuel';
  }

  function emptyWardrobe() {
    return { owned: [], equipped: { hat: null, shades: null, face: null } };
  }

  function loadWardrobe(userId) {
    try {
      const saved = JSON.parse(localStorage.getItem(WARDROBE_KEY + userId) || 'null');
      if (!saved || typeof saved !== 'object') return emptyWardrobe();
      return {
        owned: Array.isArray(saved.owned) ? saved.owned.filter(id => ITEMS.some(item => item.id === id)) : [],
        equipped: { ...emptyWardrobe().equipped, ...(saved.equipped || {}) }
      };
    } catch (_) {
      return emptyWardrobe();
    }
  }

  function initMiloShop() {
    const openButton = document.getElementById('milo-shop-open');
    const dialog = document.getElementById('milo-shop-dialog');
    const closeButton = document.getElementById('milo-shop-close');
    const resetLookButton = document.getElementById('milo-shop-reset');
    const itemsContainer = document.getElementById('milo-shop-items');
    const balanceLabel = document.getElementById('milo-shop-balance-value');
    const status = document.getElementById('milo-shop-status');
    const milo = document.getElementById('milo-character');
    const previewArt = document.getElementById('milo-shop-preview-art');
    const previewTitle = document.getElementById('milo-shop-preview-title');
    const previewResetButton = document.getElementById('milo-shop-preview-reset');
    const categoryButtons = document.querySelectorAll('[data-wardrobe-category]');
    if (!openButton || !dialog || !itemsContainer || !milo || !previewArt) return;

    let userId = activeUserId();
    let wardrobe = loadWardrobe(userId);
    let previewItem = null;
    let activeCategory = 'all';

    function createSleepyZzz() {
      const zzz = document.createElement('span');
      zzz.className = 'milo-sleepy-zzz';
      zzz.setAttribute('aria-hidden', 'true');
      ['z', 'z', 'z'].forEach(letter => {
        const character = document.createElement('span');
        character.textContent = letter;
        zzz.appendChild(character);
      });
      return zzz;
    }

    function saveWardrobe() {
      try { localStorage.setItem(WARDROBE_KEY + userId, JSON.stringify(wardrobe)); } catch (_) {}
    }

    function applyLook() {
      milo.dataset.hat = wardrobe.equipped.hat || 'none';
      milo.dataset.shades = wardrobe.equipped.shades || 'none';
      milo.dataset.face = wardrobe.equipped.face || 'default';
      const stage = milo.closest('.milo-stage');
      if (stage) stage.dataset.face = wardrobe.equipped.face || 'default';
      renderPreview();
    }

    function renderPreview() {
      if (!previewArt) return;
      const look = { ...wardrobe.equipped };
      if (previewItem) look[previewItem.slot] = previewItem.value;
      const preview = milo.cloneNode(true);
      preview.removeAttribute('id');
      preview.classList.add('milo-preview-character');
      preview.setAttribute('aria-label', 'Milo wardrobe preview');
      preview.dataset.hat = look.hat || 'none';
      preview.dataset.shades = look.shades || 'none';
      preview.dataset.face = look.face || 'default';
      previewArt.dataset.face = look.face || 'default';
      previewArt.replaceChildren(preview);
      if (look.face === 'sleepy') previewArt.appendChild(createSleepyZzz());
      if (previewTitle) previewTitle.textContent = previewItem ? `Trying ${previewItem.name}` : 'Your Milo';
      if (previewResetButton) previewResetButton.disabled = !previewItem;
    }

    function getBalance() {
      return window.sorenityStarWallet?.getBalance?.() ?? 0;
    }

    function updateBalance() {
      const balance = getBalance();
      if (balanceLabel) balanceLabel.textContent = String(balance);
      return balance;
    }

    function renderItems() {
      const balance = updateBalance();
      itemsContainer.replaceChildren();
      ITEMS.filter(item => activeCategory === 'all' || (activeCategory === 'faces' ? item.slot === 'face' : item.slot !== 'face')).forEach(item => {
        const owned = wardrobe.owned.includes(item.id);
        const equipped = wardrobe.equipped[item.slot] === item.value;
        const card = document.createElement('article');
        card.className = `milo-shop-item${previewItem?.id === item.id ? ' is-previewing' : ''}`;

        const mark = document.createElement('span');
        mark.className = 'milo-shop-item-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = item.mark;

        const copy = document.createElement('div');
        copy.className = 'milo-shop-item-copy';
        const kind = document.createElement('span');
        kind.className = 'milo-shop-item-kind';
        kind.textContent = item.kind;
        const name = document.createElement('strong');
        name.textContent = item.name;
        const description = document.createElement('span');
        description.textContent = item.description;
        copy.append(kind, name, description);

        const actions = document.createElement('div');
        actions.className = 'milo-shop-item-actions';

        const previewAction = document.createElement('button');
        previewAction.type = 'button';
        previewAction.className = 'milo-shop-preview-action';
        previewAction.textContent = previewItem?.id === item.id ? 'Previewing' : 'Preview';
        previewAction.setAttribute('aria-pressed', String(previewItem?.id === item.id));
        previewAction.addEventListener('click', () => {
          previewItem = item;
          renderPreview();
          renderItems();
        });

        const action = document.createElement('button');
        action.type = 'button';
        action.className = `milo-shop-item-action${owned ? ' is-owned' : ''}`;
        action.textContent = equipped ? 'Equipped' : owned ? 'Equip' : balance < item.price ? `Need ${item.price - balance} ✦` : `Buy · ${item.price} ✦`;
        action.disabled = equipped || (!owned && balance < item.price);
        action.addEventListener('click', () => {
          if (owned) {
            wardrobe.equipped[item.slot] = item.value;
            status.textContent = `${item.name} is ready for Milo.`;
          } else {
            const wallet = window.sorenityStarWallet;
            if (!wallet?.spend?.(item.price)) {
              status.textContent = 'You need a few more Star Points for that look.';
              renderItems();
              return;
            }
            wardrobe.owned.push(item.id);
            wardrobe.equipped[item.slot] = item.value;
            status.textContent = `${item.name} is yours and Milo has it on.`;
          }
          saveWardrobe();
          previewItem = null;
          applyLook();
          renderItems();
        });

        actions.append(previewAction, action);
        card.append(mark, copy, actions);
        itemsContainer.appendChild(card);
      });
    }

    openButton.addEventListener('click', () => {
      status.textContent = '';
      previewItem = null;
      renderPreview();
      renderItems();
      dialog.showModal();
    });
    closeButton?.addEventListener('click', () => dialog.close());
    categoryButtons.forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.wardrobeCategory || 'all';
      categoryButtons.forEach(tab => {
        const selected = tab === button;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-pressed', String(selected));
      });
      renderItems();
    }));
    resetLookButton?.addEventListener('click', () => {
      wardrobe.equipped = emptyWardrobe().equipped;
      previewItem = null;
      saveWardrobe();
      applyLook();
      status.textContent = 'Milo is back in his original look.';
      renderItems();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    window.addEventListener('sorenity-star-points-changed', renderItems);
    window.addEventListener('sorenity-profile-changed', () => {
      userId = activeUserId();
      wardrobe = loadWardrobe(userId);
      previewItem = null;
      applyLook();
      if (dialog.open) renderItems();
    });
    previewResetButton?.addEventListener('click', () => {
      previewItem = null;
      renderPreview();
      renderItems();
    });

    applyLook();
    updateBalance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMiloShop);
  else initMiloShop();
})();
