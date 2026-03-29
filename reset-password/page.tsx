"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { authApi } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword(token.trim(), password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="alert alert-success small mb-0">
        Password updated. Redirecting to sign in…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-3">
        <label className="form-label">Reset token</label>
        <input
          type="text"
          className="form-control font-monospace small"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          placeholder="Paste token from email or link"
          autoComplete="off"
        />
        <p className="form-text small mb-0">Usually filled automatically when you open the link from your email.</p>
      </div>
      <div className="mb-3">
        <label className="form-label">New password</label>
        <input
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <div className="mb-3">
        <label className="form-label">Confirm password</label>
        <input
          type="password"
          className="form-control"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
      <button type="submit" className="btn btn-pr-primary w-100" disabled={busy}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="row justify-content-center py-5">
      <div className="col-md-5">
        <div className="form-card">
          <h1 className="h4 fw-bold mb-1">Set new password</h1>
          <p className="text-secondary small mb-4">Choose a new password for your account.</p>
          <Suspense fallback={<p className="text-secondary small">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
          <p className="small text-secondary mt-3 mb-0 text-center">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
