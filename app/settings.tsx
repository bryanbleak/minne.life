import type { Session } from '@supabase/supabase-js';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { syncAll } from '@/lib/sync';

type AuthStep = 'email' | 'code';

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;

  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

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
    setMessage(`We emailed a 6-digit code to ${address}.`);
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
                Sign in to back up your notes. No password — we email you a 6-digit code.
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
                style={({ pressed }) => [styles.button, { backgroundColor: tint }, pressed && styles.pressed]}>
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
                placeholder="6-digit code"
                placeholderTextColor="#8888"
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput, { color: textColor }]}
              />
              <Pressable
                onPress={verifyCode}
                disabled={busy || code.trim().length < 6}
                style={({ pressed }) => [styles.button, { backgroundColor: tint }, pressed && styles.pressed]}>
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
          <ThemedText style={styles.muted}>
            Once transcription is live, you&apos;ll add your own OpenAI and Anthropic keys here so
            each family member pays for their own usage. Keys are stored encrypted on the server and
            never inside the app.
          </ThemedText>
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
  codeInput: { letterSpacing: 8, fontSize: 22, textAlign: 'center' },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
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
