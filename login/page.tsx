"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import LoginAnimatedBackground from "@/components/LoginAnimatedBackground";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (user) {
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) router.push("/");
    else setError(res.error || "Login failed");
  }

  return (
    <>
      <LoginAnimatedBackground />
      <div className="position-relative login-page-foreground py-4 py-md-5">
        <div className="row justify-content-center">
          <div className="col-md-5 col-lg-4">
            <div
              className="card border-0 login-card-glass shadow-lg"
              style={{
                background: "rgba(247, 249, 252, 0.82)",
                backdropFilter: "blur(14px) saturate(1.15)",
                WebkitBackdropFilter: "blur(14px) saturate(1.15)",
                boxShadow:
                  "0 4px 0 rgba(255,255,255,0.5) inset, 0 1px 0 rgba(12,18,34,0.06), 0 24px 48px rgba(12,18,34,0.12), 0 8px 24px rgba(47,94,255,0.08)",
              }}
            >
              <div className="card-body p-4">
                <h1 className="h4 fw-bold mb-1">Sign in</h1>
                <p className="text-secondary small mb-4">
                  Use your PayRight account. API: set{" "}
                  <code className="small">NEXT_PUBLIC_API_URL</code> if not on localhost:5000.
                </p>
                {error && <div className="alert alert-danger py-2 small">{error}</div>}
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
                  <div className="mb-2">
                    <label className="form-label">Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="d-flex justify-content-end mb-3">
                    <Link href="/forgot-password" className="small">
                      Forgot password?
                    </Link>
                  </div>
                  <button type="submit" className="btn btn-pr-primary w-100" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
                <p className="small text-secondary mt-3 mb-2 text-center">
                  No account? <Link href="/register">Register</Link>
                </p>
                <p className="small text-secondary mb-0 text-center lh-sm">
                  <span className="d-block">
                    Sign-in uses your <strong>email address</strong>, not a separate username.
                  </span>
                  <span className="d-block mt-1">
                    If you forgot which email you used, check your inbox for PayRight messages or ask your
                    administrator.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
