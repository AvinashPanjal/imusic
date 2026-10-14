# iMusic Stream Service (Free 24/7 Cloud Audio Streamer)

This microservice runs `yt-dlp` in a lightweight Docker container on **Render.com** (100% Free Tier).
It extracts raw `audio/mp4` streams with HTTP Range support, allowing the iMusic mobile web app on Vercel to play YouTube-exclusive music in native HTML5 `<audio>` with **100% continuous background playback and screen-off lock screen controls**.

---

## 🚀 3-Minute Free Setup on Render.com

### Step 1: Sign Up / Log in to Render
1. Go to [https://render.com](https://render.com).
2. Click **Sign In** and sign in with your GitHub account (`AvinashPanjal`).

---

### Step 2: Create New Web Service
1. In your Render Dashboard, click **New +** (top right) and choose **Web Service**.
2. Select **Build and deploy from a Git repository**, then click **Next**.
3. Choose your repository: `AvinashPanjal/imusic` (click **Connect**).

---

### Step 3: Configure the Web Service
Set the following settings:
- **Name**: `imusic-stream-service` (or any name you like)
- **Region**: Any (e.g. `Oregon (US West)` or `Frankfurt (EU Central)`)
- **Root Directory**: `stream-service`
- **Environment**: `Docker`
- **Plan**: Select **Free** ($0/month)

*(Alternatively, because `render.yaml` is included in this repository, Render can automatically configure these settings when you connect the repository!)*

Click **Deploy Web Service**.

---

### Step 4: Copy Your Service URL
Render will build the Docker container and start your service in about 1-2 minutes.
Once deployed, Render gives you a public URL at the top of the page, for example:
`https://imusic-stream-service.onrender.com`

You can test it in your browser:
`https://your-service-name.onrender.com/health` -> should return `{"status":"ok"}`.

---

### Step 5: Add the URL to Vercel
1. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Open your `imusic` project -> **Settings** -> **Environment Variables**.
3. Add a new variable:
   - **Key**: `STREAM_SERVER_URL`
   - **Value**: `https://your-service-name.onrender.com` (your Render URL from Step 4)
4. Click **Save**.
5. Go to **Deployments** in Vercel and click **Redeploy** on the latest deployment (or make any small commit to trigger a redeploy).

---

### 🎉 Done!
Now when you play ANY YouTube song on your phone at `https://imusic-two.vercel.app`:
- The audio streams through native HTML5 `<audio>`.
- The music will **NEVER pause** when you leave the app, switch to WhatsApp, or turn off your screen!
- Lock screen widget, scrub bar, and media controls will stay fully active 24/7!
- Zero home PC needed!
