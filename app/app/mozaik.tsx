import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

type Quote = { id: string; cost: number; remaining: number; service: string; source: string };
type Review = { decision: 'ready' | 'already_paid' | 'hold'; remaining: number; agents: {
  name: string; detail: string; status: string; source: string; note?: string; startedAt: number; endedAt: number;
}[] };
type Purchase = { receipt: string; result: string; remaining: number; cost: number };
const testCredits = (value: number) => `${(value / 100).toFixed(2)} test credits`;

async function sandbox<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`http://127.0.0.1:4197/${path}`, {
      method: 'POST', headers: { 'x-helixbox-sandbox': '1' }, signal: controller.signal,
    });
    if (!response.ok) throw new Error((await response.json()).error ?? 'Sandbox request failed.');
    return await response.json();
  } finally { clearTimeout(timeout); }
}

export default function Mozaik() {
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState('');
  const [quote, setQuote] = useState<Quote>();
  const [review, setReview] = useState<Review>();
  const [purchase, setPurchase] = useState<Purchase>();
  const [error, setError] = useState('');
  const text = { color: colors.fg.default, fontFamily: fonts.sans.regular, fontSize: 14, lineHeight: 21 };
  const muted = { ...text, color: colors.fg.muted };
  const button = { minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: colors.bg.raised };
  const title = { ...text, fontFamily: fonts.sans.semibold, fontSize: 20 };
  if (process.env.EXPO_PUBLIC_MOZAIK_SANDBOX !== '1') return <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
    <Header title="Mozaik" colors={colors} onBack={() => router.back()}/>
    <Text style={{ ...muted, padding: 16 }}>Payment review is not enabled in this build.</Text>
  </View>;
  const run = async (label: string, task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError('');
    try { await task(); }
    catch (err) { setError(err instanceof Error && err.message !== 'Network request failed' ? err.message : 'Cannot reach the local Mozaik sandbox on port 4197.'); }
    finally { lock.current = false; setBusy(''); }
  };
  return <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
    <Header title="Mozaik" colors={colors} onBack={() => router.back()}/>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
      <Text style={title}>Payment review</Text>
      <Text style={muted}>Solana checkout sandbox. Test credits only. No wallet, mainnet transfer or production account.</Text>
      <Pressable accessibilityRole="button" disabled={!!busy} style={button} onPress={() => void run('Creating quote', async () => {
        const next = await sandbox<Quote>('quote');
        setQuote(next); setReview(undefined); setPurchase(undefined);
      })}><Text style={text}>{quote ? 'Create a new test quote' : 'Get a test quote'}</Text></Pressable>
      {quote && <>
        <Text style={text}>{quote.service} · {testCredits(quote.cost)}</Text>
        <Text style={muted}>Available: {testCredits(purchase?.remaining ?? review?.remaining ?? quote.remaining)} · {quote.source}</Text>
        <Text selectable style={muted}>Request {quote.id}</Text>
        <Pressable accessibilityRole="button" disabled={!!busy} style={button} onPress={() => void run('Running both Mozaik agents', async () => {
          setReview(undefined);
          setReview(await sandbox<Review>(`review/${quote.id}`));
        })}><Text style={text}>{review ? 'Run review again' : 'Run Mozaik review'}</Text></Pressable>
        {review && <>
          {review.agents.map(agent => <View key={agent.name} style={button}>
            <Text style={text}>{agent.name} · {agent.status.replace('_', ' ')}</Text>
            <Text style={text}>{agent.detail}</Text>
            {agent.note ? <Text style={muted}>Agent note: {agent.note}</Text> : null}
            <Text style={muted}>{agent.source} · {(agent.endedAt - agent.startedAt).toFixed(1)} ms</Text>
          </View>)}
          <Text style={muted}>Agent overlap: {Math.max(0, Math.min(...review.agents.map(a => a.endedAt)) - Math.max(...review.agents.map(a => a.startedAt))).toFixed(2)} ms</Text>
          <Text style={text}>{review.decision === 'ready' ? 'Ready for your approval' : review.decision === 'already_paid' ? 'Already paid. No second debit.' : 'Hold. Do not retry.'}</Text>
          {(review.decision === 'ready' || review.decision === 'already_paid') && <Pressable accessibilityRole="button" disabled={!!busy} style={button}
            onPress={() => void run('Reading sandbox receipt', async () => setPurchase(await sandbox<Purchase>(`approve/${quote.id}`)))}>
            <Text style={text}>{purchase || review.decision === 'already_paid' ? 'Retrieve the same receipt' : `Approve ${testCredits(quote.cost)}`}</Text>
          </Pressable>}
        </>}
      </>}
      {busy !== '' && <View style={{ flexDirection: 'row', gap: 10 }}><ActivityIndicator color={colors.fg.default}/><Text style={text}>{busy}</Text></View>}
      {error !== '' && <Text accessibilityRole="alert" style={text}>{error}</Text>}
      {purchase && <View style={button}><Text selectable style={text}>{purchase.result}</Text><Text selectable style={muted}>{purchase.receipt}</Text></View>}
    </ScrollView>
  </View>;
}
