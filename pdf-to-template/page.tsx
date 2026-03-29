"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { processApi } from "@/lib/api";

export default function PdfToTemplate() {
  const { user, loading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleExtractText = async () => {
    if (!file || !user) return;
    setError(null);
    setBusy(true);
    try {
      const data = (await processApi.uploadPdf(file)) as {
        result?: { error?: string; text?: string; [k: string]: unknown };
      };
      const r = data.result;
      if (r && typeof r === "object") {
        if (typeof r.error === "string") {
          setText("");
          setError(r.error);
        } else {
          setText(JSON.stringify(r, null, 2));
        }
      } else {
        setText(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setText("");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-7">
          <div className="form-card">
            <h1 className="h2 fw-bold section-title mb-2">PDF to Template</h1>
            <p className="section-subtitle mb-4">
              PDF processing runs on the PayRight API. Sign in to upload a file to{" "}
              <code className="small">POST /api/process/pdf</code>.
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
      <div className="col-lg-8 col-xl-7">
        <div className="form-card">
          <h1 className="h2 fw-bold section-title mb-2">PDF to Template</h1>
          <p className="section-subtitle mb-4">
            Upload a PDF; the server extracts structured data via the process pipeline.
          </p>

          <div className="mb-3">
            <label className="field-label" htmlFor="pdf-upload">
              Upload PDF
            </label>
            <input
              type="file"
              className="form-control"
              id="pdf-upload"
              accept="application/pdf"
              onChange={handleFileChange}
            />
          </div>

          {error && <div className="alert alert-danger small py-2">{error}</div>}

          <button
            type="button"
            className="btn btn-pr-primary mb-3"
            onClick={handleExtractText}
            disabled={!file || busy}
          >
            {busy ? "Processing…" : "Process PDF"}
          </button>

          {text && (
            <div>
              <h2 className="h4 fw-bold mt-4">Result</h2>
              <textarea className="form-control font-monospace small" rows={14} value={text} readOnly />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
