import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Loader2, Send, Sparkles, Square, X } from 'lucide-react';
import { getSupabaseClient } from '../../services/auth/supabaseClient';

type RecentBar = {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type ChartAssistantContext = {
  symbol: string;
  timeframe: string;
  lastPrice?: number | null;
  candleCount?: number;
  recentBars?: RecentBar[];
  activeIndicators?: string[];
  analytics?: {
    bias?: string;
    vwap?: number | null;
    atr?: number | null;
    previousHigh?: number | null;
    previousLow?: number | null;
    support?: Array<{ price: number; state: string }>;
    resistance?: Array<{ price: number; state: string }>;
  } | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

function introMessage(symbol: string, timeframe: string): Message {
  return {
    id: 'welcome',
    role: 'assistant',
    content: 'I’m your in-chart CoreSpirit assistant for ' + symbol + ' · ' + timeframe + '. Ask me to explain the chart context, indicators, support/resistance, CoreScript concepts, or platform features. I only use the bounded chart snapshot shared with your question; I cannot place trades or change your chart.',
  };
}

function makeId() {
  return 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function readAssistantStream(
  response: Response,
  onDelta: (text: string) => void,
  onComplete: (payload: Record<string, unknown>) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Assistant stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  const consumeFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>; }
    catch { throw new Error('CoreSpirit assistant sent an invalid streaming event.'); }
    if (eventName === 'error') throw new Error(typeof data.error === 'string' ? data.error : 'Assistant request failed.');
    if (eventName === 'delta' && typeof data.text === 'string') onDelta(data.text);
    if (eventName === 'complete') onComplete(data);
  };

  while (true) {
    const result = await reader.read();
    buffer += decoder.decode(result.value, { stream: !result.done });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      consumeFrame(buffer.slice(0, boundary).replace(/\r$/, ''));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (result.done) break;
  }
  if (buffer.trim()) consumeFrame(buffer);
}

export function CoreSpiritChartAssistant({ context }: { context: ChartAssistantContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => [introMessage(context.symbol, context.timeframe)]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chartIdentityRef = useRef(context.symbol + '|' + context.timeframe);
  const activeAssistantIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const identity = context.symbol + '|' + context.timeframe;
    if (chartIdentityRef.current === identity) return;
    chartIdentityRef.current = identity;
    requestSequenceRef.current += 1;
    activeAssistantIdRef.current = null;
    abortRef.current?.abort();
    setStreaming(false);
    setError('');
    setDraft('');
    setMessages([{
      ...introMessage(context.symbol, context.timeframe),
      id: makeId(),
      content: 'Chart context changed to ' + context.symbol + ' · ' + context.timeframe + '. Ask a new question and I’ll use the current chart snapshot.',
    }]);
  }, [context.symbol, context.timeframe]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming, isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const sendMessage = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const messageText = draft.trim();
    if (!messageText || streaming) return;
    if (messageText.length > 2_000) {
      setError('Keep each message under 2,000 characters.');
      return;
    }

    setError('');
    setDraft('');
    const userMessage: Message = { id: makeId(), role: 'user', content: messageText };
    const assistantMessage: Message = { id: makeId(), role: 'assistant', content: '' };
    activeAssistantIdRef.current = assistantMessage.id;
    const requestId = ++requestSequenceRef.current;
    let requestController: AbortController | null = null;
    const history = [...messages.filter(item => item.content.trim()), userMessage]
      .slice(-10)
      .map(item => ({ role: item.role, content: item.content }));
    setMessages(current => [...current, userMessage, assistantMessage]);
    setStreaming(true);

    try {
      const { data: { session }, error: sessionError } = await getSupabaseClient().auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('Sign in to TradingCore before using the chart assistant.');
      // A reset or chart switch can happen while session restoration is pending.
      // Do not start a stale request after its UI context has been invalidated.
      if (requestId !== requestSequenceRef.current || activeAssistantIdRef.current !== assistantMessage.id) return;
      const controller = new AbortController();
      requestController = controller;
      abortRef.current = controller;
      const response = await fetch('/api/corespirit/copilot/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ message: messageText, history, context }),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/event-stream')) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'CoreSpirit chart assistant request failed.');
      }

      let fullAnswer = '';
      await readAssistantStream(response, delta => {
        fullAnswer = (fullAnswer + delta).slice(0, 8_000);
        setMessages(current => current.map(item => item.id === assistantMessage.id ? { ...item, content: fullAnswer } : item));
      }, payload => {
        const answer = typeof payload.answer === 'string' ? payload.answer : fullAnswer;
        setMessages(current => current.map(item => item.id === assistantMessage.id ? { ...item, content: answer } : item));
      });
    } catch (caught) {
      const stopped = caught instanceof Error && caught.name === 'AbortError';
      const errorMessage = stopped ? 'Response stopped.' : caught instanceof Error ? caught.message : 'Assistant request failed.';
      setError(stopped ? '' : errorMessage);
      setMessages(current => current.map(item => item.id === assistantMessage.id ? {
        ...item,
        content: item.content || (stopped ? 'Response stopped.' : 'I could not complete that response.'),
      } : item));
    } finally {
      // A late request must not clear the spinner/controller for a newer message.
      if (activeAssistantIdRef.current === assistantMessage.id) {
        activeAssistantIdRef.current = null;
        setStreaming(false);
      }
      if (requestController && abortRef.current === requestController) abortRef.current = null;
    }
  };

  const stopResponse = () => abortRef.current?.abort();
  const resetConversation = () => {
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
    setStreaming(false);
    activeAssistantIdRef.current = null;
    setError('');
    setDraft('');
    setMessages([introMessage(context.symbol, context.timeframe)]);
  };

  return (
    <>
      <button
        type="button"
        aria-label={isOpen ? 'Close CoreSpirit AI assistant' : 'Open CoreSpirit AI assistant'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="fixed bottom-4 right-4 z-[100] inline-flex items-center gap-2 rounded-full border border-[#3b82f6]/50 bg-[#111722] px-4 py-3 text-xs font-semibold text-white shadow-2xl transition hover:border-[#60a5fa] hover:bg-[#172235] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa]"
      >
        <Sparkles className="h-4 w-4 text-[#60a5fa]" />
        CoreSpirit AI
        <span className="rounded-full bg-[#3b82f6]/15 px-1.5 py-0.5 text-[9px] text-[#93c5fd]">CHAT</span>
      </button>

      {isOpen && (
        <section
          role="dialog"
          aria-label="CoreSpirit chart assistant"
          aria-modal="false"
          className="fixed bottom-[4.6rem] right-4 z-[100] flex h-[min(620px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#293448] bg-[#0b1018] text-[#e5edf7] shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#273143] bg-[#111722] px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#3b82f6]/15 text-[#93c5fd]"><Bot className="h-4 w-4" /></span>
              <div className="min-w-0">
                <div className="text-xs font-semibold">CoreSpirit Chart Assistant</div>
                <div className="truncate text-[10px] text-[#8b9bb4]">{context.symbol} · {context.timeframe}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={resetConversation} title="Start a new conversation" aria-label="Start a new conversation" className="rounded-lg px-2 py-1.5 text-[10px] text-[#91a0b5] hover:bg-[#1d2735] hover:text-white">New chat</button>
              <button type="button" onClick={() => setIsOpen(false)} title="Close assistant" aria-label="Close assistant" className="rounded-lg p-1.5 text-[#91a0b5] hover:bg-[#1d2735] hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
            {messages.map(item => (
              <div key={item.id} className={'flex ' + (item.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={'max-w-[92%] rounded-2xl px-3 py-2.5 text-xs leading-5 ' + (item.role === 'user' ? 'rounded-br-md bg-[#1c3556] text-[#eaf2ff]' : 'rounded-bl-md border border-[#283449] bg-[#111722] text-[#d8e3f1]')}>
                  {item.content ? <div className="whitespace-pre-wrap break-words">{item.content}</div> : <div className="flex items-center gap-2 text-[#93a4ba]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>}
                </div>
              </div>
            ))}
            {streaming && <div className="flex items-center gap-2 text-[10px] text-[#8292aa]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#60a5fa]" /> Streaming answer · snapshot only</div>}
            {messages.length === 1 && !streaming && (
              <div className="space-y-2 pt-1">
                {[
                  'Explain the current chart context.',
                  'What do VWAP, ATR, and nearby levels suggest?',
                  'Explain an indicator or CoreScript concept.',
                ].map(prompt => (
                  <button type="button" key={prompt} onClick={() => setDraft(prompt)} className="block w-full rounded-xl border border-[#273143] px-3 py-2 text-left text-[11px] text-[#b5c4d8] transition hover:border-[#3b82f6]/50 hover:bg-[#111722]">{prompt}</button>
                ))}
              </div>
            )}
            {error && <div role="alert" className="rounded-xl border border-[#85404b] bg-[#321a20] px-3 py-2 text-[10px] leading-4 text-[#ffc2cb]">{error}</div>}
            <div />
          </div>

          <form onSubmit={event => void sendMessage(event)} className="border-t border-[#273143] bg-[#10151e] p-3">
            <div className="flex items-end gap-2 rounded-xl border border-[#303b4d] bg-[#080c12] p-2 focus-within:border-[#3b82f6]/60">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!streaming) void sendMessage();
                  }
                }}
                maxLength={2_000}
                rows={2}
                aria-label="Ask the CoreSpirit chart assistant"
                placeholder="Ask about this chart or CoreSpirit…"
                className="max-h-28 min-h-12 flex-1 resize-y bg-transparent px-1 py-1 text-xs leading-5 text-white outline-none placeholder:text-[#64748b]"
              />
              {streaming
                ? <button type="button" onClick={stopResponse} title="Stop response" aria-label="Stop response" className="rounded-lg bg-[#1f2937] p-2 text-[#cbd5e1] hover:bg-[#334155]"><Square className="h-3.5 w-3.5" /></button>
                : <button type="submit" disabled={!draft.trim()} title="Send message" aria-label="Send message" className="rounded-lg bg-[#2563eb] p-2 text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-[#728198]"><span>AI can be wrong · verify data and signals</span><span>{draft.length}/2000</span></div>
          </form>
        </section>
      )}
    </>
  );
}
