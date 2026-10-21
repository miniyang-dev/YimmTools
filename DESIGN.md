---
name: YimmTool
description: 像一份編排用心的技術日報——暖紙、墨黑、一抹朱紅，資料不離開你的瀏覽器。
colors:
  paper: "#f1ede4"
  paper-sunken: "#e8e3d7"
  field: "#faf8f3"
  ink: "#1b1a17"
  ink-secondary: "#57534a"
  hairline: "#cdc6b6"
  vermilion: "#b02a1b"
  on-vermilion: "#f8f4ea"
  proof-green: "#2c6a3f"
  caution-amber: "#8a5a00"
  night-paper: "#15171b"
  night-paper-sunken: "#1d2025"
  night-field: "#1a1d22"
  night-ink: "#e9e5da"
  night-ink-secondary: "#a39f93"
  night-hairline: "#353941"
  night-vermilion: "#ec7a67"
typography:
  display:
    fontFamily: "Source Serif 4 Variable, Noto Serif TC Variable, Songti TC, Georgia, serif"
    fontSize: "clamp(1.75rem, 3.4vw, 2.4rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Source Serif 4 Variable, Noto Serif TC Variable, Songti TC, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Source Serif 4 Variable, Noto Serif TC Variable, Songti TC, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "system-ui, Segoe UI, Noto Sans TC, PingFang TC, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  readout:
    fontFamily: "JetBrains Mono Variable, ui-monospace, Consolas, monospace"
    fontSize: "clamp(2.4rem, 8vw, 3.75rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.06em"
rounded:
  none: "0"
spacing:
  xs: "6px"
  sm: "10px"
  md: "18px"
  lg: "36px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.on-vermilion}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "40px"
  index-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
---

# Design System: YimmTool

## Overview

**Creative North Star: "The Daily Edition"**

YimmTool 是一份每天都會翻開的技術日報。淺色是日報（暖紙、墨黑），深色是夜報（同一版面，換成夜間印刷）。版面靠規線、字級與留白建立秩序，而不是靠卡片、陰影或漸層；一頁只有一個重點色，用在「現在正在發生的事」——目前頁面、倒數、被聚焦的欄位。

氣質是安靜、精準、有分量。工具頁沒有行銷語、沒有彈窗；讀數用等寬大字，像報紙上的數據欄。五種語系（繁中、英、簡中、西、日）共用同一套版面，CJK 與拉丁字母混排時以襯線字體統一語氣。

**Key Characteristics:**
- 規線取代容器：雙線頁眉、細線分隔、方正輸入框，沒有圓角卡片。
- 單一朱紅強調色，面積永遠很小。
- 襯線為聲音、無襯線為操作、等寬為資料。
- 扁平：深度只靠規線與底色階，沒有陰影。

## Colors

暖白紙、墨黑與單一朱紅；夜報將同一組角色映射到深藍黑底與提亮的朱紅。

### Primary
- **朱紅 Vermilion** (#b02a1b；夜報 #ec7a67)：只用於當下狀態——TOTP 倒數條、焦點外框、選取反白、按鈕 hover、錯誤邊框。任何一個畫面上的面積通常不到 5%。

### Neutral
- **日報紙 Paper** (#f1ede4；夜報 #15171b)：頁面底色。
- **下沉紙 Paper Sunken** (#e8e3d7；夜報 #1d2025)：輸出區、hover 列、行內程式碼底。
- **欄位白 Field** (#faf8f3；夜報 #1a1d22)：輸入框底色，比頁面略亮，表示可輸入。
- **墨 Ink** (#1b1a17；夜報 #e9e5da)：主文字、規線、主要按鈕底。
- **次墨 Ink Secondary** (#57534a；夜報 #a39f93)：說明、提示、欄位標註。
- **髮絲線 Hairline** (#cdc6b6；夜報 #353941)：列表分隔、表格列線。
- **印證綠 Proof Green** (#2c6a3f) 與 **警示琥珀 Caution Amber** (#8a5a00)：僅用於「格式正確」「注意」這類狀態訊息，淡底加 1px 同色邊框。

### Named Rules
**The One Vermilion Rule.** 朱紅只標記「現在」。裝飾、分類、標題都不准用它。
**The Two Editions Rule.** 日報與夜報是同一版面的兩個印次：每個顏色角色都有對應，任何新元件兩種都要驗。

## Typography

**Display / Body Font:** Source Serif 4 Variable（拉丁）＋ Noto Serif TC / SC / JP Variable（依語系載入）
**UI Label Font:** 系統無襯線（system-ui、微軟正黑、PingFang）
**Data Font:** JetBrains Mono Variable

**Character:** 襯線帶出刊物感，CJK 宋體與拉丁襯線在同一行並排不突兀；操作用的標籤改用系統無襯線，小字也清楚；密鑰、JSON、雜湊用等寬，並開啟 tabular-nums。

### Hierarchy
- **Display** (600, clamp(1.75rem, 3.4vw, 2.4rem), 1.2)：每個工具頁的標題；首頁標題更大（至 3.1rem）。
- **Headline** (600, 1.125rem, 1.3)：區段小標，底部一條墨色細線。
- **Body** (400, 1rem, 1.65)：說明文字，行寬上限約 66ch。
- **Label** (500, 0.8125rem, +0.01em)：欄位標籤與按鈕文字。
- **Readout** (500, clamp(2.4rem, 8vw, 3.75rem), 字距 0.06em)：TOTP 驗證碼、IP 這類主角數據。

### Named Rules
**The Three Voices Rule.** 襯線說話、無襯線操作、等寬記數據；不混用，也不再加第四種字體。

## Layout

固定左欄目錄（252px，貼頂可捲動）＋主欄（工具內容最大 780px）；整體最大寬度 1280px、置中。目錄依群組（圖片、資料、安全、文字與時間、網路）分段，每段小標下一條髮絲線；項目前的編號是目錄頁碼（01–14），固定不隨篩選改變。

主欄節奏：標題 → 一句說明 → 徽章（本機運算／需連線伺服器）→ 一條墨線 → 工具本體，區塊間距 18px，區段標題前加大間距。900px 以下目錄收成頂部「目錄」按鈕展開，兩欄表單改為單欄。

## Elevation & Depth

完全扁平，沒有任何陰影、模糊或玻璃效果。層次靠三件事：規線粗細（1px 髮絲、1px 墨線、雙線頁眉）、底色階（紙／下沉紙／欄位白）、以及反白（目前頁面與已按下的按鈕為墨底紙字）。

### Named Rules
**The Flat-As-Print Rule.** 像印刷品：想強調就加規線或反白，不要加陰影。

## Shapes

所有元件直角（border-radius 0）；輸入框與按鈕用 1px 墨色實線框。拖放區用 1px 虛線框。QR Code 放在白底方塊上以確保掃描對比。沒有圓角、藥丸形或不對稱剪裁。

## Components

### Buttons
- **Shape:** 直角、高 40px（小型 32px）、1px 墨色框。
- **Primary:** 墨底紙字，padding 0 16px；hover 轉朱紅底。
- **Ghost:** 透明底墨字；hover 為下沉紙底。已選取（aria-pressed）為墨底紙字。
- **Segmented:** 並排按鈕共用邊框，已選為反白。

### Inputs / Fields
- **Style:** 欄位白底、1px 墨色框、直角；資料欄位使用等寬字。
- **Focus:** 2px 朱紅外框、offset 2px；插入符號也是朱紅。
- **Error:** 下方出現淡朱紅底＋1px 朱紅框的訊息，不改變欄位邊框。

### Navigation
- 左欄目錄：群組小標（大寫小字、髮絲底線）＋編號＋名稱；目前頁面為墨底紙字。頂部搜尋（⌘K／Ctrl+K 聚焦，Enter 前往第一筆）。語言下拉與主題切換（跟隨系統／日報／夜報）在頁眉右側。

### Readout
- TOTP 驗證碼與 IP 以等寬大字呈現，上下各一條墨線；下方 3px 倒數條（朱紅）隨時間線性縮短。

### Notices
- 一般／成功／警示／錯誤四種：淡底（目前色 9–10% 混入紙色）＋1px 同色邊框；沒有粗側邊條。

## Do's and Don'ts

### Do:
- **Do** 用規線與底色階建立層次；重點用反白。
- **Do** 讓朱紅只出現在「當下」的訊號上，且面積很小。
- **Do** 每個新元件在日報、夜報、五種語系下各看一次。
- **Do** 所有資料欄位用等寬字並開啟 tabular-nums。
- **Do** 在會讓資料離開瀏覽器的工具頁標示「需連線伺服器」。

### Don't:
- **Don't** 使用卡片、圓角、陰影、玻璃或漸層。
- **Don't** 在標題上方加小標籤（kicker），或用編號裝飾區段；編號只作目錄頁碼。
- **Don't** 把朱紅用在裝飾、分類或大面積背景。
- **Don't** 加入彈窗、橫幅、行銷文案或未經證實的用量、評價。
- **Don't** 用 `border-left` 粗色條標示訊息。
