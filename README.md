# Stremie

A Stremio / Overseerr-style iOS app for browsing movies and TV and streaming them through **AllDebrid**.

- **Browse**: Home (trending, new in theaters, popular, airing this week, upcoming, top rated), Discover (movies/series by genre and sort), Search, and detail pages with cast, trailer, recommendations, and a season/episode picker. Metadata comes from TMDB.
- **AllDebrid sign-in**: log in with a PIN (`/pin/get` → enter the code at alldebrid.com/pin → app polls `/pin/check`) or paste an API key. The key is stored in the iOS Keychain via `expo-secure-store`.
- **Streams**: any Stremio addon that returns torrent streams (default: Torrentio, unconfigured). Results are sorted by quality then seeders, with 4K / 1080p / 720p filters and HDR/DV/HEVC/MKV tags.
- **Resolve**: tapping a stream sends the hash to AllDebrid (`magnet/upload`), waits briefly if it is not cached, picks the right file (exact filename, then `SxxEyy` match, then largest video, skipping samples), and unlocks it (`link/unlock`, handling delayed links).
- **Offline downloads**: tap ⬇ on any stream to save it. Downloads run in the background (iOS background transfer), two at a time with the rest queued, and can be paused, resumed or retried. If the app is closed mid-download, the download comes back paused and picks up again with a fresh AllDebrid link. The Downloads tab shows progress and storage. Finished movies get a *Play downloaded* button, and downloaded episodes are marked and play offline when tapped. Files are saved in Documents/Downloads and show up in the **Files app** (On My iPhone → Stremie), so VLC or Infuse can open MKVs there or through *Open in…*.
- **Play**: MP4/MOV play in the built-in player (`expo-video`, with AirPlay, Picture-in-Picture and background audio). MKV and other formats that iOS can't play natively are handed to **Infuse**, **VLC** or **Outplayer**, or you can copy the direct link. You can choose a default in Settings → Player.

## Code map

| Path | What it does |
| --- | --- |
| `lib/tmdb.ts` | TMDB client (v3 API key or v4 read access token) |
| `lib/alldebrid.ts` | AllDebrid v4 client: PIN login, user, magnets, link unlock |
| `lib/addons.ts` | Stremio addon `stream` resource + Torrentio title parsing |
| `lib/resolve.ts` | Hash → AllDebrid → playable URL, file picking |
| `lib/players.ts` | External player deep links |
| `lib/downloads.tsx` | Offline download manager (queue, background transfer, pause/resume, index) |
| `lib/playLocal.ts` | Playing a downloaded file |
| `app/(tabs)/downloads.tsx` | Downloads tab |
| `lib/settings.tsx` | Settings context backed by SecureStore |
| `app/(tabs)/*` | Home, Discover, Search, Settings |
| `app/title/[type]/[id].tsx` | Movie / series details and episodes |
| `app/streams.tsx` | Stream list and resolve flow |
| `app/player.tsx` | Built-in player |

## 1. Run it today (no Apple setup needed)

Everything the app uses ships inside **Expo Go**, so you can try it on your iPhone right away:

```bash
npm install
npx expo start          # scan the QR code with the iPhone camera → opens in Expo Go
```

In the app, open **Settings** and:

1. **TMDB**: create a free key at <https://www.themoviedb.org/settings/api> and paste either the *API Key* or the *API Read Access Token*. (Or set `EXPO_PUBLIC_TMDB_API_KEY` in a `.env` file to bake one in.)
2. **AllDebrid**: tap *Log in with PIN* and enter the code at alldebrid.com/pin, or paste a key from <https://alldebrid.com/apikeys>.
3. Optionally install **Infuse**, **VLC** or **Outplayer** for MKV files.

## 2. Set up EAS + your Apple account (installable build)

`eas.json` is already in the repo with `development`, `simulator`, `preview` and `production` profiles. The bundle ID is `com.drluciano.stremie` (change `ios.bundleIdentifier` in `app.json` if you want something else before the first build).

```bash
npm install -g eas-cli
eas login                       # your Expo account
eas init                        # links this repo to an Expo project, writes extra.eas.projectId into app.json

# Register your iPhone for internal (ad hoc) builds — opens a link/QR to install a profile on the phone
eas device:create

# Option A: preview build — a standalone app you install from a link
eas build --profile preview --platform ios

# Option B: development build — like Expo Go but with this app's native config; use with `npx expo start --dev-client`
eas build --profile development --platform ios
```

The first `eas build` asks you to sign in to your Apple Developer account and lets EAS create the certificates and provisioning profile for you. Accept the defaults.

### TestFlight (one command)

On your Mac, after `npm install`, `eas login` and `eas init`:

```bash
npm run testflight     # = eas build -p ios --profile production --auto-submit
```

On the first run EAS will ask you to:
1. Log in to your Apple Developer account (and enter the 2FA code).
2. Pick your team, then let it register `com.drluciano.stremie` and generate the distribution certificate and provisioning profile. Say yes to each.
3. Create the app in App Store Connect and an App Store Connect API key for uploads. Say yes again.

The build runs in the cloud (about 15 to 25 minutes), then is uploaded to App Store Connect. Apple takes another 5 to 15 minutes to process it. After that, open App Store Connect → Stremie → TestFlight, add yourself under **Internal Testing**, and install it from the TestFlight app on your iPhone.

Later builds: run `npm run testflight` again; the build number goes up on its own. To resubmit an existing build: `npm run submit:ios`.

### Automatic TestFlight on every push to `main`

`.eas/workflows/testflight.yml` builds and submits on each push to `main`. To turn it on:
1. Do the first `npm run testflight` on your Mac (this stores the Apple credentials and upload key on EAS).
2. Commit and push the `app.json` change from `eas init`.
3. On expo.dev, open the project → **Project settings → GitHub**, install the Expo GitHub app and connect `drluciano/stremie`.

Each push uses one iOS build from your Expo plan. If that's too many, change the trigger in the workflow file.

> Note: App Store review is unlikely to approve a torrent/debrid streaming app. Ad hoc (`preview`) builds and TestFlight internal testing are the realistic ways to keep this on your own devices.

### Over-the-air updates (optional)

```bash
npx expo install expo-updates
eas update:configure
eas update --branch preview --message "…"
```

## Development

```bash
npx tsc --noEmit                         # type check
npx expo export --platform ios           # bundle check
npx expo start --web                     # quick UI preview in a browser (no video playback)
```
