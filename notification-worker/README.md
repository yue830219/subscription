# 訂閱付款通知 Worker

這是獨立的 Cloudflare Worker，不會讀取或修改既有加密備份。

## 部署

1. 安裝 Node.js，進入此資料夾後執行 `npm install`。
2. 執行 `npm run vapid`，保存輸出的 Public Key 與 Private Key。
3. 先執行 `npm run deploy` 建立獨立 Worker 與 Durable Object。
4. 依序執行：
   - `npx wrangler secret put VAPID_PUBLIC_KEY`
   - `npx wrangler secret put VAPID_PRIVATE_KEY`
   - `npx wrangler secret put VAPID_SUBJECT`（輸入 `mailto:你的信箱`）
5. 再執行一次 `npm run deploy`。

Worker 名稱預設為 `subscription-notifications`。部署後網址應為：

`https://subscription-notifications.<你的 workers.dev 子網域>.workers.dev`

若實際網址不同，請同步修改 `Sub/index.html` 內的 `NOTIFICATION_WORKER_URL`。

## 全程使用網頁部署

1. 將整個 `notification-worker` 資料夾上傳到 GitHub；不要上傳任何私鑰。
2. 在 Cloudflare Dashboard 進入 **Workers & Pages → Create application → Import a repository**。
3. 選擇 GitHub Repository，Root directory 填入 `Sub/notification-worker`。
4. Worker name 使用 `subscription-notifications`，Build command 留空，Deploy command 使用 `npx wrangler deploy`。
5. 部署完成後，進入 Worker 的 **Settings → Variables and Secrets**，新增三個加密 Secret：`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`。
6. 可在自己電腦開啟 `generate-vapid.html` 產生前兩個值；`VAPID_SUBJECT` 填入 `mailto:你的信箱`。
