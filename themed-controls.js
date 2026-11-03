/* Theme-matched, keyboard-accessible listboxes for compact native selects. */
(() => {
  function enhanceSelect(select) {
    if (select.multiple || select.size > 1 || select.dataset.themed === 'true') return;
    select.dataset.themed = 'true';
    const control = document.createElement('span');
    control.className = 'themed-select-control';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'themed-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.closest('label')?.childNodes[0]?.textContent?.trim() || 'Choose an option');
    const value = document.createElement('span');
    value.className = 'themed-select-value';
    const chevron = document.createElement('span');
    chevron.className = 'themed-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    trigger.append(value, chevron);

    const menu = document.createElement('span');
    menu.className = 'themed-select-menu';
    menu.id = `${select.id || `select-${Math.random().toString(36).slice(2)}`}-options`;
    menu.setAttribute('role', 'listbox');
    menu.tabIndex = -1;
    trigger.setAttribute('aria-controls', menu.id);
    const optionButtons = [];

    const sync = () => {
      const selected = select.options[select.selectedIndex];
      value.textContent = selected?.textContent?.trim() || 'Choose…';
      optionButtons.forEach((optionButton, index) => {
        optionButton.setAttribute('aria-selected', String(index === select.selectedIndex));
        optionButton.classList.toggle('is-selected', index === select.selectedIndex);
      });
      trigger.disabled = select.disabled;
    };
    const close = (restoreFocus = false) => {
      control.classList.remove('is-open', 'opens-upward');
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    const open = () => {
      if (select.disabled) return;
      document.querySelectorAll('.themed-select-control.is-open').forEach(openControl => {
        if (openControl !== control) {
          openControl.classList.remove('is-open', 'opens-upward');
          openControl.querySelector('.themed-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      const rect = trigger.getBoundingClientRect();
      control.classList.toggle('opens-upward', window.innerHeight - rect.bottom < Math.min(210, menu.scrollHeight + 12) && rect.top > menu.scrollHeight + 12);
      control.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      optionButtons[select.selectedIndex]?.focus();
    };

    Array.from(select.options).forEach((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'themed-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.addEventListener('click', () => {
        select.selectedIndex = index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close(true);
      });
      item.addEventListener('keydown', event => {
        const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? optionButtons.length - 1 : -1;
        if (next >= 0) {
          event.preventDefault();
          optionButtons[Math.max(0, Math.min(optionButtons.length - 1, next))]?.focus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
        }
      });
      optionButtons.push(item);
      menu.appendChild(item);
    });

    trigger.addEventListener('click', () => control.classList.contains('is-open') ? close() : open());
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
      }
    });
    Array.from(select.labels || []).forEach(label => label.addEventListener('click', event => {
      if (event.target === label) {
        event.preventDefault();
        open();
      }
    }));
    select.addEventListener('change', sync);
    document.addEventListener('pointerdown', event => {
      if (!control.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && control.classList.contains('is-open')) close(true);
    });
    new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });

    select.classList.add('themed-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const parent = select.parentNode;
    parent.insertBefore(control, select);
    control.append(select, trigger, menu);
    sync();
  }

  function init() { document.querySelectorAll('select').forEach(enhanceSelect); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
