import type { Session } from '@supabase/supabase-js';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getKeyStatus, setApiKey, type KeyStatus, type Provider } from '@/lib/pipeline';
import { supabase } from '@/lib/supabase';
import { syncAll } from '@/lib/sync';

type AuthStep = 'email' | 'code';

const PROVIDER_LABELS: Record<Provider, { name: string; hint: string }> = {
  openai: { name: 'OpenAI', hint: 'Used to transcribe your recordings' },
  anthropic: { name: 'Anthropic', hint: 'Used to clean up transcripts and suggest titles' },
};

function ApiKeyRow({
  provider,
  status,
  onSaved,
  textColor,
  primary,
}: {
  provider: Provider;
  status: { configured: boolean; last4?: string } | null;
  onSaved: () => void;
  textColor: string;
  primary: string;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const label = PROVIDER_LABELS[provider];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setApiKey(provider, value);
      setValue('');
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.keyRow}>
      <ThemedText type="defaultSemiBold">{label.name}</ThemedText>
      <ThemedText style={styles.muted}>{label.hint}</ThemedText>
      {status?.configured && !editing ? (
        <View style={styles.keyStatusRow}>
          <ThemedText style={styles.keySaved}>✓ Saved (····{status.last4})</ThemedText>
          <Pressable onPress={() => setEditing(true)} hitSlop={8}>
            <ThemedText style={{ color: primary, fontWeight: '600' }}>Replace</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="sk-..."
            placeholderTextColor="#8888"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, { color: textColor }]}
          />
          <Pressable
            onPress={save}
            disabled={busy || value.trim().length < 20}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: primary },
              (busy || value.trim().length < 20) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>Save key</ThemedText>
            )}
          </Pressable>
          {error && <ThemedText style={styles.message}>{error}</ThemedText>}
        </>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const primary = Colors[colorScheme].primary;
  const textColor = Colors[colorScheme].text;

  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshKeyStatus = useCallback(() => {
    getKeyStatus()
      .then(setKeyStatus)
      .catch(() => setKeyStatus(null));
  }, []);

  useEffect(() => {
    if (session) refreshKeyStatus();
    else setKeyStatus(null);
  }, [session, refreshKeyStatus]);

  const sendCode = useCallback(async () => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) {
      setMessage('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setMessage(`Could not send the code: ${error.message}`);
      return;
    }
    setStep('code');
    setMessage(`We emailed a sign-in code to ${address}.`);
  }, [email]);

  const verifyCode = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setMessage(`That code didn't work: ${error.message}`);
      return;
    }
    setStep('email');
    setCode('');
    setMessage(null);
    syncAll().catch(() => {}); // first sync kicks off right after sign-in
  }, [email, code]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStep('email');
    setMessage(null);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="subtitle">Account</ThemedText>
          {session ? (
            <>
              <ThemedText>
                Signed in as <ThemedText type="defaultSemiBold">{session.user.email}</ThemedText>
              </ThemedText>
              <ThemedText style={styles.muted}>
                Your notes back up to your private Minne account automatically.
              </ThemedText>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [styles.buttonOutline, { borderColor: tint }, pressed && styles.pressed]}>
                <ThemedText style={{ color: tint, fontWeight: '600' }}>Sign out</ThemedText>
              </Pressable>
            </>
          ) : step === 'email' ? (
            <>
              <ThemedText style={styles.muted}>
                Sign in to back up your notes. No password — we email you a sign-in code.
              </ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#8888"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { color: textColor }]}
              />
              <Pressable
                onPress={sendCode}
                disabled={busy}
                style={({ pressed }) => [styles.button, { backgroundColor: primary }, pressed && styles.pressed]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Email me a code</ThemedText>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Code from your email"
                placeholderTextColor="#8888"
                keyboardType="number-pad"
                maxLength={10}
                style={[styles.input, styles.codeInput, { color: textColor }]}
              />
              <Pressable
                onPress={verifyCode}
                disabled={busy || code.trim().length < 6}
                accessibilityLabel="Sign in with code"
                style={({ pressed }) => [styles.button, { backgroundColor: primary }, pressed && styles.pressed]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Sign in</ThemedText>
                )}
              </Pressable>
              <Pressable onPress={() => setStep('email')} hitSlop={8}>
                <ThemedText style={[styles.muted, styles.linkText]}>Use a different email</ThemedText>
              </Pressable>
            </>
          )}
          {message && <ThemedText style={styles.message}>{message}</ThemedText>}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">API keys</ThemedText>
          {session ? (
            <>
              <ThemedText style={styles.muted}>
                Your recordings are transcribed and cleaned up using your own AI accounts, so you
                pay only for your own usage. Keys are encrypted on the server — the app never
                stores them.
              </ThemedText>
              <ApiKeyRow
                provider="openai"
                status={keyStatus?.openai ?? null}
                onSaved={refreshKeyStatus}
                textColor={textColor}
                primary={primary}
              />
              <ApiKeyRow
                provider="anthropic"
                status={keyStatus?.anthropic ?? null}
                onSaved={refreshKeyStatus}
                textColor={textColor}
                primary={primary}
              />
            </>
          ) : (
            <ThemedText style={styles.muted}>
              Sign in first, then add your own OpenAI and Anthropic keys here to enable
              transcription.
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">About</ThemedText>
          <ThemedText style={styles.muted}>Minne — a personal capture and retrieval system.</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 28 },
  section: { gap: 10 },
  muted: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: '#8886',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 4, fontSize: 22, textAlign: 'center' },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  keyRow: { gap: 6, marginTop: 10 },
  keyStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  keySaved: { color: '#2a9d3f', fontWeight: '600' },
  buttonOutline: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.8 },
  linkText: { textAlign: 'center', paddingVertical: 4 },
  message: { fontStyle: 'italic' },
});
