"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setDevLink(null);
    setBusy(true);
    try {
      const res = await authApi.forgotPassword(email.trim().toLowerCase());
      setMessage(res.message || "If an account exists for that email, you will receive reset instructions.");
      if (res.dev_reset_link) setDevLink(res.dev_reset_link);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row justify-content-center py-5">
      <div className="col-md-5">
        <div className="form-card">
          <h1 className="h4 fw-bold mb-1">Forgot password</h1>
          <p className="text-secondary small mb-4">
            Enter the email you use to sign in. We will send a reset link when email is configured on the server.
          </p>
          {message && (
            <div className={`alert small mb-3 ${devLink ? "alert-info" : "alert-secondary"}`}>{message}</div>
          )}
          {devLink && (
            <div className="alert alert-warning small mb-3">
              <strong>Development:</strong> SMTP may be off. Open this link to set a new password:{" "}
              <Link href={devLink} className="alert-link text-break d-inline-block">
                reset link
              </Link>
            </div>
          )}
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button type="submit" className="btn btn-pr-primary w-100" disabled={busy}>
              {busy ? "Sending…" : "Send reset instructions"}
            </button>
          </form>
          <p className="small text-secondary mt-3 mb-0 text-center">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
