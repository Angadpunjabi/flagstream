# FlagStream: Low-Latency Distributed Feature Flag Service

Flags are evaluated from an in-memory cache inside each node (no network call), and changes are pushed to all nodes over Server-Sent Events (SSE), with ETag polling as a fallback.

## Run locally

```bash
npm install
npm start                 # Terminal 1 -> http://localhost:3000 (dashboard)
npm run demo              # Terminal 2 -> 3 nodes, shows propagation + consistent rollout
npm run bench             # Terminal 2 -> local vs remote latency
```

Default admin key (local only): `demo-admin-key`

## API

| Method | Path | Purpose |
|---|---|---|
| GET | /health | service status |
| GET | /flags | all flags (ETag, 304 when unchanged) |
| POST | /evaluate/:key | evaluate a flag for `{ "userId": "..." }` |
| PUT | /flags/:key | create/update a flag (header `x-admin-key`) |
| DELETE | /flags/:key | delete a flag (header `x-admin-key`) |
| GET | /stream | SSE push channel |

## Deploy on Render (recommended)

1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "FlagStream"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/flagstream.git
   git push -u origin main
   ```
2. Go to https://render.com, sign in with GitHub, click **New +** then **Web Service**, and pick the repo.
3. Settings: Runtime `Node`, Build Command `npm install`, Start Command `npm start`, Instance Type `Free`.
4. Environment variables: `ADMIN_KEY` = your own secret, `NODE_VERSION` = `20`.
5. Click **Create Web Service**. Your app will be live at `https://<name>.onrender.com`.
6. Verify:
   ```bash
   curl https://<name>.onrender.com/health
   BASE_URL=https://<name>.onrender.com ADMIN_KEY=your-secret npm run demo
   ```

(Or use `render.yaml` with **New + > Blueprint**.)

## Optional: dashboard on Netlify

1. In `public/index.html` set `window.API_BASE = 'https://<name>.onrender.com';`
2. Go to https://app.netlify.com/drop and drag the `public` folder in.

Netlify only hosts the static dashboard. The API must run on Render because it needs a long-running server for SSE and in-memory state.

## Notes for the demo

- Render free services sleep when idle. Open the URL a few minutes before presenting.
- Flags edited on the free tier reset to `flags.json` when the service restarts.
