/* Local, profile-scoped journal. Submitted words are immutable; photos can be appended. */
const JOURNAL_DB_NAME = 'sorenity_journal';
const JOURNAL_DB_VERSION = 2;
const JOURNAL_LEGACY_STORE = 'entries';
const JOURNAL_STORE = 'entries_v2';
const JOURNAL_META_STORE = 'meta';

function openJournalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(JOURNAL_DB_NAME, JOURNAL_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) db.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(JOURNAL_META_STORE)) db.createObjectStore(JOURNAL_META_STORE, { keyPath: 'key' });
    };
  });
}

function activeJournalUserId() {
  return window.causalStorage?.getActiveUserId?.() || 'usr_emmanuel';
}

function journalEntryId(userId, date) { return `${userId}::${date}`; }

function localJournalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function migrateLegacyJournalEntries(userId) {
  const db = await openJournalDB();
  const stores = [JOURNAL_STORE, JOURNAL_META_STORE];
  if (db.objectStoreNames.contains(JOURNAL_LEGACY_STORE)) stores.push(JOURNAL_LEGACY_STORE);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    const meta = tx.objectStore(JOURNAL_META_STORE);
    const marker = meta.get('legacy-imported');
    marker.onsuccess = () => {
      if (marker.result) return;
      const importEntries = entries => {
        const destination = tx.objectStore(JOURNAL_STORE);
        (entries || []).forEach(entry => {
          if (!entry?.date) return;
          const migrated = { ...entry, userId, id: journalEntryId(userId, entry.date), images: entry.images || [] };
          destination.put(migrated);
        });
        meta.put({ key: 'legacy-imported', value: true, importedAt: new Date().toISOString() });
      };
      if (db.objectStoreNames.contains(JOURNAL_LEGACY_STORE)) {
        const request = tx.objectStore(JOURNAL_LEGACY_STORE).getAll();
        request.onsuccess = () => importEntries(request.result);
        request.onerror = () => tx.abort();
      } else importEntries([]);
    };
    marker.onerror = () => tx.abort();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Journal migration was interrupted.'));
  });
  db.close();
}

async function getJournalEntryForUser(date, userId = activeJournalUserId()) {
  const db = await openJournalDB();
  const entry = await new Promise((resolve, reject) => {
    const tx = db.transaction(JOURNAL_STORE, 'readonly');
    const request = tx.objectStore(JOURNAL_STORE).get(journalEntryId(userId, date));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entry;
}

async function getJournalEntriesForUser(userId = activeJournalUserId()) {
  const db = await openJournalDB();
  const entries = await new Promise((resolve, reject) => {
    const tx = db.transaction(JOURNAL_STORE, 'readwrite');
    const store = tx.objectStore(JOURNAL_STORE);
    const request = store.getAll();
    let matchingEntries = [];
    request.onsuccess = () => {
      matchingEntries = request.result.flatMap(entry => {
        if (!entry?.date) return [];

        // Older journal records may not have had a profile ID or a namespaced
        // key. Recover those records so they remain visible in the archive.
        const storedId = String(entry.id || '');
        const idOwner = storedId.includes('::') ? storedId.split('::', 1)[0] : '';
        const owner = entry.userId || idOwner || userId;
        if (owner !== userId) return [];

        const normalized = {
          ...entry,
          id: journalEntryId(owner, entry.date),
          userId: owner,
          images: Array.isArray(entry.images) ? entry.images : []
        };
        if (entry.id !== normalized.id || entry.userId !== owner || !Array.isArray(entry.images)) {
          if (entry.id && entry.id !== normalized.id) store.delete(entry.id);
          store.put(normalized);
        }
        return [normalized];
      });
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(matchingEntries);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || request.error || new Error('Could not read journal entries.'));
  });
  db.close();
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

async function createJournalEntry(entry) {
  const db = await openJournalDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(JOURNAL_STORE, 'readwrite');
    const store = tx.objectStore(JOURNAL_STORE);
    const request = store.add(entry);
    request.onerror = () => {
      if (request.error?.name === 'ConstraintError') tx.abort();
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('This date already has a journal entry.'));
  });
  db.close();
}

async function appendJournalImages(entryId, images) {
  const db = await openJournalDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(JOURNAL_STORE, 'readwrite');
    const store = tx.objectStore(JOURNAL_STORE);
    const request = store.get(entryId);
    request.onsuccess = () => {
      if (!request.result) return;
      const entry = request.result;
      entry.images = [...(entry.images || []), ...images];
      store.put(entry);
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Could not attach images.'));
  });
  db.close();
}

function parseJournalMarkdown(text) {
  return window.marked ? window.marked.parse(text || '') : (text || '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char])).replace(/\n/g, '<br>');
}

function showJournalToast(message) {
  if (window.app?.showToast) window.app.showToast(message);
}

function initJournalUI() {
  const textarea = document.getElementById('journal-text');
  const preview = document.getElementById('journal-preview');
  const dateInput = document.getElementById('journal-date');
  const state = document.getElementById('journal-entry-state');
  const lockNote = document.getElementById('journal-lock-note');
  const saveBtn = document.getElementById('save-journal-btn');
  const fileInput = document.getElementById('journal-images');
  const imageLabel = document.querySelector('.journal-image-label');
  const imageContainer = document.getElementById('journal-image-thumbnails');
  const archive = document.getElementById('journal-archive-list');
  const count = document.getElementById('journal-archive-count');
  const searchInput = document.getElementById('journal-search');
  const fromInput = document.getElementById('journal-filter-from');
  const toInput = document.getElementById('journal-filter-to');
  const imageFilter = document.getElementById('journal-filter-images');
  const sortInput = document.getElementById('journal-sort');
  if (!textarea || !preview || !dateInput || !saveBtn || !archive) return;

  let selectedEntry = null;
  let currentUserId = activeJournalUserId();

  const refreshImages = entry => {
    imageContainer.replaceChildren();
    (entry?.images || []).forEach(item => {
      if (!item.blob) return;
      const image = document.createElement('img');
      image.src = URL.createObjectURL(item.blob);
      image.alt = item.name || 'Journal photo';
      image.className = 'journal-thumb';
      imageContainer.appendChild(image);
    });
  };

  const renderSelectedDate = async () => {
    const date = dateInput.value || localJournalDate();
    dateInput.value = date;
    selectedEntry = await getJournalEntryForUser(date, currentUserId);
    textarea.value = selectedEntry?.text || '';
    textarea.readOnly = Boolean(selectedEntry);
    textarea.hidden = Boolean(selectedEntry);
    textarea.classList.toggle('is-locked', Boolean(selectedEntry));
    preview.innerHTML = parseJournalMarkdown(textarea.value);
    preview.classList.toggle('is-archive-view', Boolean(selectedEntry));
    preview.hidden = !selectedEntry && !textarea.value;
    state.textContent = selectedEntry ? 'Submitted · read only' : 'Happy Writing';
    state.classList.toggle('is-submitted', Boolean(selectedEntry));
    lockNote.textContent = selectedEntry
      ? 'This entry is preserved as you wrote it. You may add photographs, but the writing stays unchanged.'
      : 'Your writing becomes read-only after you submit it. You can add photographs later.';
    imageLabel.textContent = selectedEntry ? 'Add Photos' : 'Attach Images';
    saveBtn.querySelector('span').textContent = selectedEntry ? 'Add Photos to Entry' : 'Submit Journal';
    saveBtn.disabled = false;
    refreshImages(selectedEntry);
    if (fileInput) fileInput.value = '';
  };

  const renderArchive = async () => {
    const allEntries = await getJournalEntriesForUser(currentUserId);
    const query = (searchInput?.value || '').trim().toLocaleLowerCase();
    const from = fromInput?.value || '';
    const to = toInput?.value || '';
    const imageMode = imageFilter?.value || 'any';
    const entries = allEntries.filter(entry => {
      const text = String(entry.text || '').toLocaleLowerCase();
      const hasImages = Array.isArray(entry.images) && entry.images.length > 0;
      return (!query || text.includes(query) || entry.date.includes(query)) &&
        (!from || entry.date >= from) && (!to || entry.date <= to) &&
        (imageMode === 'any' || (imageMode === 'yes' ? hasImages : !hasImages));
    });
    if (sortInput?.value === 'oldest') entries.reverse();
    archive.replaceChildren();
    count.textContent = allEntries.length ? `${entries.length} of ${allEntries.length} ${allEntries.length === 1 ? 'entry' : 'entries'}` : '';
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'journal-archive-empty';
      empty.textContent = allEntries.length ? 'No journal entries match these filters.' : 'Your submitted entries will be kept here, arranged by date.';
      archive.appendChild(empty);
      return;
    }
    entries.forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `journal-archive-entry${entry.date === dateInput.value ? ' is-current' : ''}`;
      button.dataset.date = entry.date;
      const date = document.createElement('span');
      date.className = 'journal-archive-date';
      date.textContent = new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const snippet = document.createElement('span');
      snippet.className = 'journal-archive-snippet';
      snippet.textContent = (entry.text || '').replace(/[#*_>`~\[\]()]/g, '').replace(/\s+/g, ' ').trim() || 'Photo memory';
      const meta = document.createElement('span');
      meta.className = 'journal-archive-meta';
      meta.textContent = `${(entry.images || []).length} ${(entry.images || []).length === 1 ? 'photo' : 'photos'} · Read only`;
      button.append(date, snippet, meta);
      button.addEventListener('click', async () => {
        dateInput.value = entry.date;
        await renderSelectedDate();
        archive.querySelectorAll('.journal-archive-entry').forEach(item => item.classList.toggle('is-current', item.dataset.date === entry.date));
      });
      archive.appendChild(button);
    });
  };

  [searchInput, fromInput, toInput, imageFilter, sortInput].forEach(control => {
    control?.addEventListener('input', renderArchive);
    control?.addEventListener('change', renderArchive);
  });

  textarea.addEventListener('input', () => {
    preview.innerHTML = parseJournalMarkdown(textarea.value);
    preview.hidden = !textarea.value;
  });
  dateInput.addEventListener('change', async () => { await renderSelectedDate(); await renderArchive(); });
  saveBtn.addEventListener('click', async () => {
    try {
      const images = Array.from(fileInput?.files || []).map(file => ({ name: file.name, blob: file }));
      if (selectedEntry) {
        if (!images.length) { showJournalToast('Choose photos to add to this entry.'); return; }
        await appendJournalImages(selectedEntry.id, images);
        showJournalToast('Photos added to your journal entry');
      } else {
        const text = textarea.value.trim();
        if (!text) { showJournalToast('Write a little before submitting your entry.'); textarea.focus(); return; }
        const date = dateInput.value;
        const entry = { id: journalEntryId(currentUserId, date), userId: currentUserId, date, text: textarea.value, images, createdAt: new Date().toISOString() };
        await createJournalEntry(entry);
        showJournalToast('Journal entry submitted and preserved');
      }
      await renderSelectedDate();
      await renderArchive();
    } catch (error) {
      console.error('Could not save journal entry:', error);
      showJournalToast('Could not save this journal entry. Please try again.');
    }
  });

  window.addEventListener('sorenity-profile-changed', async () => {
    currentUserId = activeJournalUserId();
    await renderSelectedDate();
    await renderArchive();
  });

  dateInput.value = localJournalDate();
  migrateLegacyJournalEntries(currentUserId)
    .then(async () => { await renderSelectedDate(); await renderArchive(); })
    .catch(error => { console.error('Could not open journal archive:', error); showJournalToast('Your journal could not be opened.'); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initJournalUI);
else initJournalUI();
