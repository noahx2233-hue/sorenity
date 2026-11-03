/**
 * Sorenity's personal pattern explorer.
 * It compares rated days with a factor against rated days without it.
 * These are observational associations, not proof that a factor caused an outcome.
 */
class PersonalCausalGraph {
  constructor() {
    this.selectedNodeId = null;
    this.activeFilter = 'all';
    this.activeView = 'impact';
  }

  init() {
    this.graphContainer = document.getElementById('causal-graph-canvas');
    this.inspectorContainer = document.getElementById('causal-inspector-panel');
    this.insightsContainer = document.getElementById('causal-insights');
    this.setupControls();
    this.render();
  }

  setupControls() {
    const filterButtons = document.querySelectorAll('.graph-filter-btn');
    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        filterButtons.forEach(item => {
          item.classList.remove('active');
          item.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        this.activeFilter = button.getAttribute('data-filter') || 'all';
        this.render();
      });
    });

    const viewButtons = document.querySelectorAll('.graph-view-btn');
    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        viewButtons.forEach(item => {
          item.classList.remove('active');
          item.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        this.activeView = button.getAttribute('data-graph-view') || 'impact';
        this.render();
      });
    });
  }

  computeCausalModel() {
    const logs = window.causalStorage?.getLogs?.() || [];
    const isRating = value => typeof value === 'number' && Number.isFinite(value);
    const moodLogs = logs.filter(log => isRating(log.mood));
    const energyLogs = logs.filter(log => isRating(log.energy));
    const ratedLogs = logs.filter(log => isRating(log.mood) || isRating(log.energy));
    const tagData = new Map();
    const tagsByLog = new Map();
    const categories = [
      ['inputs', 'input'],
      ['activities', 'activity'],
      ['people', 'person'],
      ['outcomes', 'outcome']
    ];

    ratedLogs.forEach(log => {
      const tagSet = new Set();
      categories.forEach(([key, category]) => {
        const values = Array.isArray(log[key]) ? log[key] : [];
        values.forEach(value => {
          const tag = String(value || '').trim();
          if (!tag) return;
          tagSet.add(tag);
          if (!tagData.has(tag)) tagData.set(tag, { label: tag, category, days: [], coOccurrences: new Map() });
        });
      });
      tagsByLog.set(log, tagSet);
      tagSet.forEach(tag => tagData.get(tag).days.push(log));
      tagSet.forEach(tag => {
        tagSet.forEach(other => {
          if (tag !== other) {
            const pairs = tagData.get(tag).coOccurrences;
            pairs.set(other, (pairs.get(other) || 0) + 1);
          }
        });
      });
    });

    const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const compare = (metricLogs, tag, metric) => {
      const present = metricLogs.filter(log => tagsByLog.get(log)?.has(tag));
      const absent = metricLogs.filter(log => !tagsByLog.get(log)?.has(tag));
      const presentAverage = mean(present.map(log => log[metric]));
      const absentAverage = mean(absent.map(log => log[metric]));
      return {
        presentAverage,
        absentAverage,
        delta: presentAverage === null || absentAverage === null ? null : presentAverage - absentAverage,
        presentCount: present.length,
        absentCount: absent.length
      };
    };
    const comparePair = (metricLogs, first, second, metric) => {
      const together = metricLogs.filter(log => {
        const tags = tagsByLog.get(log);
        return tags?.has(first) && tags?.has(second);
      });
      const apart = metricLogs.filter(log => {
        const tags = tagsByLog.get(log);
        return !(tags?.has(first) && tags?.has(second));
      });
      const togetherAverage = mean(together.map(log => log[metric]));
      const apartAverage = mean(apart.map(log => log[metric]));
      return {
        togetherAverage,
        apartAverage,
        delta: togetherAverage === null || apartAverage === null ? null : togetherAverage - apartAverage,
        togetherCount: together.length,
        apartCount: apart.length
      };
    };
    const percentage = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : null;

    const nodes = Array.from(tagData.values()).map(item => {
      const mood = compare(moodLogs, item.label, 'mood');
      const energy = compare(energyLogs, item.label, 'energy');
      const presentMoodLogs = moodLogs.filter(log => tagsByLog.get(log)?.has(item.label));
      const absentMoodLogs = moodLogs.filter(log => !tagsByLog.get(log)?.has(item.label));
      const highPresent = presentMoodLogs.filter(log => log.mood >= 7).length;
      const lowPresent = presentMoodLogs.filter(log => log.mood <= 4).length;
      const highAbsent = absentMoodLogs.filter(log => log.mood >= 7).length;
      const lowAbsent = absentMoodLogs.filter(log => log.mood <= 4).length;
      const support = Math.max(mood.presentCount, energy.presentCount);
      const referenceDays = Math.max(mood.absentCount, energy.absentCount);
      let confidence = 'Very early signal';
      if (ratedLogs.length >= 10 && support >= 3 && referenceDays >= 3) confidence = 'Steadier pattern';
      else if (ratedLogs.length >= 5 && support >= 2 && referenceDays >= 2) confidence = 'Early signal';

      const deltas = [
        { metric: 'mood', value: mood.delta },
        { metric: 'energy', value: energy.delta }
      ].filter(item => item.value !== null);
      deltas.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const primary = deltas[0] || { metric: null, value: null };
      const coTags = Array.from(item.coOccurrences.entries())
        .map(([tag, count]) => ({
          tag,
          count,
          share: item.days.length ? count / item.days.length : 0,
          mood: comparePair(moodLogs, item.label, tag, 'mood'),
          energy: comparePair(energyLogs, item.label, tag, 'energy')
        }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, 3);

      return {
        id: item.label,
        label: item.label,
        category: item.category,
        count: item.days.length,
        mood,
        energy,
        highMoodRate: percentage(highPresent, presentMoodLogs.length),
        lowMoodRate: percentage(lowPresent, presentMoodLogs.length),
        highMoodRateAbsent: percentage(highAbsent, absentMoodLogs.length),
        lowMoodRateAbsent: percentage(lowAbsent, absentMoodLogs.length),
        confidence,
        primaryMetric: primary.metric,
        primaryDelta: primary.value,
        score: primary.value === null ? 0 : Math.abs(primary.value),
        coTags
      };
    });

    return { nodes, ratedDays: ratedLogs.length, moodRatedDays: moodLogs.length, energyRatedDays: energyLogs.length };
  }

  filteredNodes(nodes) {
    let result = nodes;
    if (this.activeFilter === 'positive') {
      result = nodes.filter(node => [node.mood.delta, node.energy.delta].some(delta => delta !== null && delta > 0.15));
      result.sort((a, b) => this.directionalScore(b, 'positive') - this.directionalScore(a, 'positive'));
    } else if (this.activeFilter === 'negative') {
      result = nodes.filter(node => [node.mood.delta, node.energy.delta].some(delta => delta !== null && delta < -0.15));
      result.sort((a, b) => this.directionalScore(a, 'negative') - this.directionalScore(b, 'negative'));
    } else {
      result = [...nodes].sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));
    }
    return result;
  }

  directionalScore(node, direction) {
    const values = [node.mood.delta, node.energy.delta].filter(value => value !== null);
    if (direction === 'positive') return Math.max(0, ...values);
    return Math.min(0, ...values);
  }

  render() {
    if (!this.graphContainer) return;
    const model = this.computeCausalModel();
    this.renderInsights(model);
    const visibleNodes = this.filteredNodes(model.nodes);
    if (!visibleNodes.some(node => node.id === this.selectedNodeId)) {
      this.selectedNodeId = visibleNodes.length ? visibleNodes[0].id : null;
    }

    if (this.activeView === 'radar') this.renderRadar(visibleNodes, model.ratedDays);
    else this.renderImpactList(visibleNodes, model.ratedDays);

    const selectedNode = visibleNodes.find(node => node.id === this.selectedNodeId);
    if (selectedNode) this.renderInspector(selectedNode);
    else this.renderInspectorEmpty(model);
  }

  renderInsights(model) {
    if (!this.insightsContainer) return;
    const cards = [];
    const remaining = Math.max(0, 10 - model.ratedDays);
    const progressText = model.ratedDays === 0
      ? 'Add a Daily Log with mood or energy ratings to start comparing patterns.'
      : remaining
        ? `You have ${model.ratedDays} rated day${model.ratedDays === 1 ? '' : 's'}. Log ${remaining} more to reach a helpful 10-day review mark; early signals stay visible.`
        : `You have ${model.ratedDays} rated days. Patterns are easier to interpret as you keep logging.`;
    cards.push(`<article class="graph-insight-card graph-progress-insight"><div class="graph-insight-topline"><span>Pattern confidence</span><strong>${model.ratedDays}/10</strong></div><p>${escapeHtml(progressText)}</p><div class="graph-progress-track" role="progressbar" aria-label="Rated days toward ten day review mark" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${Math.min(10, model.ratedDays)}"><span style="width:${Math.min(100, model.ratedDays * 10)}%"></span></div></article>`);

    const positive = [];
    const friction = [];
    model.nodes.forEach(node => {
      [['Mood', node.mood.delta], ['Energy', node.energy.delta]].forEach(([metric, delta]) => {
        if (delta === null || Math.abs(delta) <= 0.15) return;
        const item = { node, metric, delta, support: metric === 'Mood' ? node.mood.presentCount : node.energy.presentCount, comparison: metric === 'Mood' ? node.mood.absentCount : node.energy.absentCount };
        if (delta > 0) positive.push(item);
        else friction.push(item);
      });
    });
    positive.sort((a, b) => b.delta - a.delta || b.support - a.support);
    friction.sort((a, b) => a.delta - b.delta || b.support - a.support);

    const makeSignalCard = (item, kind, title) => {
      const change = this.formatDelta(item.delta);
      const confidence = item.node.confidence;
      const followUp = item.delta > 0
        ? ' Consider making room for it again and see whether the pattern repeats.'
        : ' Notice whether changing this factor shifts your ratings over time.';
      const text = `Days with “${item.node.label}” averaged ${change} ${item.metric.toLowerCase()} points ${item.delta > 0 ? 'higher' : 'lower'} (${item.support} tagged vs ${item.comparison} untagged rated days).${followUp}`;
      return `<article class="graph-insight-card ${kind}"><div class="graph-insight-topline"><span>${title}</span><small>${escapeHtml(confidence)}</small></div><strong>${escapeHtml(item.node.label)}</strong><p>${escapeHtml(text)}</p></article>`;
    };
    if (positive.length) cards.push(makeSignalCard(positive[0], 'positive', 'Positive association'));
    if (friction.length) {
      const distinct = positive.length ? friction.find(item => item.node.id !== positive[0].node.id || item.metric !== positive[0].metric) : friction[0];
      if (distinct) cards.push(makeSignalCard(distinct, 'friction', 'Friction association'));
    }

    const pairs = [];
    model.nodes.forEach(node => node.coTags.forEach(pair => {
      if (node.id.localeCompare(pair.tag) < 0) pairs.push({ first: node.label, second: pair.tag, count: pair.count, mood: pair.mood, energy: pair.energy });
    }));
    pairs.sort((a, b) => {
      const aSupport = Math.max(a.mood?.togetherCount || 0, a.energy?.togetherCount || 0);
      const bSupport = Math.max(b.mood?.togetherCount || 0, b.energy?.togetherCount || 0);
      const aDelta = Math.max(Math.abs(a.mood?.delta || 0), Math.abs(a.energy?.delta || 0));
      const bDelta = Math.max(Math.abs(b.mood?.delta || 0), Math.abs(b.energy?.delta || 0));
      return (bSupport >= 2 ? bDelta : -1) - (aSupport >= 2 ? aDelta : -1) || b.count - a.count || a.first.localeCompare(b.first);
    });
    if (pairs.length) {
      const pair = pairs[0];
      const strongest = [
        { label: 'mood', result: pair.mood },
        { label: 'energy', result: pair.energy }
      ].filter(item => item.result?.delta !== null && item.result?.togetherCount >= 2)
        .sort((a, b) => Math.abs(b.result.delta) - Math.abs(a.result.delta))[0];
      const pairText = strongest
        ? `On days with both tags, ${strongest.label} averaged ${this.formatDelta(strongest.result.delta)} points ${strongest.result.delta > 0 ? 'higher' : 'lower'} than on other rated days (${strongest.result.togetherCount} days together). This is an early association, not a cause.`
        : `These two factors appeared together ${pair.count} time${pair.count === 1 ? '' : 's'}. More days together are needed to compare their shared pattern.`;
      cards.push(`<article class="graph-insight-card graph-pair-insight"><div class="graph-insight-topline"><span>${strongest ? 'Combination pattern' : 'Most common pairing'}</span><small>${pair.count} rated day${pair.count === 1 ? '' : 's'}</small></div><strong>${escapeHtml(pair.first)} + ${escapeHtml(pair.second)}</strong><p>${escapeHtml(pairText)}</p></article>`);
    }
    if (cards.length === 1 && model.ratedDays > 0) {
      cards.push('<article class="graph-insight-card graph-neutral-insight"><div class="graph-insight-topline"><span>No clear direction yet</span></div><p>Keep logging factors and ratings. The graph will surface early differences when it has something to compare.</p></article>');
    }
    this.insightsContainer.innerHTML = cards.slice(0, 4).join('');
  }

  renderImpactList(nodes, ratedDays) {
    if (!ratedDays) {
      this.graphContainer.innerHTML = '<div class="graph-empty-state"><span class="graph-empty-sparkle">✦</span><strong>No rated days yet</strong><p>Add a Daily Log with mood and energy ratings. Milo will start comparing factors across days.</p></div>';
      return;
    }
    if (!nodes.length) {
      const message = this.activeFilter === 'positive'
        ? 'No positive directional signals stand out yet. Keep logging to build a comparison.'
        : 'No friction signals stand out yet. Keep logging to build a comparison.';
      this.graphContainer.innerHTML = `<div class="graph-empty-state"><span class="graph-empty-sparkle">✦</span><strong>No matching patterns yet</strong><p>${escapeHtml(message)}</p></div>`;
      return;
    }
    const title = this.activeFilter === 'positive' ? 'FACTORS ASSOCIATED WITH HIGHER RATINGS'
      : this.activeFilter === 'negative' ? 'FACTORS ASSOCIATED WITH LOWER RATINGS'
        : 'RATING DIFFERENCES BY FACTOR';
    const rows = nodes.slice(0, 12).map(node => `
      <button type="button" class="graph-impact-item${node.id === this.selectedNodeId ? ' selected' : ''}" data-node-id="${escapeHtml(node.id)}" aria-pressed="${node.id === this.selectedNodeId}">
        <span class="graph-impact-heading"><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.confidence)} · ${node.count} tagged day${node.count === 1 ? '' : 's'}</small></span>
        ${this.renderMeasureBar('Mood', node.mood.delta)}
        ${this.renderMeasureBar('Energy', node.energy.delta)}
      </button>`).join('');
    this.graphContainer.innerHTML = `<div class="graph-impact-list"><div class="graph-impact-list-heading"><strong>${title}</strong><span>Average change · factor logged vs not logged</span></div>${rows}</div>`;
    this.graphContainer.querySelectorAll('.graph-impact-item').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedNodeId = button.getAttribute('data-node-id');
        this.render();
      });
    });
  }

  renderMeasureBar(label, delta) {
    const valid = delta !== null;
    const width = valid ? Math.max(3, Math.min(100, Math.abs(delta) / 3 * 100)) : 0;
    const tone = !valid || Math.abs(delta) <= 0.15 ? 'neutral' : delta > 0 ? 'positive' : 'negative';
    const value = valid ? `${this.formatDelta(delta)} pts` : 'Not enough ratings';
    return `<span class="graph-impact-measure"><span class="graph-impact-measure-label">${label}</span><span class="graph-impact-track"><span class="graph-impact-fill ${tone}" style="width:${width}%"></span></span><strong class="${tone}">${value}</strong></span>`;
  }

  renderRadar(nodes, ratedDays) {
    if (!ratedDays) {
      this.graphContainer.innerHTML = '<div class="graph-empty-state"><span class="graph-empty-sparkle">✦</span><strong>No rated days yet</strong><p>Add a Daily Log with mood or energy ratings to start the radar.</p></div>';
      return;
    }
    if (!nodes.length) {
      this.graphContainer.innerHTML = '<div class="graph-empty-state"><span class="graph-empty-sparkle">✦</span><strong>No matching patterns yet</strong><p>Try All Links or keep logging a little longer.</p></div>';
      return;
    }
    const width = 720;
    const height = 500;
    const center = { x: width / 2, y: 248 };
    const radius = 155;
    const maxImpact = 3;
    const chartNodes = nodes.slice(0, 7);
    const axisCount = Math.max(5, chartNodes.length);
    const angleAt = index => -Math.PI / 2 + (Math.PI * 2 * index / axisCount);
    const pointAt = (index, scale) => ({ x: center.x + Math.cos(angleAt(index)) * radius * scale, y: center.y + Math.sin(angleAt(index)) * radius * scale });
    const axisPoints = Array.from({ length: axisCount }, (_, index) => pointAt(index, 1));
    const polygonPoints = points => points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    let rings = '';
    for (let level = 1; level <= 4; level += 1) {
      const scale = level / 4;
      const points = axisPoints.map(point => ({ x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale }));
      const label = (maxImpact * scale).toFixed(1);
      rings += `<polygon class="radar-grid-ring${level === 4 ? ' outer' : ''}" points="${polygonPoints(points)}"></polygon><text class="radar-grid-label" x="${center.x + 6}" y="${center.y - radius * scale - 3}">${label}</text>`;
    }
    const axisSvg = axisPoints.map((point, index) => {
      const labelPoint = pointAt(index, 1.19);
      const node = chartNodes[index];
      const fullLabel = node ? node.label : '';
      const shortLabel = fullLabel.length > 18 ? `${fullLabel.slice(0, 17)}…` : fullLabel;
      const anchor = labelPoint.x < center.x - 18 ? 'end' : labelPoint.x > center.x + 18 ? 'start' : 'middle';
      return `<line class="radar-axis-line" x1="${center.x}" y1="${center.y}" x2="${point.x}" y2="${point.y}"></line><text class="radar-axis-label" x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="${anchor}"><title>${escapeHtml(fullLabel)}</title>${escapeHtml(shortLabel || 'More patterns')}</text>`;
    }).join('');
    const nodeSvg = chartNodes.map((node, index) => {
      const scale = Math.max(0.08, Math.min(1, node.score / maxImpact));
      const point = pointAt(index, scale);
      const direction = node.primaryDelta === null || Math.abs(node.primaryDelta) <= 0.15 ? 'neutral' : node.primaryDelta > 0 ? 'positive' : 'negative';
      const selected = node.id === this.selectedNodeId;
      return `<g class="radar-node ${direction}${selected ? ' selected' : ''}" data-node-id="${escapeHtml(node.id)}" tabindex="0" role="button" aria-label="Inspect ${escapeHtml(node.label)}"><circle class="radar-point-halo" cx="${point.x}" cy="${point.y}" r="10"></circle><circle class="radar-point ${direction}" cx="${point.x}" cy="${point.y}" r="${selected ? 6 : 5}"></circle><title>${escapeHtml(node.label)} · ${this.formatDelta(node.primaryDelta)} ${escapeHtml(node.primaryMetric || 'rating')} points</title></g>`;
    }).join('');
    const centerLabel = `<text class="radar-center-value" x="${center.x}" y="${center.y - 2}">${ratedDays}</text><text class="radar-center-caption" x="${center.x}" y="${center.y + 16}">RATED DAYS</text>`;
    this.graphContainer.innerHTML = `
      <svg class="causal-network-svg radar-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Radar mesh showing the strength and direction of observed mood and energy associations">
        ${axisSvg}${rings}${nodeSvg}${centerLabel}
        <text class="radar-chart-kicker" x="${center.x}" y="25" text-anchor="middle">OBSERVED ASSOCIATION</text>
        <text class="radar-chart-note" x="${center.x}" y="43" text-anchor="middle">Distance reflects the strongest average rating difference (points)</text>
        <g class="radar-legend" transform="translate(${center.x - 108}, 475)"><circle class="radar-legend-dot positive" cx="0" cy="0" r="4"></circle><text x="9" y="4">Higher rating</text><circle class="radar-legend-dot negative" cx="110" cy="0" r="4"></circle><text x="119" y="4">Lower rating</text></g>
      </svg>`;
    this.graphContainer.querySelectorAll('.radar-node').forEach(element => {
      const select = () => {
        this.selectedNodeId = element.getAttribute('data-node-id');
        this.render();
      };
      element.addEventListener('click', select);
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
    });
  }

  renderInspectorEmpty(model) {
    if (!this.inspectorContainer) return;
    this.inspectorContainer.innerHTML = model.ratedDays
      ? '<p class="inspector-placeholder">No factors match this view yet. Try All Links or log a few more rated days.</p>'
      : '<p class="inspector-placeholder">Your factor comparisons will appear here after you add Daily Logs with mood or energy ratings.</p>';
  }

  renderInspector(node) {
    if (!this.inspectorContainer) return;
    const metricBlock = (label, result) => {
      const changeClass = result.delta === null || Math.abs(result.delta) <= 0.15 ? 'neutral' : result.delta > 0 ? 'positive' : 'negative';
      const changeText = result.delta === null ? '—' : `${this.formatDelta(result.delta)} pts`;
      return `<div class="inspector-comparison"><div class="inspector-comparison-head"><strong>${label}</strong><b class="${changeClass}">${changeText}</b></div><div class="inspector-comparison-values"><span>With tag<strong>${this.formatAverage(result.presentAverage)}</strong><small>n=${result.presentCount}</small></span><span>Without tag<strong>${this.formatAverage(result.absentAverage)}</strong><small>n=${result.absentCount}</small></span></div></div>`;
    };
    const coTags = node.coTags.length
      ? `<ul class="inspector-pair-list">${node.coTags.map(pair => {
        const pairMetric = [pair.mood, pair.energy].filter(result => result.delta !== null && result.togetherCount >= 2)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
        const comparison = pairMetric ? ` · ${this.formatDelta(pairMetric.delta)} pts` : '';
        return `<li><span>${escapeHtml(pair.tag)}</span><strong>${pair.count} together${comparison}</strong></li>`;
      }).join('')}</ul>`
      : '<p class="inspector-hint">No repeated tag pair has emerged yet.</p>';
    const moodRanges = node.highMoodRate === null
      ? '<p class="inspector-hint">High/low mood comparisons need mood ratings on more days.</p>'
      : `<p class="inspector-range-line">High mood (7+): <strong>${node.highMoodRate}%</strong> with tag <span>vs</span> <strong>${node.highMoodRateAbsent === null ? '—' : `${node.highMoodRateAbsent}%`}</strong> without.</p><p class="inspector-range-line">Low mood (1–4): <strong>${node.lowMoodRate}%</strong> with tag <span>vs</span> <strong>${node.lowMoodRateAbsent === null ? '—' : `${node.lowMoodRateAbsent}%`}</strong> without.</p>`;
    this.inspectorContainer.innerHTML = `
      <div class="inspector-header"><span class="inspector-cat-tag ${escapeHtml(node.category)}">${escapeHtml(node.category.toUpperCase())}</span><span class="inspector-confidence">${escapeHtml(node.confidence)}</span><h3 class="inspector-title">${escapeHtml(node.label)}</h3><p class="inspector-support">Logged on ${node.count} rated day${node.count === 1 ? '' : 's'}.</p></div>
      ${metricBlock('Mood', node.mood)}
      ${metricBlock('Energy', node.energy)}
      <section class="inspector-section"><h4>Mood-day pattern</h4>${moodRanges}</section>
      <section class="inspector-section"><h4>Often logged alongside</h4>${coTags}</section>
      <p class="inspector-caveat">This is a pattern in your own logs, not proof that the tag caused a mood or energy change. Keep tracking to see if it repeats.</p>`;
  }

  formatAverage(value) {
    return value === null ? '—' : `${Math.round(value * 10) / 10}/10`;
  }

  formatDelta(value) {
    if (value === null) return '—';
    const rounded = Math.round(value * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
  }
}

window.personalCausalGraph = new PersonalCausalGraph();
