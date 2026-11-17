import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Section } from '@/components/ui';
import { C } from '@/constants/theme';
import { addonBase } from '@/lib/addons';
import { AllDebridError, PinStart, getUser, pinCheck, pinGet } from '@/lib/alldebrid';
import { EXTERNAL_PLAYERS } from '@/lib/players';
import { DEFAULT_ADDON_URL, ExternalPlayer, useSettings } from '@/lib/settings';

export default function Settings() {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <AllDebridSection />
      <TmdbSection />
      <AddonSection />
      <PlayerSection />
    </ScrollView>
  );
}

function AllDebridSection() {
  const { allDebridKey, update } = useSettings();
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState<PinStart | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const user = useQuery({
    queryKey: ['ad-user', allDebridKey],
    queryFn: () => getUser(allDebridKey!),
    enabled: !!allDebridKey,
  });

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);

  const startPin = async () => {
    setPinError(null);
    try {
      const p = await pinGet();
      setPin(p);
      const expiresAt = Date.now() + p.expires_in * 1000;
      stopPolling();
      poll.current = setInterval(async () => {
        if (Date.now() > expiresAt) {
          stopPolling();
          setPin(null);
          setPinError('PIN expired. Try again.');
          return;
        }
        try {
          const r = await pinCheck(p.pin, p.check);
          if (r.activated && r.apikey) {
            stopPolling();
            setPin(null);
            await update({ allDebridKey: r.apikey });
          }
        } catch (e) {
          if (e instanceof AllDebridError && (e.code === 'PIN_EXPIRED' || e.code === 'PIN_INVALID')) {
            stopPolling();
            setPin(null);
            setPinError(e.message);
          }
        }
      }, 5000);
    } catch (e) {
      setPinError((e as Error).message);
    }
  };

  const saveManual = async () => {
    const key = manual.trim();
    if (!key) return;
    setSaving(true);
    try {
      await getUser(key);
      await update({ allDebridKey: key });
      setManual('');
    } catch (e) {
      Alert.alert('AllDebrid', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (allDebridKey) {
    const u = user.data;
    return (
      <Section title="AllDebrid">
        {user.isLoading ? (
          <Text style={styles.dim}>Checking account…</Text>
        ) : user.error ? (
          <Text style={{ color: C.bad }}>{(user.error as Error).message}</Text>
        ) : u ? (
          <View style={{ gap: 4 }}>
            <Text style={styles.strong}>{u.username}</Text>
            <Text style={{ color: u.isPremium ? C.good : C.warn }}>
              {u.isPremium
                ? `Premium until ${new Date(u.premiumUntil * 1000).toLocaleDateString()}`
                : u.isTrial
                  ? 'Trial account'
                  : 'Not premium: streaming needs an active subscription'}
            </Text>
          </View>
        ) : null}
        <Button
          title="Sign out"
          kind="danger"
          onPress={() =>
            Alert.alert('Sign out of AllDebrid?', 'The API key will be removed from this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => update({ allDebridKey: null }) },
            ])
          }
        />
      </Section>
    );
  }

  return (
    <Section
      title="AllDebrid"
      footer="Your API key is stored in the iOS Keychain on this device only. Keys are at alldebrid.com/apikeys.">
      {pin ? (
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Text style={styles.dim}>Enter this PIN at alldebrid.com/pin</Text>
          <Pressable onPress={() => Clipboard.setStringAsync(pin.pin)}>
            <Text style={styles.pin}>{pin.pin}</Text>
          </Pressable>
          <Text style={styles.faint}>Tap the PIN to copy. Waiting for approval…</Text>
          <Button title="Open alldebrid.com/pin" onPress={() => WebBrowser.openBrowserAsync(pin.user_url)} style={{ alignSelf: 'stretch' }} />
          <Button
            title="Cancel"
            kind="secondary"
            onPress={() => {
              stopPolling();
              setPin(null);
            }}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <>
          <Button title="Log in with PIN" onPress={startPin} />
          {pinError ? <Text style={{ color: C.bad }}>{pinError}</Text> : null}
          <Text style={[styles.faint, { textAlign: 'center' }]}>or paste an API key</Text>
          <Field placeholder="AllDebrid API key" value={manual} onChangeText={setManual} secureTextEntry />
          <Button title="Save key" kind="secondary" onPress={saveManual} loading={saving} disabled={!manual.trim()} />
        </>
      )}
    </Section>
  );
}

function TmdbSection() {
  const { tmdbKey, update } = useSettings();
  const [value, setValue] = useState('');
  return (
    <Section
      title="TMDB (browse metadata)"
      footer="Free at themoviedb.org → Settings → API. Either the API key or the longer Read Access Token works.">
      {tmdbKey ? (
        <View style={styles.rowBetween}>
          <Text style={styles.strong}>Key saved ····{tmdbKey.slice(-4)}</Text>
          <Pressable onPress={() => update({ tmdbKey: null })}>
            <Text style={{ color: C.bad, fontWeight: '600' }}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Field placeholder="TMDB API key or read access token" value={value} onChangeText={setValue} secureTextEntry />
          <Button
            title="Save"
            disabled={!value.trim()}
            onPress={async () => {
              await update({ tmdbKey: value.trim() });
              setValue('');
            }}
          />
          <Button title="Get a TMDB key" kind="secondary" onPress={() => WebBrowser.openBrowserAsync('https://www.themoviedb.org/settings/api')} />
        </>
      )}
    </Section>
  );
}

function AddonSection() {
  const { addonUrl, update } = useSettings();
  const [value, setValue] = useState(addonUrl);
  useEffect(() => setValue(addonUrl), [addonUrl]);
  const dirty = addonBase(value) !== addonUrl;
  return (
    <Section
      title="Stream source"
      footer="Any Stremio addon that returns torrent streams works. Paste its manifest URL. Leave the default Torrentio URL unconfigured; AllDebrid is handled by the app.">
      <Field value={value} onChangeText={setValue} placeholder={DEFAULT_ADDON_URL} keyboardType="url" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Save" disabled={!dirty} onPress={() => update({ addonUrl: addonBase(value) })} style={{ flex: 1 }} />
        <Button title="Reset" kind="secondary" onPress={() => update({ addonUrl: DEFAULT_ADDON_URL })} style={{ flex: 1 }} />
      </View>
    </Section>
  );
}

function PlayerSection() {
  const { externalPlayer, update } = useSettings();
  const options: { id: ExternalPlayer; name: string; hint: string }[] = [
    { id: 'auto', name: 'Automatic', hint: 'Built-in for MP4, ask for MKV and others' },
    { id: 'builtin', name: 'Built-in player', hint: 'Always try the native iOS player' },
    ...EXTERNAL_PLAYERS.map((p) => ({ id: p.id, name: p.name, hint: `Always open in ${p.name}` })),
  ];
  return (
    <Section
      title="Player"
      footer="The built-in iOS player can't play MKV files, which most torrents use. Infuse, VLC or Outplayer (free on the App Store) handle them.">
      {options.map((o) => (
        <Pressable key={o.id} onPress={() => update({ externalPlayer: o.id })} style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>{o.name}</Text>
            <Text style={styles.faint}>{o.hint}</Text>
          </View>
          <Text style={{ color: C.accent, fontSize: 18 }}>{externalPlayer === o.id ? '●' : '○'}</Text>
        </Pressable>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  dim: { color: C.dim },
  faint: { color: C.faint, fontSize: 13 },
  strong: { color: C.text, fontWeight: '600', fontSize: 15 },
  pin: { color: C.text, fontSize: 44, fontWeight: '900', letterSpacing: 8, fontVariant: ['tabular-nums'] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
