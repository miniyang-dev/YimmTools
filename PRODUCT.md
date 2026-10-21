# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Python（FastAPI）＋ React（Vite + TypeScript）。使用者指定。多數工具在瀏覽器內運算；需要網路連線的工具由 FastAPI 提供。

## Users

懂一點技術、日常會用小工具處理資料的人：工程師、維運、設計師、一般辦公使用者。主要使用者在台灣（繁體中文），次要為英文、簡體中文、西班牙文、日文使用者。典型情境：手邊有一段密鑰、JSON、JWT 或網址，想立刻得到結果，用完就走。

## Product Purpose

YimmTool 是一個免註冊、零安裝的線上小工具站：貼上資料就得到結果。核心承諾是「資料留在你的瀏覽器」——能在本機完成的運算一律不上傳；必須由伺服器完成的（網站環境偵測）明確標示。成功 = 使用者一眼找到工具、30 秒內完成任務、信任它不會外洩資料。

## Positioning

同類工具站多半滿版廣告、彈窗與假按鈕，且不說明資料去向。YimmTool 以「安靜、精準、資料不離開瀏覽器」為差異，介面像一份編排用心的技術刊物，而不是廣告充斥的工具農場。

## Operating Context

使用者常在工作中途開啟，貼上敏感內容（2FA 密鑰、JWT、設定檔）。需要快速、可鍵盤操作、深淺色兩種環境都清楚可讀。

## Capabilities and Constraints

共 14 項工具（PDF 不在範圍）：
圖片壓縮／轉換、JSON、YAML／CSV／JSON 互轉、Base64／URL 編解碼、JWT 解碼、QR Code 產生／解碼、TOTP 驗證碼、密碼與 UUID、Hash／HMAC、時間戳與 Cron、正則與 Diff、Markdown 預覽、URL＋User-Agent 解析、網站環境偵測（CDN／WAF／雲端）。
- 語系五種：繁體中文（預設）、English、简体中文、Español、日本語。不含 RTL。
- 深色與淺色主題，預設跟隨系統。
- 後端工具只做公開資訊的被動查詢；必須防 SSRF（拒絕私有／迴環／link-local／metadata 位址、釘住解析 IP、逐跳檢查重新導向、限流、逾時、大小上限）。
- 不提供「代理伺服器連通測試」與「我的 IP／代理偵測」（使用者已移除）。

## Brand Commitments

名稱 YimmTool。使用者明確選定視覺方向「01 報紙編輯」：暖紙感底色、墨黑字、單一紅色強調、襯線字體、雙線頁眉、左側編號目錄、大尺寸讀數。要求「有質感、不要 AI 風」。

## Evidence on Hand

無真實使用者數據、客戶或評價；介面中不得捏造用量、評分或背書。

## Product Principles

1. 資料留在瀏覽器；離開瀏覽器的功能必須明講。
2. 先給結果，再給說明；工具頁沒有廣告、彈窗與行銷語。
3. 每個工具只做一件事，把它做到精準。
4. 鍵盤可達、深淺色與五語系同等講究。

## Accessibility & Inclusion

文字對比 ≥ 4.5:1、完整鍵盤操作與可見焦點、尊重 prefers-reduced-motion 與 prefers-color-scheme。CJK 與拉丁字母混排需調校字體與行高。
