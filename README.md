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

## 2. TestFlight from GitHub Actions (no Mac needed)

`.github/workflows/testflight.yml` builds the app on EAS and uploads it to TestFlight on every push to `main` (and from **Actions → TestFlight → Run workflow**). It needs only an App Store Connect API key. On its first run it links the Expo project, registers `com.drluciano.stremie`, creates the distribution certificate and App Store provisioning profile through Apple's API, and commits them encrypted (`credentials/ios.enc`, AES-256-GCM, key derived from your `.p8`).

One-time setup, all doable from a phone browser:

1. **App Store Connect API key**: appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API → Team Keys → ＋, access **Admin**. Note the **Key ID** and the **Issuer ID**, and download the `.p8` (you can only download it once).
2. **Expo token**: expo.dev → Account settings → Access tokens → Create.
3. **GitHub secrets**: github.com/drluciano/stremie → Settings → Secrets and variables → Actions → New repository secret:
   `EXPO_TOKEN`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole text of the .p8, including the BEGIN/END lines).
4. **Run it**: Actions → TestFlight → Run workflow. The first run stops after creating the certificates with a message asking you to:
5. **Create the app record**: App Store Connect → Apps → ＋ New App → iOS, name Stremie, bundle ID `com.drluciano.stremie`, any SKU. Then run the workflow again.

After that, each push to `main` builds and uploads automatically (about 20 to 30 minutes, then 5 to 15 minutes of Apple processing). Add yourself under TestFlight → Internal Testing once. Each run uses one iOS build from your Expo plan.

Local alternative (if you have a Mac): `npx eas-cli build -p ios --profile production --auto-submit`.

> Note: App Store review is unlikely to approve a torrent/debrid streaming app. TestFlight internal testing is the realistic way to keep this on your own devices.

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
