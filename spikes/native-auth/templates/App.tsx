import { useState } from 'react';
import { SafeAreaView, ScrollView, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';

const baseURL = Constants.expoConfig?.extra?.apiURL as string;
const client = createAuthClient({
  baseURL,
  plugins: [
    expoClient({ scheme: 'blockfw-spike', storagePrefix: 'blockfw-spike', storage: SecureStore }),
  ],
});
export default function App() {
  const { data: session, isPending } = client.useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Ready');
  const [busy, setBusy] = useState(false);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function account(signup: boolean) {
    const result = signup
      ? await client.signUp.email({ email, password, name: 'Device evaluation' })
      : await client.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.message || 'Authentication failed');
    setMessage(signup ? 'Signed up' : 'Signed in');
  }
  async function probe() {
    const cookie = await client.getCookie();
    const response = await fetch(baseURL + '/api/private', {
      credentials: 'omit',
      headers: { Cookie: cookie },
    });
    setMessage('Protected API: ' + response.status + ' ' + JSON.stringify(await response.json()));
  }
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Block Studio native auth spike</Text>
        <Text>API: {baseURL}</Text>
        <Text testID="session">
          {isPending
            ? 'Loading session'
            : session?.user
              ? 'Session: ' + session.user.email
              : 'Session: signed out'}
        </Text>
        <TextInput
          accessibilityLabel="Email"
          testID="email"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          accessibilityLabel="Password"
          testID="password"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {[
          ['Sign up', () => account(true)],
          ['Sign in', () => account(false)],
          ['Probe protected API', probe],
          [
            'Refresh session',
            async () => {
              await client.getSession({ query: { disableCookieCache: true } });
              setMessage('Session refreshed');
            },
          ],
          [
            'Sign out',
            async () => {
              const result = await client.signOut();
              if (result.error) throw new Error(result.error.message || 'Sign out failed');
              setMessage('Signed out');
            },
          ],
        ].map(([label, task]) => (
          <Pressable
            key={label as string}
            accessibilityRole="button"
            accessibilityLabel={label as string}
            disabled={busy}
            style={styles.button}
            onPress={() => void run(task as () => Promise<void>)}
          >
            <Text>{label as string}</Text>
          </Pressable>
        ))}
        <Text accessibilityRole="alert" testID="result">
          {message}
        </Text>
        <Text>
          Use a disposable account. Verify 401 before login, 200 after login and restart, and 401
          after logout.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#e9e9e9', padding: 14, borderRadius: 8 },
});
