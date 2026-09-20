import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Loader2,
  AlertCircle,
  HelpCircle,
  ArrowDown,
  Info,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { parseAiChatApiResponse } from '../lib/api-contracts';
import type { AiChatMessageItem } from '../types/finance';

interface AiAssistantPageProps {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

const SUGGESTED_PROMPTS = [
  'Which recurring bills or subscriptions are due this month?',
  'What are my highest spending categories?',
  'How much have I spent on groceries and dining out?',
  'What did we spend at restaurants last month versus the month before?',
  'How much cash back have we gotten this year?',
  "What's new this month that wasn't last month?",
];

const INITIAL_GREETING: AiChatMessageItem = {
  id: 'msg_initial',
  role: 'model',
  content: `Hello! I'm your **FinSync Financial Assistant**.

I have **read-only visibility** into your synced financial ledger, connected accounts, recurring bills, and safe-to-spend calculations.

Feel free to ask me questions like:
- *"What is my safe-to-spend figure right now?"*
- *"Where did most of my money go recently?"*
- *"What recurring bills do I have scheduled?"*

*Note: For your privacy and security, I operate in strict read-only mode and cannot alter, recategorize, or delete any of your data.*`,
  createdAt: new Date().toISOString(),
};

export function AiAssistantPage({ apiFetch }: AiAssistantPageProps) {
  const [messages, setMessages] = useState<AiChatMessageItem[]>(() => {
    try {
      const saved = localStorage.getItem('finsync_ai_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage parsing failure
    }
    return [INITIAL_GREETING];
  });

  const [inputQuery, setInputQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('finsync_ai_chat_history', JSON.stringify(messages));
    } catch {
      // ignore storage failure
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? inputQuery).trim();
    if (!query || isSending) return;

    setErrorMessage(null);
    const userMsg: AiChatMessageItem = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputQuery('');

    // Format for backend API
    const apiPayloadMessages = newMessages
      .filter((m) => m.id !== 'msg_initial')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (apiPayloadMessages.length === 0) {
      apiPayloadMessages.push({ role: 'user', content: query });
    }

    setIsSending(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiPayloadMessages }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      const parsed = parseAiChatApiResponse(data);

      const assistantMsg: AiChatMessageItem = {
        id: `model_${Date.now()}`,
        role: 'model',
        content: parsed.response,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('AI chat submission error:', err);
      setErrorMessage(err.message || 'Failed to get a response from the AI assistant.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Clear conversation history?')) {
      setMessages([INITIAL_GREETING]);
      setErrorMessage(null);
      localStorage.removeItem('finsync_ai_chat_history');
    }
  };

  return (
    <div id="ai-assistant-page" className="flex flex-col h-[calc(100vh-8.5rem)] md:h-[calc(100vh-7rem)] max-w-5xl mx-auto w-full">
      {/* Top Banner with Read-Only badge and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">AI Financial Assistant</h1>
            <button
              onClick={() => setShowSecurityModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              title="Click to view read-only security guarantees"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Strictly Read-Only
              <Info className="w-3 h-3 text-emerald-500 ml-0.5" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Grounded directly in your connected accounts, transactions, and safe-to-spend ledger.
          </p>
        </div>

        <button
          id="btn-clear-chat"
          onClick={handleClearChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear Conversation
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-5 pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {msg.role === 'user' ? 'You' : 'FinSync Assistant'}
              </span>
            </div>

            <div
              className={`max-w-[88%] md:max-w-[78%] rounded-2xl p-4 text-sm leading-relaxed shadow-xs ${
                msg.role === 'user'
                  ? 'bg-slate-900 text-white rounded-tr-xs'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="space-y-3 prose-slate">
                  <Markdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-3 border border-slate-200 rounded-lg">
                          <table className="min-w-full text-xs text-left divide-y divide-slate-200">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-slate-50 font-semibold text-slate-700">{children}</thead>,
                      th: ({ children }) => <th className="px-3 py-2">{children}</th>,
                      td: ({ children }) => <td className="px-3 py-2 border-t border-slate-100">{children}</td>,
                    }}
                  >
                    {msg.content}
                  </Markdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                FinSync Assistant
              </span>
            </div>
            <div className="bg-white border border-indigo-100 rounded-2xl rounded-tl-xs p-4 shadow-xs flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="text-xs font-medium text-slate-600">
                Analyzing your financial ledger and calculating answers...
              </span>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to get a response</p>
              <p className="mt-0.5 text-rose-700">{errorMessage}</p>
              <button
                onClick={() => {
                  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUserMsg) void handleSendMessage(lastUserMsg.content);
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 underline hover:text-rose-900"
              >
                Try asking again
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts if only 1 message or ready */}
      {messages.length <= 2 && (
        <div className="pb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            Suggested Questions:
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void handleSendMessage(prompt)}
                disabled={isSending}
                className="text-xs bg-white hover:bg-indigo-50/70 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded-xl px-3 py-1.5 transition-all text-left disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="pt-2 border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
          className="relative flex items-end gap-2 bg-white border border-slate-300 rounded-2xl p-2 shadow-xs focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 transition-all"
        >
          <textarea
            id="ai-chat-input"
            ref={textareaRef}
            rows={2}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your money, balances, or transactions... (Press Enter to send)"
            disabled={isSending}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-50"
          />

          <button
            id="ai-chat-submit"
            type="submit"
            disabled={!inputQuery.trim() || isSending}
            aria-label="Send message"
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors shadow-xs shrink-0"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 mt-1.5">
          <span>Shift+Enter for newline</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            Strictly read-only access · Never modifies ledger
          </span>
        </div>
      </div>

      {/* Security & Read-Only Info Dialog */}
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-2.5 text-emerald-800 mb-3">
              <div className="p-2 bg-emerald-50 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Read-Only AI Assistant</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Your financial data is protected by design. The AI Financial Assistant operates under strict architectural constraints:
            </p>

            <ul className="text-xs text-slate-700 space-y-2.5 mb-6">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><strong>No Write Capabilities:</strong> The assistant has no functions or APIs to alter, add, recategorize, or delete transactions or accounts.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><strong>Server-Side Processing:</strong> Your financial data is securely compiled on the server and grounded in your active balances and transactions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><strong>Auditable Manual Controls:</strong> Any edits, category overrides, or account role assignments must be made by you directly in the app.</span>
              </li>
            </ul>

            <button
              onClick={() => setShowSecurityModal(false)}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
