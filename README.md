# Sum Your Horrible Tabs

一個 Chrome 擴充功能，使用 Gemini API 自動整理你混亂的瀏覽器分頁。

## 功能

### AI 智慧分組

透過 Gemini Flash 模型分析分頁的標題與網域，自動將相關分頁歸類為 3-6 個邏輯群組（例如：工作、開發、購物、影音）。支援選擇不同的 Gemini 模型，並顯示 Token 使用量。

### 分頁快照

儲存當前視窗的所有分頁狀態（包含群組資訊），最多可保存 5 個快照。還原時會重建原本的分頁群組結構。

### 重複分頁檢測

自動掃描並標記重複的分頁，可單獨關閉或一鍵移除所有重複項。也可透過右鍵選單快速清除重複分頁。

### 群組管理

顯示目前視窗中所有已展開的群組，支援多選並批次解除群組。

### 深色模式

支援手動切換深色/淺色主題，設定會自動儲存。

## 安裝

1. 下載或 clone 此專案
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角的「開發人員模式」
4. 點擊「載入未封裝項目」，選擇此專案資料夾

## 使用方式

1. 點擊擴充功能圖示開啟面板
2. 首次使用需設定 Gemini API Key（可在 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得）
3. 點擊「AI 智慧分組」開始整理分頁

## 權限說明

- `tabs`: 存取分頁資訊（標題、URL）
- `tabGroups`: 建立與管理分頁群組
- `storage`: 儲存 API Key、快照、設定
- `contextMenus`: 提供右鍵選單功能

## 技術細節

- Manifest V3
- Service Worker 架構（背景腳本）
- 使用 Gemini API 進行分頁分類
- 純 JavaScript，無框架依賴

## 授權

MIT License
