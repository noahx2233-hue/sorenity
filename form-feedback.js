/* Warm, inline form feedback in place of browser-native validation bubbles. */
(() => {
  const messageId = 'sorenity-validation-message';

  function clearField(field) {
    field.classList.remove('field-invalid');
    field.removeAttribute('aria-invalid');
    const group = field.closest('.form-group');
    group?.classList.remove('field-has-error');
    const message = document.getElementById(messageId);
    if (message) message.remove();
    field.removeAttribute('aria-describedby');
  }

  function showFieldError(form, field) {
    const message = document.createElement('p');
    message.id = messageId;
    message.className = 'form-validation-message';
    message.setAttribute('role', 'alert');
    const label = field.labels?.[0]?.textContent?.trim().replace(/\s+/g, ' ') || 'This field';
    message.textContent = field.type === 'date' ? `Choose a date for ${label.toLocaleLowerCase()}.` : `${label} is needed to continue.`;
    const group = field.closest('.form-group');
    if (group) {
      group.classList.add('field-has-error');
      group.appendChild(message);
    } else {
      form.insertAdjacentElement('afterend', message);
    }
    field.classList.add('field-invalid');
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', messageId);
    field.focus({ preventScroll: false });
  }

  function init() {
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute('novalidate')) return;
      const invalidField = form.querySelector(':invalid');
      if (!invalidField) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll(`#${messageId}`).forEach(message => message.remove());
      showFieldError(form, invalidField);
    }, true);

    document.addEventListener('input', event => {
      const field = event.target;
      if (field instanceof HTMLElement && field.form && field.classList.contains('field-invalid') && field.validity.valid) clearField(field);
    });
    document.addEventListener('change', event => {
      const field = event.target;
      if (field instanceof HTMLElement && field.form && field.classList.contains('field-invalid') && field.validity.valid) clearField(field);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
