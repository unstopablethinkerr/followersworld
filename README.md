# 🏙️ FollowVerse

**Every Instagram follower of [@unstopablethinkerr](https://instagram.com/unstopablethinkerr) gets a home in a 3D city.**
Search your @id, fly to your house, and see the city in day, dusk, night and rain.

🔗 Live: `https://unstopablethinkerr.github.io/followverse/`
🔗 Jump straight to someone: `https://unstopablethinkerr.github.io/followverse/#@cubernithin`

---

## Features
- Drone-style (GTA-like) eagle view: drag to pan, right-drag or two fingers to rotate, scroll or pinch to zoom, arrow keys to move
- One home per follower (house, villa, apartment, cottage, shop, office), with their **@id** floating above it
- Temples (gopuram style), parks, lakes, markets, wind turbines, farms, mountains, traffic and clouds
- ☀️ Day · 🌇 Dusk · 🌙 Night · 🌧️ Rain with lightning · 🕒 Auto (follows the visitor's clock)
- Search with filters, a minimap, a 🚁 drone tour, 📸 screenshots, and shareable links to each house
- The city gets bigger as followers grow, and the central HQ tower gets taller
- Works on desktop and mobile. No build step and no CDN: three.js is bundled in `js/vendor/`

## Repo setup (one time)
1. On GitHub, create a **public** repo named **`followverse`**.
2. Unzip this folder and upload **all its contents** (including the empty `.nojekyll` file) to the repo root.
3. Go to **Settings → Pages → Build and deployment**, set Source to *Deploy from a branch*, then pick Branch `main` and folder `/ (root)`, and click **Save**.
4. After about a minute, the site is live at `https://<your-username>.github.io/followverse/`.

```
followverse/
├── index.html          ← the 3D city
├── followers.json      ← your data (the only file you update)
├── tools/add.html      ← helper to add new followers
├── js/world.js         ← scene, UI, modes
├── js/layout.js        ← plot / building rules (shared)
└── js/vendor/          ← three.js r170 (MIT)
```

## Daily update (2 minutes)
1. Open `https://<you>.github.io/followverse/tools/add.html`.
2. Paste the new usernames. You can also paste your **full** list; anyone already in the city is skipped.
3. Click **Preview**, then **Download followers.json**.
4. On GitHub, open `followers.json` → ✏️ / *Upload files*, replace it, and commit. The site updates in about a minute.

## followers.json format
```json
{
  "owner": "unstopablethinkerr",
  "updated": "2026-11-23",
  "followers": [
    {"id":"nbalajinandha","x":0,"z":-2,"type":"apartment","color":"#c7d3dd","floors":8,"since":"2026-11-23"}
  ]
}
```
| field | meaning |
|---|---|
| `id` | Instagram username, without the @ |
| `x`, `z` | **Plot coordinates.** Fixed forever: this is the follower's address |
| `type` | `house` · `villa` · `apartment` · `cottage` · `shop` · `office` |
| `color` | wall colour (hex) |
| `floors` | number of floors (1–30) |
| `since` | date they joined the city |
| `note` | *(optional)* a line shown on their card |

**Rules that keep the city stable**
- Never change an existing person's `x`/`z`. New followers get the next free plot, from the centre outward.
- You can hand-edit `type`, `color`, `floors` or `note` for anyone (for example, give a friend a 20-floor office).
- If an entry has no valid or unique plot, the city still places it automatically and logs a warning. Run it through `tools/add.html` to save a fixed plot.
- Landmark blocks (temples, parks, lakes, markets) are fixed, so they never collide with follower plots.

## Run locally
`fetch()` needs a web server (opening the file directly won't work):
```bash
cd followverse && python3 -m http.server 8000   # → http://localhost:8000
```
