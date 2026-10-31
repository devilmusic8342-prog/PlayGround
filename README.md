# Nimbus — Android Cloud Phone

A focused, single-page virtual Android workspace. Nimbus wraps a live noVNC stream inside a Pixel-style phone frame with quick hardware controls, connection state and latency feedback.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, enter your VPS noVNC endpoint (for example `http://34.10.20.30:6080`), and press **Reconnect**. The endpoint is stored locally in the browser for the next visit. You can also prefill it with `?endpoint=http://YOUR_VPS_IP:6080`.

## Production build

```bash
npm run build
```

The static output is written to `dist/`.

## Notes

- The stream is embedded directly with an iframe, so the noVNC server must allow framing.
- HTTPS pages cannot embed an insecure `http://` stream because browsers block mixed content. Use an HTTPS noVNC tunnel when serving Nimbus over HTTPS.
- Quick controls provide the physical-device UI and immediate local feedback. Keyboard and navigation input ultimately depends on the noVNC deployment and its remote-control policy.

## Stack

- Vite
- Tailwind CSS
- Vanilla JavaScript

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/devilmusic8342-prog/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/devilmusic8342-prog/PlayGround)

- 🎮 [Open the project](https://omgithub.com/devilmusic8342-prog/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=devilmusic8342-prog%2FPlayGround).
- 💻 [Explore the source](https://github.com/devilmusic8342-prog/PlayGround).
- 🛠️ [Check build runs](https://github.com/devilmusic8342-prog/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/devilmusic8342-prog/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/devilmusic8342-prog).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
