"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { agentsApi, getApiOrigin, processApi } from "@/lib/api";

type QueueItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
  resultPreview?: string;
};

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function AdminPdfUploadPage() {
  const { user, loading, isAdmin, isEmployer } = useAuth();
  const canUse = Boolean(user && (isAdmin || isEmployer));
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState("auto");
  /** `direct` = synchronous `/api/process/pdf`; `agent` = `/api/agents/process/pdf` (202 + task_id). */
  const [pipeline, setPipeline] = useState<"direct" | "agent">("direct");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((list: FileList | File[]) => {
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    setQueue((q) => [
      ...q,
      ...pdfs.map((file) => ({
        id: randomId(),
        file,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const processOne = async (item: QueueItem) => {
    setQueue((q) =>
      q.map((x) => (x.id === item.id ? { ...x, status: "uploading", message: undefined } : x))
    );
    try {
      const docType = documentType === "auto" ? undefined : documentType;
      if (pipeline === "direct") {
        const data = (await processApi.uploadPdf(item.file, docType)) as {
          status?: string;
          result?: unknown;
        };
        const preview =
          data.result != null
            ? JSON.stringify(data.result, null, 2).slice(0, 4000)
            : JSON.stringify(data, null, 2).slice(0, 4000);
        setQueue((q) =>
          q.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: "done",
                  message: data.status ? `Status: ${data.status}` : "Completed",
                  resultPreview: preview,
                }
              : x
          )
        );
      } else {
        const data = await agentsApi.processPdf(item.file, docType);
        const tid = data.task_id ?? "—";
        setQueue((q) =>
          q.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  status: "done",
                  message: data.message || `Queued · task_id: ${tid}`,
                  resultPreview: JSON.stringify(data, null, 2),
                }
              : x
          )
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setQueue((q) =>
        q.map((x) => (x.id === item.id ? { ...x, status: "error", message: msg } : x))
      );
    }
  };

  const runAll = async () => {
    const pending = queue.filter((x) => x.status === "pending");
    if (pending.length === 0) return;
    setBusy(true);
    for (const p of pending) {
      await processOne(p);
    }
    setBusy(false);
  };

  const removeItem = (id: string) => setQueue((q) => q.filter((x) => x.id !== id));
  const clearDone = () => setQueue((q) => q.filter((x) => x.status !== "done"));

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user || !canUse) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">PDF upload</h1>
            <p className="text-secondary mb-3">Admin or employer sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary btn-sm">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-11">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-0">PDF processor</h1>
            <p className="small text-secondary mb-0">
              <strong>Direct</strong>: <code className="small">POST /api/process/pdf</code> (immediate result).{" "}
              <strong>Agent</strong>: <code className="small">POST /api/agents/process/pdf</code> (202 +{" "}
              <code className="small">task_id</code>).
            </p>
          </div>
          <Link href={isAdmin ? "/admin" : "/"} className="btn btn-outline-secondary btn-sm">
            {isAdmin ? "Admin home" : "Home"}
          </Link>
        </div>

        <div className="row g-4">
          <div className="col-lg-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-3">Settings</h2>
              <label className="form-label small">Pipeline</label>
              <select
                className="form-select form-select-sm mb-3"
                value={pipeline}
                onChange={(e) => setPipeline(e.target.value as "direct" | "agent")}
              >
                <option value="direct">Direct (process API)</option>
                <option value="agent">Agent queue</option>
              </select>
              <label className="form-label small">Document type hint</label>
              <select
                className="form-select form-select-sm"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option value="auto">Auto (omit type)</option>
                <option value="pay_stub">Pay stub</option>
                <option value="bank_statement">Bank statement</option>
              </select>
              <p className="small text-muted mt-2 mb-0">
                API origin: <code className="small">{getApiOrigin()}</code>
              </p>
            </div>
          </div>
          <div className="col-lg-8">
            <div className="form-card">
              <h2 className="h6 fw-bold mb-3">Upload PDFs</h2>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="d-none"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className={`w-100 border border-2 rounded p-5 text-center bg-transparent ${
                  dragOver ? "border-primary bg-primary bg-opacity-10" : "border-secondary"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
              >
                <p className="mb-1 fw-medium">Drop PDFs here or click to select</p>
                <p className="small text-muted mb-0">Multiple files · max size per server config</p>
              </button>

              {queue.length > 0 && (
                <div className="mt-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <span className="small fw-semibold">Queue ({queue.length})</span>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        disabled={busy}
                        onClick={() => setQueue([])}
                      >
                        Clear all
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        disabled={busy}
                        onClick={clearDone}
                      >
                        Clear done
                      </button>
                      <button
                        type="button"
                        className="btn btn-pr-primary btn-sm"
                        disabled={busy || !queue.some((x) => x.status === "pending")}
                        onClick={runAll}
                      >
                        {busy ? "Processing…" : "Process pending"}
                      </button>
                    </div>
                  </div>
                  <ul className="list-group list-group-flush border rounded">
                    {queue.map((item) => (
                      <li key={item.id} className="list-group-item py-3">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="flex-grow-1 min-w-0">
                            <div className="fw-semibold text-truncate">{item.file.name}</div>
                            <div className="small text-muted">
                              {(item.file.size / 1024).toFixed(1)} KB
                            </div>
                            {item.message && (
                              <div
                                className={`small mt-1 ${item.status === "error" ? "text-danger" : "text-success"}`}
                              >
                                {item.message}
                              </div>
                            )}
                            {item.resultPreview && (
                              <pre className="small bg-light p-2 rounded mt-2 mb-0 overflow-auto" style={{ maxHeight: 160 }}>
                                {item.resultPreview}
                                {item.resultPreview.length >= 4000 ? "\n…" : ""}
                              </pre>
                            )}
                          </div>
                          <div className="d-flex flex-column align-items-end gap-1">
                            <span className="badge bg-secondary">{item.status}</span>
                            {item.status === "pending" && !busy && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => processOne(item)}
                              >
                                Run
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={busy && item.status === "uploading"}
                              onClick={() => removeItem(item.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
