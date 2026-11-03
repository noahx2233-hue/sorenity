/**
 * Causal Self — Daily Logging System (Step 2)
 * Manages dual-mode logging (Structured Form & Natural Language Parser),
 * custom tag creation, and recent logs timeline.
 */

class CausalLogger {
  constructor() {
    this.selectedTags = {
      inputs: new Set(),
      activities: new Set(),
      people: new Set(),
      outcomes: new Set()
    };
    this.customTags = {
      inputs: new Set(),
      activities: new Set(),
      people: new Set(),
      outcomes: new Set()
    };
  }

  init() {
    this.bindDomElements();
    this.setupSliders();
    this.renderCategoryChips();
    this.setupEventListeners();
    this.renderRecentLogs();
  }

  bindDomElements() {
    // Form Inputs
    this.logDate = document.getElementById('log-date');
    this.moodSlider = document.getElementById('log-mood-slider');
    this.moodDisplay = document.getElementById('mood-slider-val');
    this.moodDescriptor = document.getElementById('mood-descriptor');
    
    this.energySlider = document.getElementById('log-energy-slider');
    this.energyDisplay = document.getElementById('energy-slider-val');
    this.energyDescriptor = document.getElementById('energy-descriptor');

    this.notesInput = document.getElementById('log-notes');
    this.logForm = document.getElementById('daily-log-form');

    // Natural Language Elements
    this.nlpInput = document.getElementById('nlp-input');
    this.nlpParseBtn = document.getElementById('nlp-parse-btn');
    this.nlpFeedback = document.getElementById('nlp-feedback');

    // Recent Logs Container
    this.recentLogsContainer = document.getElementById('recent-logs-list');
    this.logsSearchInput = document.getElementById('logs-search-input');
    this.logFilters = {
      from: document.getElementById('logs-filter-from'),
      to: document.getElementById('logs-filter-to'),
      mood: document.getElementById('logs-mood-range'),
      energy: document.getElementById('logs-energy-range'),
      includeTag: document.getElementById('logs-include-tag'),
      excludeTag: document.getElementById('logs-exclude-tag')
    };
  }

  setupSliders() {
    if (this.logDate) {
      this.logDate.value = new Date().toISOString().split('T')[0];
    }

    if (this.moodSlider) {
      this.moodSlider.addEventListener('input', () => this.updateMoodDisplay());
      this.updateMoodDisplay();
    }

    if (this.energySlider) {
      this.energySlider.addEventListener('input', () => this.updateEnergyDisplay());
      this.updateEnergyDisplay();
    }
  }

  updateMoodDisplay() {
    const val = parseInt(this.moodSlider.value, 10);
    this.moodDisplay.textContent = `${val}/10`;
    
    const descriptions = {
      1: 'Deeply Drained / Heavy',
      2: 'Struggling / Low',
      3: 'Somber / Fatigued',
      4: 'Subdued',
      5: 'Neutral / Steady',
      6: 'Mildly Content',
      7: 'Pleasant & Balanced',
      8: 'Serene & Energized',
      9: 'Joyful & Harmonious',
      10: 'Transcendent Peace'
    };
    this.moodDescriptor.textContent = descriptions[val] || 'Balanced';
  }

  updateEnergyDisplay() {
    const val = parseInt(this.energySlider.value, 10);
    this.energyDisplay.textContent = `${val}/10`;

    const descriptions = {
      1: 'Depleted / Exhausted',
      2: 'Very Sluggish',
      3: 'Low Stamina',
      4: 'Drowsy',
      5: 'Moderate / Baseline',
      6: 'Steady Wakefulness',
      7: 'Active & Nimble',
      8: 'High Drive',
      9: 'Vibrant & Resilient',
      10: 'Peak Vitality'
    };
    this.energyDescriptor.textContent = descriptions[val] || 'Moderate';
  }

  // ==========================================================================
  // Category Chips Rendering
  // ==========================================================================

  renderCategoryChips() {
    const categories = ['inputs', 'activities', 'people', 'outcomes'];

    categories.forEach(cat => {
      const container = document.getElementById(`chips-${cat}`);
      if (!container) return;

      container.innerHTML = '';
      const baseTags = DEFAULT_TAGS[cat] || [];
      const userCustom = Array.from(this.customTags[cat]);
      const allTags = [...baseTags, ...userCustom];

      allTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tag-chip ${this.selectedTags[cat].has(tag) ? 'active' : ''}`;
        btn.textContent = tag;
        btn.addEventListener('click', () => {
          if (this.selectedTags[cat].has(tag)) {
            this.selectedTags[cat].delete(tag);
            btn.classList.remove('active');
          } else {
            this.selectedTags[cat].add(tag);
            btn.classList.add('active');
          }
        });
        container.appendChild(btn);
      });

      // Add "+ Custom" chip button
      const addCustomBtn = document.createElement('button');
      addCustomBtn.type = 'button';
      addCustomBtn.className = 'tag-chip add-custom-chip';
      addCustomBtn.innerHTML = '+ Add Tag';
      addCustomBtn.addEventListener('click', () => this.promptCustomTag(cat));
      container.appendChild(addCustomBtn);
    });
  }

  promptCustomTag(category) {
    const name = prompt(`Enter custom tag for ${category}:`);
    if (name && name.trim()) {
      const cleanTag = name.trim();
      this.customTags[category].add(cleanTag);
      this.selectedTags[category].add(cleanTag);
      this.renderCategoryChips();
      if (window.app) window.app.showToast(`Added custom tag: "${cleanTag}"`);
    }
  }

  // ==========================================================================
  // Natural Language Parser (NLP)
  // ==========================================================================

  setupEventListeners() {
    // Form Submit
    if (this.logForm) {
      this.logForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCurrentLog();
      });
    }

    // Natural Language Parse Button
    if (this.nlpParseBtn) {
      this.nlpParseBtn.addEventListener('click', () => this.parseNaturalLanguageInput());
    }

    // Search Logs
    if (this.logsSearchInput) {
      this.logsSearchInput.addEventListener('input', () => this.renderRecentLogs());
    }
    Object.values(this.logFilters || {}).forEach(control => control?.addEventListener('input', () => this.renderRecentLogs()));
  }

  parseNaturalLanguageInput() {
    const raw = this.nlpInput ? this.nlpInput.value.trim() : '';
    if (!raw) {
      this.showNlpFeedback('Please write a sentence describing your day.', 'warning');
      return;
    }

    const text = raw.toLowerCase();
    const extracted = {
      inputs: [],
      activities: [],
      people: [],
      outcomes: [],
      mood: null,
      energy: null
    };

    // Keyword pattern matching rules
    // Sleep
    if (text.includes('8 hour') || text.includes('8h') || text.includes('slept well') || text.includes('8 hours')) {
      extracted.inputs.push('8h Sleep');
    } else if (text.includes('7.5') || text.includes('7 and a half') || text.includes('rested')) {
      extracted.inputs.push('7.5h+ Sleep');
    } else if (text.includes('little sleep') || text.includes('< 6') || text.includes('insomnia') || text.includes('tired sleep') || text.includes('5 hour')) {
      extracted.inputs.push('Sleep < 6h');
    } else if (text.includes('sleep') || text.includes('slept')) {
      extracted.inputs.push('7h Sleep');
    }

    // Caffeine
    if (text.includes('3 coffee') || text.includes('lots of coffee') || text.includes('too much caffeine') || text.includes('energy drink')) {
      extracted.inputs.push('Coffee > 2');
    } else if (text.includes('2 coffee') || text.includes('two coffees') || text.includes('2 cups')) {
      extracted.inputs.push('Coffee x2');
    } else if (text.includes('coffee') || text.includes('espresso') || text.includes('latte') || text.includes('tea')) {
      extracted.inputs.push('Coffee x1');
    } else if (text.includes('no coffee') || text.includes('no caffeine')) {
      extracted.inputs.push('No Caffeine');
    }

    // Hydration & Diet
    if (text.includes('water') || text.includes('hydrat')) extracted.inputs.push('Hydration 2L');
    if (text.includes('clean diet') || text.includes('healthy food') || text.includes('salad') || text.includes('home cooked')) extracted.inputs.push('Clean Diet');
    if (text.includes('fast food') || text.includes('junk food') || text.includes('burger') || text.includes('pizza')) extracted.inputs.push('Fast Food');
    if (text.includes('meditat') || text.includes('prayer') || text.includes('mindful')) extracted.inputs.push('Meditation');

    // Activities
    if (text.includes('gym') || text.includes('workout') || text.includes('exercise') || text.includes('lifting')) extracted.activities.push('Gym Session');
    if (text.includes('walk') || text.includes('stroll')) {
      if (text.includes('morning')) extracted.activities.push('Morning Walk');
      else extracted.activities.push('Evening Walk');
    }
    if (text.includes('deep work') || text.includes('focused work') || text.includes('3 hour work') || text.includes('coding')) {
      extracted.activities.push('Deep Work 3h');
    } else if (text.includes('work') || text.includes('study') || text.includes('writing')) {
      extracted.activities.push('Deep Work 2h');
    }
    if (text.includes('read') || text.includes('book')) extracted.activities.push('Reading');
    if (text.includes('screen') || text.includes('youtube') || text.includes('gaming') || text.includes('netflix')) extracted.activities.push('Screen Time > 4h');

    // People
    if (text.includes('friend') || text.includes('friends')) extracted.people.push('Close Friends');
    if (text.includes('colleague') || text.includes('coworker') || text.includes('team') || text.includes('meeting')) extracted.people.push('Colleagues');
    if (text.includes('family') || text.includes('parent') || text.includes('brother') || text.includes('sister')) extracted.people.push('Family');
    if (text.includes('partner') || text.includes('wife') || text.includes('husband') || text.includes('girlfriend') || text.includes('boyfriend')) extracted.people.push('Partner');
    if (extracted.people.length === 0 || text.includes('solo') || text.includes('alone') || text.includes('by myself')) extracted.people.push('Solo');

    // Outcomes & Mood
    if (text.includes('flow state') || text.includes('in the zone') || text.includes('productive') || text.includes('crushed it')) {
      extracted.outcomes.push('Flow State');
      extracted.mood = 8;
      extracted.energy = 8;
    }
    if (text.includes('peace') || text.includes('calm') || text.includes('seren') || text.includes('tranquil')) {
      extracted.outcomes.push('Calm Mind');
      extracted.mood = 8;
    }
    if (text.includes('high energy') || text.includes('energetic') || text.includes('vibrant')) {
      extracted.outcomes.push('High Energy');
      extracted.energy = 9;
    }
    if (text.includes('brain fog') || text.includes('confused') || text.includes('distracted')) {
      extracted.outcomes.push('Brain Fog');
      extracted.mood = Math.min(extracted.mood || 5, 5);
      extracted.energy = Math.min(extracted.energy || 5, 4);
    }
    if (text.includes('anxious') || text.includes('restless') || text.includes('stress')) {
      extracted.outcomes.push('Restless / Anxious');
      extracted.mood = Math.min(extracted.mood || 4, 4);
    }
    if (text.includes('tired') || text.includes('fatigue') || text.includes('exhaust')) {
      extracted.outcomes.push('Fatigue');
      extracted.energy = Math.min(extracted.energy || 3, 3);
    }

    // Direct mood numbers (e.g. "mood 8", "energy 7")
    const moodMatch = text.match(/mood\s*[:=-]?\s*(\d{1,2})/);
    if (moodMatch) extracted.mood = Math.min(10, Math.max(1, parseInt(moodMatch[1], 10)));
    const energyMatch = text.match(/energy\s*[:=-]?\s*(\d{1,2})/);
    if (energyMatch) extracted.energy = Math.min(10, Math.max(1, parseInt(energyMatch[1], 10)));

    // Apply to UI
    if (extracted.mood) {
      this.moodSlider.value = extracted.mood;
      this.updateMoodDisplay();
    }
    if (extracted.energy) {
      this.energySlider.value = extracted.energy;
      this.updateEnergyDisplay();
    }

    // Apply extracted tags to selections
    ['inputs', 'activities', 'people', 'outcomes'].forEach(cat => {
      extracted[cat].forEach(t => this.selectedTags[cat].add(t));
    });
    this.renderCategoryChips();

    // Fill notes with original text
    if (this.notesInput && !this.notesInput.value) {
      this.notesInput.value = raw;
    }

    const totalExtracted = extracted.inputs.length + extracted.activities.length + extracted.people.length + extracted.outcomes.length;
    this.showNlpFeedback(`Parsed successfully! Identified ${totalExtracted} tags + Mood/Energy. Review below and click "Save Daily Log".`, 'success');
  }

  showNlpFeedback(msg, type = 'info') {
    if (!this.nlpFeedback) return;
    this.nlpFeedback.textContent = msg;
    this.nlpFeedback.className = `nlp-feedback-box ${type}`;
    this.nlpFeedback.style.display = 'block';
  }

  // ==========================================================================
  // Save & Render Log
  // ==========================================================================

  saveCurrentLog() {
    const dateVal = this.logDate.value;
    if (!dateVal) {
      if (window.app && window.app.showToast) {
        window.app.showToast('Please select a date');
      }
      return;
    }

    const logData = {
      date: dateVal,
      mood: parseInt(this.moodSlider.value, 10),
      energy: parseInt(this.energySlider.value, 10),
      activities: Array.from(this.selectedTags.activities),
      inputs: Array.from(this.selectedTags.inputs),
      people: Array.from(this.selectedTags.people),
      outcomes: Array.from(this.selectedTags.outcomes),
      notes: this.notesInput.value.trim(),
      naturalInput: this.nlpInput ? this.nlpInput.value.trim() : ''
    };

    window.causalStorage.addOrUpdateLog(logData);
    
    // Clear selections & form
    this.resetForm();
    this.renderRecentLogs();

    if (window.app) {
      window.app.showToast('Daily log saved successfully');
      window.app.refreshAllComponents();
    }
  }

  resetForm() {
    ['inputs', 'activities', 'people', 'outcomes'].forEach(cat => {
      this.selectedTags[cat].clear();
    });
    this.notesInput.value = '';
    if (this.nlpInput) this.nlpInput.value = '';
    if (this.nlpFeedback) this.nlpFeedback.style.display = 'none';
    this.moodSlider.value = 7;
    this.energySlider.value = 7;
    this.updateMoodDisplay();
    this.updateEnergyDisplay();
    this.renderCategoryChips();
  }

  renderRecentLogs() {
    if (!this.recentLogsContainer) return;
    const logs = window.causalStorage.getLogs();
    const query = this.logsSearchInput ? this.logsSearchInput.value.toLowerCase().trim() : '';
    const filters = this.logFilters || {};
    const from = filters.from?.value || '';
    const to = filters.to?.value || '';
    const includeTag = filters.includeTag?.value.toLocaleLowerCase().trim() || '';
    const excludeTag = filters.excludeTag?.value.toLocaleLowerCase().trim() || '';
    const parseRange = raw => {
      if (!raw?.trim()) return null;
      const match = raw.trim().match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);
      if (!match) return { invalid: true };
      const low = Number(match[1]);
      const high = Number(match[2] || match[1]);
      return low >= 1 && high <= 10 && low <= high ? { low, high } : { invalid: true };
    };
    const moodRange = parseRange(filters.mood?.value || '');
    const energyRange = parseRange(filters.energy?.value || '');
    const tagsFor = log => ['inputs', 'activities', 'people', 'outcomes'].flatMap(key => Array.isArray(log[key]) ? log[key] : []);

    const filtered = logs.filter(log => {
      const tags = tagsFor(log);
      const searchable = [log.date, log.notes || '', ...tags].join(' ').toLocaleLowerCase();
      const rangeMatches = (range, score) => !range || (!range.invalid && typeof score === 'number' && score >= range.low && score <= range.high);
      return (!query || searchable.includes(query)) &&
        (!from || log.date >= from) && (!to || log.date <= to) &&
        rangeMatches(moodRange, log.mood) && rangeMatches(energyRange, log.energy) &&
        (!includeTag || tags.some(tag => String(tag).toLocaleLowerCase().includes(includeTag))) &&
        (!excludeTag || !tags.some(tag => String(tag).toLocaleLowerCase().includes(excludeTag)));
    });
    const resultsCount = document.getElementById('logs-filter-count');
    if (resultsCount) resultsCount.textContent = `${filtered.length} of ${logs.length} ${logs.length === 1 ? 'day' : 'days'}`;

    this.recentLogsContainer.innerHTML = '';

    if (filtered.length === 0) {
      this.recentLogsContainer.innerHTML = `
        <div class="empty-logs-state">
          <p class="empty-desc">${logs.length ? 'No Daily Logs match these filters.' : 'No logs found. Add your first entry above!'}</p>
        </div>
      `;
      return;
    }

    filtered.forEach(log => {
      const card = document.createElement('div');
      card.className = 'log-history-card';

      const d = new Date(log.date + 'T00:00:00');
      const dateDisplay = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      card.innerHTML = `
        <div class="log-card-header">
          <div class="log-date-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <strong>${dateDisplay}</strong>
          </div>
          <div class="log-metrics-pill">
            ${typeof log.mood === 'number' && Number.isFinite(log.mood) ? `<span class="metric-chip mood-chip" title="Mood: ${log.mood}/10">Mood: ${log.mood}</span>` : ''}
            ${typeof log.energy === 'number' && Number.isFinite(log.energy) ? `<span class="metric-chip energy-chip" title="Energy: ${log.energy}/10">Energy: ${log.energy}</span>` : ''}
          </div>
          <button class="delete-log-btn" title="Delete log" aria-label="Delete log entry">✕</button>
        </div>

        <div class="log-tags-cluster">
          ${(log.inputs || []).map(t => `<span class="mini-tag tag-input">${escapeHtml(t)}</span>`).join('')}
          ${(log.activities || []).map(t => `<span class="mini-tag tag-activity">${escapeHtml(t)}</span>`).join('')}
          ${Number(log.studySeconds) > 0 ? `<span class="mini-tag tag-activity">Focus time: ${Math.floor(Number(log.studySeconds) / 60)} min</span>` : ''}
          ${(log.people || []).map(t => `<span class="mini-tag tag-person">${escapeHtml(t)}</span>`).join('')}
          ${(log.outcomes || []).map(t => `<span class="mini-tag tag-outcome">${escapeHtml(t)}</span>`).join('')}
        </div>

        ${log.notes ? `<p class="log-notes-text">“${escapeHtml(log.notes)}”</p>` : ''}
      `;

      // Delete action
      const delBtn = card.querySelector('.delete-log-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete log entry for ${dateDisplay}?`)) {
          window.causalStorage.deleteLog(log.id);
          this.renderRecentLogs();
          if (window.app) window.app.refreshAllComponents();
        }
      });

      this.recentLogsContainer.appendChild(card);
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window.causalLogger = new CausalLogger();
