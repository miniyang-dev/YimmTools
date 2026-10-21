# YimmTool

免註冊的線上小工具站，資料留在瀏覽器。14 項工具、5 種語系（繁中、English、简体中文、Español、日本語）、日報／夜報兩種主題。

- 前端：Vite + React + TypeScript（`frontend/`）
- 後端：FastAPI（`backend/`）。提供建置後的網站，以及一個需要伺服器的工具：網站環境偵測。
- 設計脈絡：`PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json`

## 工具

圖片壓縮／轉換 · JSON · YAML／CSV／JSON 互轉 · Base64／URL · QR Code · TOTP · 密碼與 UUID · Hash／HMAC · JWT · 時間戳與 Cron · 正則與 Diff · Markdown 預覽 · URL 與 User-Agent 解析 · 網站環境偵測（伺服器）

## 執行

預設埠 **8931**（8000、8765 常被其他專案占用）。

```bash
# 一次性安裝
cd backend && python -m venv .venv && ./.venv/Scripts/python -m pip install -r requirements.txt
cd ../frontend && npm install

# 建置前端並由 FastAPI 一起提供
cd frontend && npm run build
cd ../backend && ./.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8931
```

開發時前端可用 `npm run dev`（`/api` 會代理到 8931）。

改到後端程式後要重啟 uvicorn（沒有 hot reload）。

## 設定（環境變數）

| 變數 | 說明 |
| --- | --- |
| `YIMM_PROXY_HOPS` | 本站前面有幾層反向代理。設為 N 時，連線 IP 取 `X-Forwarded-For` 倒數第 N 個；預設 0（只信任直接連線的位址）。部署在 Cloudflare／Nginx 後面時一定要設，否則限流會把所有人當成同一個代理位址。 |
| `YIMM_DIST` | 前端建置輸出目錄，預設 `frontend/dist`。 |

### 容量設定（網站環境偵測）

這是唯一會用到伺服器資源的工具；其他 13 項在使用者瀏覽器內運算，不受這些設定影響。

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `YIMM_MAX_CONCURRENT` | 100 | 全站同時進行的查詢數。每次查詢約 1 秒、幾乎都在等網路，所以約等於每秒 100 次的上限。依主機的連線數與檔案描述符調整。 |
| `YIMM_QUEUE_WAIT` | 4 | 滿載時，多出來的查詢最多排隊等幾秒；超過才回 503 `busy`。短暫尖峰時使用者完全無感。 |
| `YIMM_MAX_WAITING` | 200 | 排隊區最多容納幾個；再多就立刻回 503，避免無限堆積。 |
| `YIMM_CACHE_TTL` | 60 | 相同網址的結果在記憶體保留幾秒（0 = 關閉）。熱門網站幾乎不占名額，也減少對外請求。 |
| `YIMM_CACHE_MAX` | 2000 | 快取最多幾筆（LRU）。 |
| `YIMM_INSPECT_PER_MINUTE` | 12 | 每個 IP 每分鐘能發起幾次「真的對外連線」的查詢。 |
| `YIMM_LIGHT_PER_MINUTE` | 120 | 每個 IP 每分鐘的輕量請求：被拒絕的網址、快取命中、加入別人已在進行的查詢（互不佔用上面的額度）。 |

行為細節：

- 同一個網址同時被很多人查，只會真的連線一次，其餘的人共用結果；其中一人離開頁面不會中斷大家等的那次查詢。
- 失敗的結果不會被快取。
- 前端遇到 503 `busy` 會顯示「排隊中」並自動重試最多 2 次，不需要使用者重按。
- 快取、限流都放在單一程序的記憶體。要開多個 worker／實例時，各自獨立計算；真正大流量時建議把限流與快取改放共用儲存（例如 Redis）。

## 後端安全設計（網站環境偵測）

- 只接受 `http`／`https`、連接埠 80／443；不接受帳密、`localhost`、內網網域後綴、十進位／十六進位 IP 寫法。
- DNS 解析後**每一個**答案都必須是公開位址（擋私有、迴環、link-local、雲端 metadata、IPv4-mapped IPv6、6to4／Teredo 等）。
- 連線釘住解析出的 IP（Host／SNI 帶原網域），重新導向逐跳重新驗證，最多 4 跳。
- 每次 GET 不讀內容；逾時 5 秒、整體 20 秒；每 IP 每分鐘 12 次真實查詢（無效網址、快取命中另計，不占額度）；全站併發有上限，超過先排隊。
- 回應含 CSP、`nosniff`、`no-referrer`；`/api/*` 不快取。

## 測試與品質檢查

```bash
# 後端：SSRF、指紋、API、限流、併發上限、ASN 解析（測試中禁止真實網路）
cd backend && ./.venv/Scripts/python -m pytest -q
cd backend && ./.venv/Scripts/python -m ruff check . && ./.venv/Scripts/python -m ruff format --check .

# 前端：型別、ESLint、Prettier、單元測試（RFC 6238 向量、精確 JSON、時區解析、語系完整性）
cd frontend && npm run check

# 端對端（Playwright）：建置後由 FastAPI 提供，用真實瀏覽器逐項操作 14 項工具與 5 種語系
cd frontend && npm run e2e
```

- E2E 預設用系統 Chrome（不需下載瀏覽器）；`E2E_CHANNEL=msedge` 改用 Edge，`E2E_CHANNEL=`（空）改用 Playwright 自帶 Chromium（先 `npx playwright install chromium`）。
- E2E 用 8932 埠，不會動到開發用的 8931。
- 連到真實網路的測試預設跳過：`E2E_LIVE=1 npx playwright test -g LIVE`。
- 檔案格式與規則：前端 Prettier＋ESLint（`npm run format`、`npm run lint`），後端 ruff（`ruff format`、`ruff check`）。

## 新增一個工具

每個工具是 `frontend/src/tools/<id>/` 一個資料夾，放進去就會自動出現在目錄、首頁、搜尋與路由，不需要改任何其他檔案：

| 檔案 | 內容 |
| --- | --- |
| `meta.json` | `id`（要等於資料夾名）、`group`（`image`／`data`／`security`／`text`／`net`）、`order`（目錄順序，從 1 連續不重複）、`server`（需要後端時為 `true`）、`strings`（各語系的 `name` 與 `desc`） |
| `index.tsx` | 工具介面，預設匯出一個 React 元件 |
| `strings.json` | 工具內部用到的文字（各語系鍵必須一致） |

只寫繁中（`zh-TW`）、`en`、`es`、`ja`，簡中執行 `npm run i18n:cn` 自動產生。`npm run check` 會檢查 id、順序、分組與五種語言是否齊全。

後端的辨識規則（網站環境偵測）是 `backend/app/signatures.py` 的資料表，加一個服務商就是加一列；比對邏輯在 `fingerprint.py`，`test_signatures.py` 會檢查表格格式。

## 語系

各工具的字串在 `frontend/src/tools/<tool>/strings.json`，共用字串在 `frontend/src/i18n/common.json`。
**簡體中文由繁體自動轉換**：只改 `zh-TW`，然後執行 `npm run i18n:cn`，不要手改 `zh-CN`。語系測試會檢查五種語言的鍵與 `{參數}` 是否一致。
