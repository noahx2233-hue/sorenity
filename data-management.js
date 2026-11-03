/* Private local-data export for the active browser profile collection. */
(() => {
  const buttonId = 'export-data-btn';

  function openJournalDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sorenity_journal');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the journal archive.'));
    });
  }

  function readStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error(`Could not read ${storeName}.`));
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not include an attached photo.'));
      reader.readAsDataURL(blob);
    });
  }

  async function serializeJournalEntry(entry) {
    const images = await Promise.all((entry.images || []).map(async image => {
      const blob = image.blob || image;
      return {
        name: image.name || blob.name || 'Journal photo',
        type: blob.type || 'application/octet-stream',
        dataUrl: blob instanceof Blob ? await blobToDataUrl(blob) : null
      };
    }));
    return { ...entry, images };
  }

  async function createBackup() {
    const localData = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && (/^causal_self_/.test(key) || /^sorenity_/.test(key))) {
        const raw = localStorage.getItem(key);
        try { localData[key] = JSON.parse(raw); }
        catch (_) { localData[key] = raw; }
      }
    }

    const db = await openJournalDatabase();
    let journalStores = {};
    try {
      for (const name of Array.from(db.objectStoreNames)) {
        const entries = await readStore(db, name);
        journalStores[name] = name === 'entries_v2' || name === 'entries'
          ? await Promise.all(entries.map(serializeJournalEntry))
          : entries;
      }
    } finally {
      db.close();
    }

    return {
      format: 'sorenity-local-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'Keep this file somewhere private. Journal photo data is embedded as data URLs.',
      localStorage: localData,
      journalDatabase: { name: 'sorenity_journal', version: db.version, stores: journalStores }
    };
  }

  async function downloadBackup() {
    const button = document.getElementById(buttonId);
    const status = document.getElementById('export-data-status');
    if (!button || !status) return;
    button.disabled = true;
    status.textContent = 'Preparing your private backup…';
    try {
      const backup = await createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sorenity-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      status.textContent = 'Backup downloaded. Keep it somewhere private.';
    } catch (error) {
      console.error('Could not export Sorenity data:', error);
      status.textContent = 'Backup could not be created. Your saved data has not been changed.';
    } finally {
      button.disabled = false;
    }
  }

  function dataUrlToBlob(dataUrl) {
    try {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: mime });
    } catch (_) {
      return null;
    }
  }

  async function deserializeJournalEntry(entry) {
    const images = (entry.images || []).map(img => {
      if (img.dataUrl) {
        const blob = dataUrlToBlob(img.dataUrl);
        return {
          name: img.name || 'Journal photo',
          blob: blob || new Blob([], { type: 'image/jpeg' })
        };
      }
      return img;
    });
    return { ...entry, images };
  }

  async function restoreBackup(file) {
    const status = document.getElementById('export-data-status');
    if (!status || !file) return;
    status.textContent = 'Reading backup file…';
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || (!backup.localStorage && !backup.journalDatabase)) {
        throw new Error('Invalid backup file format');
      }

      // 1. Restore localStorage keys
      if (backup.localStorage && typeof backup.localStorage === 'object') {
        Object.entries(backup.localStorage).forEach(([k, v]) => {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
      }

      // 2. Restore IndexedDB journal entries
      if (backup.journalDatabase && backup.journalDatabase.stores) {
        const db = await openJournalDatabase();
        const stores = backup.journalDatabase.stores;
        for (const [storeName, records] of Object.entries(stores)) {
          if (db.objectStoreNames.contains(storeName) && Array.isArray(records)) {
            await new Promise((resolve, reject) => {
              const tx = db.transaction(storeName, 'readwrite');
              const store = tx.objectStore(storeName);
              records.forEach(async rec => {
                const item = (storeName === 'entries_v2' || storeName === 'entries')
                  ? await deserializeJournalEntry(rec)
                  : rec;
                store.put(item);
              });
              tx.oncomplete = resolve;
              tx.onerror = () => reject(tx.error);
            });
          }
        }
        db.close();
      }

      status.textContent = 'Backup restored successfully! Refreshing…';
      if (window.app?.showToast) window.app.showToast('Backup restored successfully');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error('Could not restore Sorenity backup:', err);
      status.textContent = 'Could not restore this backup file. Ensure it is a valid Sorenity backup JSON.';
    }
  }

  function init() {
    document.getElementById(buttonId)?.addEventListener('click', downloadBackup);
    const importInput = document.getElementById('import-backup-file');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) restoreBackup(file);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
