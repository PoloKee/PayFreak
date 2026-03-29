"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { agentsApi, monitoringApi, OPENAPI_SPEC_URL } from "@/lib/api";

export default function AdminMonitoringPage() {
  const { user, loading, isAdmin } = useAuth();
  const [health, setHealth] = useState<unknown>(null);
  const [ready, setReady] = useState<unknown>(null);
  const [system, setSystem] = useState<unknown>(null);
  const [db, setDb] = useState<unknown>(null);
  const [agents, setAgents] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setErr(null);
      try {
        const [h, r] = await Promise.all([monitoringApi.health(), monitoringApi.ready()]);
        if (!c) {
          setHealth(h);
          setReady(r);
        }
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Health check failed");
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const loadAdminMetrics = useCallback(async () => {
    if (!isAdmin) return;
    setErr(null);
    try {
      const [sys, dbs, ag] = await Promise.all([
        monitoringApi.system(),
        monitoringApi.database(),
        agentsApi.getStatus(),
      ]);
      setSystem(sys);
      setDb(dbs);
      setAgents(ag);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load admin metrics");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (user && isAdmin) loadAdminMetrics();
    else {
      setSystem(null);
      setDb(null);
      setAgents(null);
    }
  }, [user, isAdmin, loadAdminMetrics]);

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-xl-10">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-1">Monitoring</h1>
            <p className="section-subtitle small mb-0">
              Liveness/readiness (public), plus CPU/memory/disk and DB status for admins.
            </p>
          </div>
          <Link href="/admin" className="btn btn-outline-secondary btn-sm">
            ← Admin home
          </Link>
        </div>

        {err && <div className="alert alert-warning py-2 small mb-3">{err}</div>}

        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">GET /api/monitoring/health</h2>
              <pre className="small bg-light p-2 rounded mb-0 overflow-auto" style={{ maxHeight: 160 }}>
                {health != null ? JSON.stringify(health, null, 2) : "—"}
              </pre>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">GET /api/monitoring/ready</h2>
              <pre className="small bg-light p-2 rounded mb-0 overflow-auto" style={{ maxHeight: 160 }}>
                {ready != null ? JSON.stringify(ready, null, 2) : "—"}
              </pre>
            </div>
          </div>
        </div>

        {!isAdmin && (
          <p className="small text-secondary">Sign in as admin to load system metrics and agent status.</p>
        )}

        {isAdmin && (
          <>
            <div className="form-card mb-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 fw-bold mb-0">Admin metrics</h2>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => loadAdminMetrics()}>
                  Refresh
                </button>
              </div>
              <h3 className="small text-muted mb-1">/api/monitoring/system</h3>
              <pre className="small bg-light p-2 rounded mb-3 overflow-auto" style={{ maxHeight: 220 }}>
                {system != null ? JSON.stringify(system, null, 2) : "—"}
              </pre>
              <h3 className="small text-muted mb-1">/api/monitoring/database</h3>
              <pre className="small bg-light p-2 rounded mb-3 overflow-auto" style={{ maxHeight: 120 }}>
                {db != null ? JSON.stringify(db, null, 2) : "—"}
              </pre>
              <h3 className="small text-muted mb-1">/api/agents/status</h3>
              <pre className="small bg-light p-2 rounded mb-0 overflow-auto" style={{ maxHeight: 220 }}>
                {agents != null ? JSON.stringify(agents, null, 2) : "—"}
              </pre>
            </div>

            <div className="form-card">
              <h2 className="h6 fw-bold mb-2">OpenAPI</h2>
              <p className="small text-secondary mb-2">
                Spec URL:{" "}
                <a href={OPENAPI_SPEC_URL} target="_blank" rel="noreferrer">
                  {OPENAPI_SPEC_URL}
                </a>
              </p>
              <p className="small text-secondary mb-0">
                Open in{" "}
                <a href="https://editor.swagger.io/" target="_blank" rel="noreferrer">
                  Swagger Editor
                </a>{" "}
                (File → Import URL).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
