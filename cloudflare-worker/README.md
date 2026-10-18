# AVMusic - Cloudflare Worker YouTube Stream Proxy

This Cloudflare Worker serves as a **100% free, unblocked reverse proxy** for YouTube audio streaming.

## Why This Works
1. **No Datacenter IP Blocks**: Cloudflare Workers run on Cloudflare's global Anycast edge network with commercial peering, not AWS/GCP datacenter IPs.
2. **Zero-Decipher Mobile InnerTube**: Mimics the Android YouTube app client (`20.10.38`), which returns direct, unciphered 128kbps AAC/M4A streams (`itag 140`).
3. **HTTP Range Support**: Passes byte-range requests directly to YouTube's CDN so iOS Safari and Android can seek and buffer audio in the background without interruptions.
4. **100% Free**: 100,000 requests per day on Cloudflare's free tier (no credit card required).

---

## 2-Minute Deployment Steps

### Step 1: Create the Worker
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and log in (or sign up for free).
2. In the left sidebar, click **Compute (Workers) > Workers & Pages** (or **Workers & Pages**).
3. Click **Create** $\rightarrow$ **Create Worker** (or **Create Application**).
4. Give it a name (e.g., `avmusic-streamer`) and click **Deploy**.

### Step 2: Paste the Script
1. On the worker summary page, click **Edit code** (or **Quick edit**).
2. Delete whatever sample code is in `worker.js`.
3. Copy the entire contents of [`cloudflare-worker/worker.js`](./worker.js) and paste it into the editor.
4. Click **Deploy** (or **Save and Deploy**).

### Step 3: Test the Worker
Visit your worker URL in your browser:
```text
https://<your-worker-name>.<your-subdomain>.workers.dev/
```
You should see:
```json
{
  "status": "ok",
  "service": "AVMusic YouTube Stream Proxy",
  "message": "Cloudflare Worker is running and ready to stream YouTube audio"
}
```

Test resolving a song (e.g., Despacito `kJQP7kiw5Fk`):
```text
https://<your-worker-name>.<your-subdomain>.workers.dev/resolve?v=kJQP7kiw5Fk
```

### Step 4: Add to Vercel
1. Go to your [Vercel Dashboard](https://vercel.com) $\rightarrow$ open your **`imusic` / `avmusic`** project.
2. Go to **Settings** $\rightarrow$ **Environment Variables**.
3. Add a new variable:
   - **Key**: `STREAM_SERVER_URL`
   - **Value**: `https://<your-worker-name>.<your-subdomain>.workers.dev` (replace with your worker URL)
4. Click **Save**.
5. Go to **Deployments** $\rightarrow$ click the three dots (`...`) on the latest deployment $\rightarrow$ click **Redeploy**.
