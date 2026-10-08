import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { GITHUB_REPO, RISK_WORKFLOW } from '../config';

const TOKEN_KEY = 'gh-token-v1';

// Der Schlüssel liegt im verschlüsselten Speicher des Handys (Android Keystore). Fällt der aus, greift der normale App-Speicher.
export const getToken = async (): Promise<string | null> => {
  try {
    const v = await SecureStore.getItemAsync(TOKEN_KEY);
    if (v) return v;
  } catch {
    /* weiter mit Ersatzspeicher */
  }
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) || null;
  } catch {
    return null;
  }
};
export const setToken = async (t: string) => {
  const v = t.trim();
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, v);
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  } catch {
    await AsyncStorage.setItem(TOKEN_KEY, v);
  }
};
export const clearToken = async () => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignorieren */
  }
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
};

export type ApplyResult = { ok: true } | { ok: false; reason: 'no-token' | 'denied' | 'error'; message: string };

/**
 * Schickt neue Risiko-Werte an den Server. Das geht nur über einen GitHub-Auftrag (workflow_dispatch):
 * Die App darf nicht direkt in das Repository schreiben. Der Schlüssel liegt nur lokal auf diesem Handy.
 */
export async function applyRisk(values: { day?: number; long?: number; gold?: number }): Promise<ApplyResult> {
  const token = await getToken();
  if (!token) return { ok: false, reason: 'no-token', message: 'Kein GitHub-Schlüssel gespeichert.' };
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${RISK_WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          day: values.day != null ? String(Math.round(values.day)) : '',
          long: values.long != null ? String(Math.round(values.long)) : '',
          gold: values.gold != null ? String(Math.round(values.gold)) : '',
        },
      }),
    });
    if (res.status === 204) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'denied', message: 'GitHub lehnt den Schlüssel ab. Er ist abgelaufen oder hat nicht die Berechtigung „Actions: Read and write" für das Repository.' };
    if (res.status === 404) return { ok: false, reason: 'error', message: 'Auftrag nicht gefunden. Wurde die neue Version schon mit „git push" hochgeladen?' };
    if (res.status === 422) return { ok: false, reason: 'error', message: 'GitHub kennt den Auftrag „Bot-Risiko einstellen" noch nicht. Erst „git push" ausführen.' };
    return { ok: false, reason: 'error', message: `GitHub antwortet mit Fehler ${res.status}.` };
  } catch (e: any) {
    return { ok: false, reason: 'error', message: e?.message ?? 'Keine Verbindung zu GitHub.' };
  }
}
