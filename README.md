# PlayGround

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

## NovaDroid — Virtual Android Cloud Phone

A single-page, no-build viewport for a Docker-Android cloud phone. The phone screen is a noVNC canvas, and the side rail sends physical key events over the stream.

### Use it

1. Serve this folder over HTTP (the generated `start.sh` does this automatically).
2. Enter your VPS endpoint in the header, for example `http://203.0.113.10:6080`.
3. Press **Reconnect**. The app resolves the noVNC WebSocket to `/websockify` on port `6080` automatically.

Accepted endpoint formats:

- `http://VPS_IP:6080` or `https://VPS_IP:6080`
- `ws://VPS_IP:6080/websockify`
- A full `vnc.html?path=websockify` URL (the `path` query parameter is honoured)

If this page is served over HTTPS, the stream must also use `https://` / `wss://`; browsers block `ws://` mixed content.

### Controls

Power, volume, home, back, recent apps, and rotate are available in the rail. Keyboard shortcuts outside the URL field: `Esc` = Back, `Home` = Home, `R` = Rotate.

The noVNC core library is bundled in `vendor/novnc-rfb.js` under the MPL-2.0 license (see `vendor/novnc-LICENSE.txt`).
