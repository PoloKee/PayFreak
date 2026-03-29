"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  agentApi,
  agentChatStream,
  type AgentChatResponse,
  type AgentStreamEvent,
} from "@/lib/api";

const SESSION_STORAGE_KEY = "payright_finassist_session";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type Line = { role: "user" | "assistant"; text: string };

export default function FinAssistPage() {
  const { user, loading } = useAuth();
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<unknown[]>([]);
  const [lastMeta, setLastMeta] = useState<AgentChatResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sid) {
      sid = newSessionId();
      sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    }
    setSessionId(sid);
  }, []);

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    setHistoryLoaded(false);
    (async () => {
      try {
        const r = await agentApi.history(sessionId);
        if (cancelled) return;
        const lines: Line[] = (r.messages ?? []).map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.content ?? "",
        }));
        setMessages(lines);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, sessionId]);

  const loadSuggestions = useCallback(async () => {
    if (!user || !sessionId) return;
    try {
      const r = await agentApi.suggestions(undefined, sessionId);
      setSuggestions(r.suggestions ?? []);
    } catch {
      setSuggestions([]);
    }
  }, [user, sessionId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const resetSession = () => {
    const sid = newSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
    setSessionId(sid);
    setMessages([]);
    setHistoryLoaded(false);
    setLastMeta(null);
    setErr(null);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || !sessionId || !user) return;
    setInput("");
    setErr(null);
    setBusy(true);
    if (streamEnabled) {
      setMessages((m) => [...m, { role: "user", text: t }, { role: "assistant", text: "" }]);
      try {
        await agentChatStream(t, sessionId, (ev: AgentStreamEvent) => {
          if (ev.type === "meta" && ev.intent != null) {
            setLastMeta({
              intent: ev.intent,
              entities: ev.entities,
              confidence: undefined,
            });
          }
          if (ev.type === "delta" && ev.text) {
            setMessages((m) => {
              const out = [...m];
              const i = out.length - 1;
              if (i >= 0 && out[i].role === "assistant") {
                out[i] = { role: "assistant", text: out[i].text + ev.text };
              }
              return out;
            });
          }
          if (ev.type === "final" && ev.response) {
            setLastMeta(ev.response);
          }
          if (ev.type === "error") {
            const em = ev.message || "Stream error";
            setErr(em);
            setMessages((m) => {
              const out = [...m];
              const i = out.length - 1;
              if (i >= 0 && out[i].role === "assistant") {
                out[i] = {
                  role: "assistant",
                  text: out[i].text.trim() ? `${out[i].text}\n\nError: ${em}` : `Error: ${em}`,
                };
              }
              return out;
            });
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setErr(msg);
        setMessages((m) => {
          const out = [...m];
          const i = out.length - 1;
          if (i >= 0 && out[i].role === "assistant") {
            out[i] = {
              role: "assistant",
              text: out[i].text.trim() ? `${out[i].text}\n\nError: ${msg}` : `Error: ${msg}`,
            };
          }
          return out;
        });
      } finally {
        setBusy(false);
      }
      return;
    }
    setMessages((m) => [...m, { role: "user", text: t }]);
    try {
      const r = await agentApi.chat(t, sessionId);
      setLastMeta(r);
      let body = r.content?.trim() || "(empty reply)";
      if (r.action_error) {
        body += `\n\n[action_error] ${r.action_error}`;
      }
      if (r.action_result != null) {
        body += `\n\n[action_result]\n${JSON.stringify(r.action_result, null, 2)}`;
      }
      setMessages((m) => [...m, { role: "assistant", text: body }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setErr(msg);
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">FinAssist</h1>
            <p className="text-secondary mb-3">
              Conversational assistant via <code className="small">POST /api/agent/chat</code>.
            </p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-9 col-xl-8">
        <h1 className="h2 fw-bold section-title mb-2">FinAssist</h1>
        <p className="section-subtitle mb-3 small">
          Uses your JWT and a browser session id (stored in <code className="small">sessionStorage</code>).
          Past turns load from <code className="small">GET /api/agent/history</code>. Default mode uses{" "}
          <code className="small">POST /api/agent/chat/stream</code> (SSE); turn off streaming for full JSON
          replies including <code className="small">action_result</code> via <code className="small">POST /api/agent/chat</code>.
        </p>
        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={resetSession}
            disabled={busy}
          >
            New session
          </button>
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="finassist-stream"
              checked={streamEnabled}
              onChange={(e) => setStreamEnabled(e.target.checked)}
              disabled={busy}
            />
            <label className="form-check-label small" htmlFor="finassist-stream">
              Stream replies (SSE)
            </label>
          </div>
          <span className="small text-muted font-monospace">session: {sessionId.slice(0, 8)}…</span>
        </div>

        {suggestions.length > 0 && (
          <div className="mb-3">
            <div className="small text-secondary mb-1">Suggestions</div>
            <div className="d-flex flex-wrap gap-1">
              {suggestions.slice(0, 6).map((s, i) => {
                const item = s as Record<string, unknown>;
                const title = String(item.title ?? item.description ?? "Run");
                return (
                  <button
                    key={i}
                    type="button"
                    className="btn btn-light border btn-sm"
                    disabled={busy}
                    onClick={() => send(title)}
                  >
                    {title.length > 48 ? `${title.slice(0, 48)}…` : title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="border rounded bg-white p-3 mb-3"
          style={{ minHeight: 240, maxHeight: 420, overflowY: "auto" }}
        >
          {!historyLoaded ? (
            <p className="text-secondary small mb-0">
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              />
              Loading conversation…
            </p>
          ) : messages.length === 0 ? (
            <p className="text-secondary small mb-0">Send a message to start.</p>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`mb-3 ${m.role === "user" ? "text-end" : ""}`}
              >
                <div
                  className={`d-inline-block text-start p-2 rounded small ${
                    m.role === "user" ? "bg-primary text-white" : "bg-light border"
                  }`}
                  style={{ maxWidth: "95%", whiteSpace: "pre-wrap" }}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
          {busy &&
            historyLoaded &&
            !(streamEnabled && messages.length > 0 && messages[messages.length - 1]?.role === "assistant") && (
            <div className="mb-1">
              <div
                className="d-inline-flex align-items-center gap-2 text-start p-2 rounded small bg-light border text-secondary"
                aria-live="polite"
              >
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-label="FinAssist is replying"
                />
                FinAssist is replying…
              </div>
            </div>
          )}
        </div>

        {lastMeta?.intent != null && (
          <p className="small text-muted mb-2">
            Last intent: <code>{String(lastMeta.intent)}</code>
            {lastMeta.confidence != null && (
              <> · confidence {lastMeta.confidence.toFixed(2)}</>
            )}
          </p>
        )}

        <form
          className="d-flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="form-control"
            placeholder="Ask about payroll, documents, or calculations…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy || !sessionId}
          />
          <button type="submit" className="btn btn-pr-primary px-4" disabled={busy || !sessionId}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
