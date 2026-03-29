"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getApiOrigin, templatesApi } from "@/lib/api";

type GalleryItem = {
  slug: string;
  name: string;
  type: string;
  version: string;
  preview_image: string | null;
  registered: boolean;
  template_id: number | null;
  is_active: boolean | null;
};

export default function TemplateGalleryPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await templatesApi.gallery();
        const list = (res as { templates?: GalleryItem[] }).templates ?? [];
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load gallery");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
            <h1 className="h3 fw-bold mb-2">Template gallery</h1>
            <p className="text-secondary mb-3">Sign in to load templates from the API.</p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const origin = getApiOrigin();

  return (
    <div className="row justify-content-center">
      <div className="col-lg-11">
        <h1 className="h2 fw-bold section-title mb-2">Template gallery</h1>
        <p className="section-subtitle mb-4">
          Folders under <code className="small">template-gallery/</code>; previews are served from the API (
          <code className="small">GET /template-gallery/…</code>).
        </p>
        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        <div className="row g-4">
          {items.map((t) => (
            <div key={t.slug} className="col-md-6 col-xl-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="ratio ratio-4x3 bg-light position-relative">
                  {t.preview_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${origin}${t.preview_image}`}
                      alt=""
                      className="object-fit-contain p-2 w-100 h-100"
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center text-secondary small">
                      No preview
                    </div>
                  )}
                </div>
                <div className="card-body">
                  <h2 className="h6 fw-bold card-title">{t.name}</h2>
                  <p className="small text-secondary mb-2">
                    {t.type} · v{t.version} · <span className="font-monospace">{t.slug}</span>
                  </p>
                  <p className="small mb-0">
                    {t.registered ? (
                      <span className="text-success">Registered</span>
                    ) : (
                      <span className="text-warning">Not in DB — run flask init-templates</span>
                    )}
                    {t.template_id != null && (
                      <span className="text-muted"> · id {t.template_id}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && !err && (
          <p className="text-secondary mt-3">No gallery folders found.</p>
        )}
      </div>
    </div>
  );
}
