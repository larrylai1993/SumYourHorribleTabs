// ========================================
// Sum Your Horrible Tabs — Popup UI
// All tab operations delegated to background.js service worker
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  // --- DOM Elements ---
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const modelSelect = document.getElementById('modelSelect');
  const organizeBtn = document.getElementById('organizeBtn');
  const keepGroupsToggle = document.getElementById('keepGroups');
  const groupListDiv = document.getElementById('groupList');
  const groupActions = document.getElementById('groupActions');
  const selectAllGroupsBtn = document.getElementById('selectAllGroupsBtn');
  const ungroupSelectedBtn = document.getElementById('ungroupSelectedBtn');
  const saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
  const snapshotList = document.getElementById('snapshotList');
  const removeDupsBtn = document.getElementById('removeDupsBtn');
  const dupList = document.getElementById('dupList');
  const dupBadge = document.getElementById('dupBadge');
  const statusDiv = document.getElementById('status');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // Color mapping for Chrome group colors
  const COLOR_MAP = {
    grey: '#5F6368', blue: '#1A73E8', red: '#D93025',
    yellow: '#F9AB00', green: '#188038', pink: '#E52592',
    purple: '#A142F4', cyan: '#007B83', orange: '#E8710A'
  };

  // --- Init ---
  let savedKey = '';
  const data = await chrome.storage.local.get(['geminiKey', 'selectedModel']);
  if (data.geminiKey) {
    apiKeyInput.value = data.geminiKey;
    savedKey = data.geminiKey;
    organizeBtn.disabled = false;
    saveKeyBtn.disabled = true;
    fetchModels(data.geminiKey, data.selectedModel);
  } else {
    settingsPanel.classList.add('show');
    saveKeyBtn.disabled = true;
  }

  // --- Settings ---
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('show');
  });

  // --- Dark Mode ---
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const sunPath = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  const moonPath = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.innerHTML = theme === 'dark' ? sunPath : moonPath;
  }

  // Restore saved theme
  const themeData = await chrome.storage.local.get('theme');
  if (themeData.theme) {
    applyTheme(themeData.theme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ theme: next });
  });

  let savedModel = data.selectedModel || '';

  function checkDirty() {
    const keyDirty = apiKeyInput.value.trim() !== '' && apiKeyInput.value.trim() !== savedKey;
    const modelDirty = modelSelect.value !== '' && modelSelect.value !== savedModel;
    saveKeyBtn.disabled = !(keyDirty || modelDirty);
  }

  apiKeyInput.addEventListener('input', checkDirty);
  modelSelect.addEventListener('change', checkDirty);

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    const model = modelSelect.value;
    const keyChanged = key !== savedKey;
    savedKey = key;
    savedModel = model;
    saveKeyBtn.disabled = true;
    chrome.storage.local.set({ geminiKey: key, selectedModel: model }, () => {
      const originalText = saveKeyBtn.textContent;
      saveKeyBtn.textContent = '✓ 已儲存';
      saveKeyBtn.style.background = '#3d8c6f';
      setStatus('設定已儲存', 'success');
      setTimeout(() => {
        saveKeyBtn.textContent = originalText;
        saveKeyBtn.style.background = '';
      }, 1500);

      organizeBtn.disabled = false;
      if (keyChanged) fetchModels(key, model);
    });
  });

  // --- Fetch Available Models ---
  async function fetchModels(apiKey, restoreModel = null) {
    const hadOptions = modelSelect.options.length > 0 && modelSelect.value;
    modelSelect.disabled = true;
    modelSelect.style.opacity = '0.5';

    if (!hadOptions) {
      modelSelect.innerHTML = '<option value="">載入中...</option>';
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const models = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">沒有可用的模型</option>';
        setStatus('此 Key 沒有可用的模型', 'error');
        return;
      }

      modelSelect.innerHTML = models.map(m => {
        const modelId = m.name.replace('models/', '');
        return `<option value="${modelId}">${m.displayName}</option>`;
      }).join('');

      if (restoreModel && [...modelSelect.options].some(o => o.value === restoreModel)) {
        modelSelect.value = restoreModel;
      } else {
        const preferred = [...modelSelect.options].find(o => o.value.includes('2.5-flash'));
        if (preferred) modelSelect.value = preferred.value;
        chrome.storage.local.set({ selectedModel: modelSelect.value });
      }

      setStatus(`已載入 ${models.length} 個可用模型`, 'success');

    } catch (e) {
      console.error('Failed to fetch models:', e);
      setStatus(`API Key 無效 — ${e.message}`, 'error');
      modelSelect.innerHTML = '<option value="">API Key 錯誤</option>';
      organizeBtn.disabled = true;
    } finally {
      modelSelect.disabled = false;
      modelSelect.style.opacity = '1';
    }
  }

  // --- Tab Switching ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      // No longer need to fetch on tab switch since we do it on load
    });
  });

  // --- Status Helper ---
  function setStatus(msg, type = '') {
    statusDiv.innerHTML = msg.replace(/\n/g, '<br>');
    statusDiv.className = 'status' + (type ? ` ${type}` : '');
  }

  // ============================================
  // 1. AI Tab Grouping — via service worker
  // ============================================
  organizeBtn.addEventListener('click', async () => {
    setStatus('AI 分析中…');
    organizeBtn.disabled = true;

    try {
      const stored = await chrome.storage.local.get(['geminiKey', 'selectedModel']);
      const win = await chrome.windows.getCurrent();

      const result = await chrome.runtime.sendMessage({
        action: 'organizeTab',
        windowId: win.id,
        keepGroups: keepGroupsToggle.checked,
        apiKey: stored.geminiKey,
        model: stored.selectedModel || modelSelect.value || 'gemini-2.5-flash'
      });

      if (result.error) {
        let msg = result.error;
        if (result.tokenInfo) msg += '\n' + result.tokenInfo;
        setStatus(msg, 'error');
      } else {
        let msg = `已整理 ${result.groupedCount} 個分頁`;
        if (result.tokenInfo) msg += '\n' + result.tokenInfo;
        setStatus(msg, 'success');
      }
    } catch (e) {
      console.error(e);
      setStatus(e.message, 'error');
    } finally {
      organizeBtn.disabled = false;
      scanGroups();
    }
  });

  // ============================================
  // 2. Group List + Selective Ungroup
  // ============================================
  scanGroups();
  scanDuplicates();

  async function scanGroups() {
    try {
      // Get window from the active tab (most reliable way)
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const windowId = activeTab.windowId;

      // Build group list from TABS (more reliable than tabGroups.query)
      const allTabs = await chrome.tabs.query({ windowId });
      const groupMap = new Map(); // groupId -> { tabCount }
      
      for (const tab of allTabs) {
        if (tab.groupId !== -1) {
          if (!groupMap.has(tab.groupId)) {
            groupMap.set(tab.groupId, { id: tab.groupId, tabCount: 0, title: '(未命名)', color: 'grey' });
          }
          groupMap.get(tab.groupId).tabCount++;
        }
      }

      // Try to get title/color for each group
      for (const [gid, info] of groupMap) {
        try {
          const g = await chrome.tabGroups.get(gid);
          info.title = g.title || '(未命名)';
          info.color = g.color || 'grey';
        } catch { /* keep defaults */ }
      }

      const groups = [...groupMap.values()];
      
      if (groups.length === 0) {
        groupListDiv.innerHTML = '<div class="empty-state">沒有群組</div>';
        groupActions.style.display = 'none';
        return;
      }

      groupActions.style.display = 'flex';
      groupListDiv.innerHTML = groups.map(g => `
        <label class="group-item">
          <input type="checkbox" value="${g.id}" class="group-checkbox">
          <span class="group-color-dot" style="background:${COLOR_MAP[g.color] || '#5F6368'}"></span>
          <div class="group-item-info">
            <div class="group-item-name">${escapeHtml(g.title)}</div>
            <div class="group-item-count">${g.tabCount} 個分頁</div>
          </div>
        </label>
      `).join('');

      updateUngroupBtn();

      groupListDiv.querySelectorAll('.group-checkbox').forEach(cb => {
        cb.addEventListener('change', updateUngroupBtn);
      });
    } catch (e) {
      console.error('scanGroups error:', e);
      groupListDiv.innerHTML = '<div class="empty-state">讀取群組失敗</div>';
      groupActions.style.display = 'none';
    }
  }

  function updateUngroupBtn() {
    const checked = groupListDiv.querySelectorAll('.group-checkbox:checked');
    ungroupSelectedBtn.disabled = checked.length === 0;
    const total = groupListDiv.querySelectorAll('.group-checkbox').length;
    selectAllGroupsBtn.textContent = checked.length === total ? '取消全選' : '全選';
  }

  selectAllGroupsBtn.addEventListener('click', () => {
    const boxes = groupListDiv.querySelectorAll('.group-checkbox');
    const allChecked = [...boxes].every(b => b.checked);
    boxes.forEach(b => b.checked = !allChecked);
    updateUngroupBtn();
  });

  ungroupSelectedBtn.addEventListener('click', async () => {
    const checkedIds = [...groupListDiv.querySelectorAll('.group-checkbox:checked')]
      .map(cb => parseInt(cb.value));
    if (checkedIds.length === 0) return;

    const win = await chrome.windows.getCurrent();
    const result = await chrome.runtime.sendMessage({
      action: 'ungroupSelected',
      windowId: win.id,
      groupIds: checkedIds
    });

    if (result.error) {
      setStatus(result.error, 'error');
    } else {
      setStatus(`已解除 ${result.count} 個分頁的群組`, 'success');
    }
    scanGroups();
  });

  // ============================================
  // 3. Snapshots
  // ============================================
  renderSnapshots();

  saveSnapshotBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get('snapshots');
    const snapshots = stored.snapshots || [];

    if (snapshots.length >= 5) {
      setStatus('最多只能儲存 5 個快照，請先刪除', 'error');
      return;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
    const validTabs = tabs.filter(t => {
      try {
        const url = new URL(t.url);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch { return false; }
    });

    if (validTabs.length === 0) {
      setStatus('沒有可儲存的分頁', 'error');
      return;
    }

    const groupInfo = {};
    for (const tab of validTabs) {
      if (tab.groupId !== -1) {
        try {
          const group = await chrome.tabGroups.get(tab.groupId);
          groupInfo[tab.groupId] = { title: group.title, color: group.color };
        } catch { /* ignore */ }
      }
    }

    const snapshot = {
      id: Date.now(),
      date: new Date().toLocaleString('zh-TW'),
      tabCount: validTabs.length,
      tabs: validTabs.map(t => ({
        url: t.url,
        title: t.title,
        groupId: t.groupId
      })),
      groups: groupInfo
    };

    snapshots.push(snapshot);
    await chrome.storage.local.set({ snapshots });
    setStatus(`快照已儲存（${validTabs.length} 個分頁）`, 'success');
    renderSnapshots();
  });

  async function renderSnapshots() {
    const stored = await chrome.storage.local.get('snapshots');
    const snapshots = stored.snapshots || [];

    if (snapshots.length === 0) {
      snapshotList.innerHTML = '<div class="empty-state">尚無快照</div>';
      return;
    }

    snapshotList.innerHTML = snapshots.map((s, i) => `
      <div class="snapshot-item">
        <div class="snapshot-info">
          <div class="snapshot-name">快照 #${i + 1} (${s.tabCount} 分頁)</div>
          <div class="snapshot-meta">${s.date}</div>
        </div>
        <div class="snapshot-actions">
          <button class="btn-restore" data-id="${s.id}">Restore</button>
          <button class="btn-delete" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `).join('');

    snapshotList.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const stored = await chrome.storage.local.get('snapshots');
        const snapshot = (stored.snapshots || []).find(s => s.id === id);
        if (!snapshot) return;

        setStatus('正在還原快照...');
        const groupMap = {};

        for (const tab of snapshot.tabs) {
          try {
            const created = await chrome.tabs.create({ url: tab.url, active: false });
            if (tab.groupId !== -1 && snapshot.groups[tab.groupId]) {
              const gInfo = snapshot.groups[tab.groupId];
              if (!groupMap[tab.groupId]) {
                const newGroupId = await chrome.tabs.group({ tabIds: [created.id] });
                await chrome.tabGroups.update(newGroupId, { title: gInfo.title, color: gInfo.color });
                groupMap[tab.groupId] = newGroupId;
              } else {
                await chrome.tabs.group({ tabIds: [created.id], groupId: groupMap[tab.groupId] });
              }
            }
          } catch (e) { console.warn('Restore tab failed:', e); }
        }

        setStatus(`已還原 ${snapshot.tabCount} 個分頁`, 'success');
      });
    });

    snapshotList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const stored = await chrome.storage.local.get('snapshots');
        const snapshots = (stored.snapshots || []).filter(s => s.id !== id);
        await chrome.storage.local.set({ snapshots });
        setStatus('快照已刪除', '');
        renderSnapshots();
      });
    });
  }

  // ============================================
  // 4. Deduplicate Tabs
  // ============================================
  async function scanDuplicates() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const urlMap = new Map();

    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        const normalized = url.origin + url.pathname.replace(/\/$/, '') + url.search;
        if (!urlMap.has(normalized)) urlMap.set(normalized, []);
        urlMap.get(normalized).push(tab);
      } catch { /* skip */ }
    }

    const duplicates = [];
    for (const [, tabs] of urlMap) {
      if (tabs.length > 1) {
        for (let i = 1; i < tabs.length; i++) duplicates.push(tabs[i]);
      }
    }

    if (duplicates.length > 0) {
      dupBadge.textContent = duplicates.length;
      dupBadge.style.display = 'inline';
    } else {
      dupBadge.style.display = 'none';
    }

    if (duplicates.length === 0) {
      dupList.innerHTML = '<div class="empty-state">✅ 沒有重複的分頁！</div>';
      removeDupsBtn.style.display = 'none';
      return;
    }

    removeDupsBtn.style.display = '';
    dupList.innerHTML = duplicates.map(t => `
      <div class="dup-item" data-tab-id="${t.id}">
        <div class="dup-info">
          <div class="dup-title">${escapeHtml(t.title || '(無標題)')}</div>
          <div class="dup-url">${escapeHtml(new URL(t.url).hostname + new URL(t.url).pathname)}</div>
        </div>
        <button class="dup-close" data-tab-id="${t.id}" title="關閉此分頁">✕</button>
      </div>
    `).join('');

    dupList.querySelectorAll('.dup-close').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tabId = parseInt(btn.dataset.tabId);
        try {
          await chrome.tabs.remove(tabId);
          btn.closest('.dup-item').remove();
          scanDuplicates();
          setStatus('已關閉重複分頁', 'success');
        } catch (e) {
          setStatus(e.message, 'error');
        }
      });
    });
  }

  // Remove all duplicates — via service worker
  removeDupsBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const urlMap = new Map();
    const toRemove = [];

    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        const normalized = url.origin + url.pathname.replace(/\/$/, '') + url.search;
        if (urlMap.has(normalized)) {
          toRemove.push(tab.id);
        } else {
          urlMap.set(normalized, tab);
        }
      } catch { /* skip */ }
    }

    if (toRemove.length === 0) {
      setStatus('沒有重複分頁', '');
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'removeDuplicates',
      tabIds: toRemove
    });

    if (result.error) {
      setStatus(result.error, 'error');
    } else {
      setStatus(`已關閉 ${result.count} 個重複分頁`, 'success');
      scanDuplicates();
    }
  });

  // --- Helpers ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
