// ========================================
// Sum Your Horrible Tabs — Background Service Worker
// Handles all tab operations so they don't die when popup closes
// ========================================

const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

// ========================================
// Group Metadata Persistence
// ========================================

async function saveGroupMeta(groupId, title, color) {
  const { groupMeta = {} } = await chrome.storage.local.get('groupMeta');
  groupMeta[groupId] = { title, color, updatedAt: Date.now() };
  await chrome.storage.local.set({ groupMeta });
}

async function removeGroupMeta(groupId) {
  const { groupMeta = {} } = await chrome.storage.local.get('groupMeta');
  delete groupMeta[groupId];
  await chrome.storage.local.set({ groupMeta });
}

async function restoreAllGroupMeta() {
  const { groupMeta = {} } = await chrome.storage.local.get('groupMeta');
  if (Object.keys(groupMeta).length === 0) return;

  // Get all current groups across all windows
  const allGroups = await chrome.tabGroups.query({});
  const existingGroupIds = new Set(allGroups.map(g => g.id));

  // Clean up stale entries and restore missing metadata
  for (const [groupIdStr, meta] of Object.entries(groupMeta)) {
    const groupId = parseInt(groupIdStr);

    if (!existingGroupIds.has(groupId)) {
      // Group no longer exists, remove from storage
      delete groupMeta[groupIdStr];
      continue;
    }

    // Check if the group needs restoration
    try {
      const group = await chrome.tabGroups.get(groupId);
      if (!group.title || group.title !== meta.title || group.color !== meta.color) {
        await chrome.tabGroups.update(groupId, { title: meta.title, color: meta.color });
      }
    } catch {
      // Group doesn't exist anymore
      delete groupMeta[groupIdStr];
    }
  }

  await chrome.storage.local.set({ groupMeta });
}

// Restore group metadata on Chrome startup
chrome.runtime.onStartup.addListener(() => {
  restoreAllGroupMeta();
});

// Clean up metadata when a group is removed
chrome.tabGroups.onRemoved.addListener((group) => {
  removeGroupMeta(group.id);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'organizeTab') {
    handleOrganize(message).then(sendResponse);
    return true;
  }
  if (message.action === 'ungroupAll') {
    handleUngroupAll(message.windowId).then(sendResponse);
    return true;
  }
  if (message.action === 'ungroupSelected') {
    handleUngroupSelected(message.groupIds, message.windowId).then(sendResponse);
    return true;
  }
  if (message.action === 'removeDuplicates') {
    handleRemoveDuplicates(message.tabIds).then(sendResponse);
    return true;
  }
  if (message.action === 'sortTabs') {
    handleSortTabs(message.by, message.windowId).then(sendResponse);
    return true;
  }
  if (message.action === 'updateGroup') {
    handleUpdateGroup(message.groupId, message.title, message.color).then(sendResponse);
    return true;
  }
  if (message.action === 'getGroupMeta') {
    chrome.storage.local.get('groupMeta').then(({ groupMeta = {} }) => sendResponse(groupMeta));
    return true;
  }
});

async function handleOrganize({ keepGroups, apiKey, model, windowId }) {
  try {
    const tabs = await chrome.tabs.query({ windowId, pinned: false });

    const validTabs = tabs.filter(t => {
      try {
        const url = new URL(t.url);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch { return false; }
    });

    if (validTabs.length < 2) {
      return { error: '需要至少 2 個網頁分頁' };
    }

    // Ungroup existing if toggle is off
    if (!keepGroups) {
      try {
        const groupedTabIds = validTabs.filter(t => t.groupId !== -1).map(t => t.id);
        if (groupedTabIds.length > 0) {
          await chrome.tabs.ungroup(groupedTabIds);
        }
      } catch (e) { /* ignore */ }
    }

    const tabData = validTabs.map(t => ({
      id: t.id,
      title: t.title || '(無標題)',
      url: new URL(t.url).hostname
    }));

    // Call Gemini API
    const prompt = `
      你是一個瀏覽器分頁整理助手。根據以下分頁資訊，將它們歸類為 3-6 個邏輯群組。
      規則：
      1. 群組名稱要簡短中文 (如: "工作", "開發", "購物", "影音")
      2. "新分頁" 或空白頁可忽略
      3. 只回傳純 JSON，不要 Markdown，格式：
      [{ "groupName": "群組名", "tabIds": [123, 456] }]

      分頁資料：
      ${JSON.stringify(tabData)}
    `;

    const selectedModel = model || 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const result = await response.json();

    // Extract token usage
    const usage = result.usageMetadata;
    let tokenInfo = '';
    if (usage) {
      const parts = [];
      if (usage.promptTokenCount) parts.push(`輸入: ${usage.promptTokenCount.toLocaleString()}`);
      if (usage.candidatesTokenCount) parts.push(`輸出: ${usage.candidatesTokenCount.toLocaleString()}`);
      if (usage.totalTokenCount) parts.push(`總計: ${usage.totalTokenCount.toLocaleString()}`);
      if (usage.thoughtsTokenCount) parts.push(`思考: ${usage.thoughtsTokenCount.toLocaleString()}`);
      if (parts.length > 0) tokenInfo = `Token 用量 → ${parts.join(' | ')}`;
    }

    if (result.error) return { error: result.error.message, tokenInfo };

    // Parse response (handle thinking model format)
    const responseParts = result.candidates[0].content.parts;
    let text = '';
    for (const part of responseParts) {
      if (part.text) text += part.text;
    }
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let groups;
    try {
      groups = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) groups = JSON.parse(match[0]);
      else return { error: 'AI 回應格式錯誤，請重試', tokenInfo };
    }

    // Execute Chrome Group API — this runs in service worker so it won't be killed
    const validTabIds = new Set(validTabs.map(t => t.id));
    let groupedCount = 0;
    let colorIdx = 0;

    // Phase 1: Create all groups and collect groupIds
    const createdGroups = [];

    for (const group of groups) {
      if (!group.tabIds || group.tabIds.length === 0) continue;
      const safeIds = group.tabIds.filter(id => validTabIds.has(id));
      if (safeIds.length === 0) continue;

      try {
        const groupId = await chrome.tabs.group({ tabIds: safeIds, createProperties: { windowId } });
        createdGroups.push({ groupId, name: group.groupName, tabCount: safeIds.length });
      } catch (e) {
        // Group creation failed, skip
      }
    }

    // Phase 2: Wait, then name all groups
    await new Promise(r => setTimeout(r, 500));

    for (const { groupId, name, tabCount } of createdGroups) {
      const targetColor = GROUP_COLORS[colorIdx % GROUP_COLORS.length];
      try {
        // Try up to 3 times with increasing delay
        for (let attempt = 0; attempt < 3; attempt++) {
          await chrome.tabGroups.update(groupId, { title: name, color: targetColor });
          await new Promise(r => setTimeout(r, 150));

          // Verify the update succeeded
          const verify = await chrome.tabGroups.get(groupId);
          if (verify.title === name && verify.color === targetColor) break;

          // If failed, wait longer before retry
          await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
        }

        // Persist metadata locally for restoration on restart
        await saveGroupMeta(groupId, name, targetColor);

        colorIdx++;
        groupedCount += tabCount;
      } catch (e) {
        // Group naming failed (possibly a Saved Tab Group)
      }
    }

    return { success: true, groupedCount, tokenInfo };

  } catch (e) {
    return { error: e.message };
  }
}

async function handleUngroupAll(windowId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const groupedIds = tabs.filter(t => t.groupId !== -1).map(t => t.id);
    if (groupedIds.length === 0) return { message: '沒有群組需要解除' };
    await chrome.tabs.ungroup(groupedIds);
    return { success: true, count: groupedIds.length };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleUngroupSelected(groupIds, windowId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const targetIds = tabs.filter(t => groupIds.includes(t.groupId)).map(t => t.id);
    if (targetIds.length === 0) return { message: '沒有需要解除的分頁' };
    await chrome.tabs.ungroup(targetIds);
    return { success: true, count: targetIds.length };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleRemoveDuplicates(tabIds) {
  try {
    if (!tabIds || tabIds.length === 0) return { message: '沒有重複分頁' };
    await chrome.tabs.remove(tabIds);
    return { success: true, count: tabIds.length };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleSortTabs(by, windowId) {
  try {
    const allTabs = await chrome.tabs.query({ windowId });
    const pinned = allTabs.filter(t => t.pinned);
    const unpinned = allTabs.filter(t => !t.pinned);

    const sorted = [...unpinned].sort((a, b) => {
      if (by === 'domain') {
        const domainA = (() => { try { return new URL(a.url).hostname; } catch { return ''; } })();
        const domainB = (() => { try { return new URL(b.url).hostname; } catch { return ''; } })();
        return domainA.localeCompare(domainB) || (a.title || '').localeCompare(b.title || '');
      }
      // default: by title
      return (a.title || '').localeCompare(b.title || '');
    });

    // Move tabs one by one, starting after pinned tabs
    const startIndex = pinned.length;
    for (let i = 0; i < sorted.length; i++) {
      await chrome.tabs.move(sorted[i].id, { index: startIndex + i });
    }

    return { success: true, count: sorted.length };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleUpdateGroup(groupId, title, color) {
  try {
    const updateProps = {};
    if (title !== undefined) updateProps.title = title;
    if (color !== undefined) updateProps.color = color;

    await chrome.tabGroups.update(groupId, updateProps);

    // Get current values and save to storage
    const group = await chrome.tabGroups.get(groupId);
    await saveGroupMeta(groupId, group.title, group.color);

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ========================================
// Context Menu: One-click clear duplicates
// ========================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'remove-duplicates',
    title: '一鍵清除重複分頁',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'remove-duplicates') {
    // 找出目前視窗中所有分頁
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const seenUrls = new Set();
    const dupIds = [];

    for (const t of tabs) {
      if (!t.url || t.url.startsWith('chrome://')) continue;
      
      const cleanUrl = t.url.split('#')[0].replace(/\/$/, "");
      
      if (seenUrls.has(cleanUrl)) {
        dupIds.push(t.id);
      } else {
        seenUrls.add(cleanUrl);
      }
    }

    if (dupIds.length > 0) {
      await chrome.tabs.remove(dupIds);
      // Optional: Show some kind of notification or badge if desired
    }
  }
});
