import Link from "next/link";
import ApiStatusStrip from "@/components/ApiStatusStrip";

export default function Home() {
  return (
    <div className="row justify-content-center">
      <div className="col-lg-10">
        <section className="hero-card">
          <div className="row g-4 align-items-center">
            <div className="col-md-7">
              <p className="text-uppercase fw-semibold text-primary mb-1 small">
                Payroll + Statement Generator
              </p>
              <p className="text-muted mb-2 small" style={{ letterSpacing: "0.06em" }}>
                PayRight by NTS Designs · A Tech Corp.
              </p>
              <h1 className="display-5 fw-bold section-title mb-3">
                Create professional paycheck stubs and bank statements in minutes.
              </h1>
              <p className="section-subtitle fs-5 mb-4">
                Fill payroll forms in the app—PayRight calculates dates, YTD (weekly, biweekly, semi-monthly,
                monthly, annual), and renders your chosen template. No IDE or hand-edited stub files required;
                add unlimited looks via the template gallery.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <Link href="/paystub" className="btn btn-pr-primary">
                  Generate Pay Stub
                </Link>
                <Link href="/employer" className="btn btn-pr-outline">
                  Set Up Employers
                </Link>
                <Link href="/login" className="btn btn-pr-outline">
                  Sign in
                </Link>
              </div>
            </div>
            <div className="col-md-5">
              <div className="grid-highlight">
                <h2 className="h6 fw-bold mb-3">Quick Navigation</h2>
                <div className="d-grid gap-2">
                  <Link href="/employer" className="btn btn-light border text-start">
                    Add Employer Profile
                  </Link>
                  <Link href="/employee" className="btn btn-light border text-start">
                    Add Employee Record
                  </Link>
                  <Link href="/paystub" className="btn btn-light border text-start">
                    Generate Pay Stub
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4">
          <ApiStatusStrip />
          <div className="d-flex flex-wrap gap-2 small">
            <Link href="/templates/gallery" className="text-decoration-none">
              Template gallery
            </Link>
            <span className="text-muted">·</span>
            <Link href="/portal/employee" className="text-decoration-none">
              Pay stubs portal
            </Link>
            <span className="text-muted">·</span>
            <Link href="/portal/statements" className="text-decoration-none">
              Statements portal
            </Link>
            <span className="text-muted">·</span>
            <Link href="/statement" className="text-decoration-none">
              Bank statement
            </Link>
            <span className="text-muted">·</span>
            <Link href="/admin" className="text-decoration-none">
              Admin
            </Link>
            <span className="text-muted">·</span>
            <Link href="/pdf-to-template" className="text-decoration-none">
              PDF → process
            </Link>
            <span className="text-muted">·</span>
            <Link href="/agent" className="text-decoration-none">
              FinAssist
            </Link>
          </div>
        </section>

        <section className="mt-5 pt-4 border-top">
          <h2 className="h5 fw-bold mb-3">Platform capabilities</h2>
          <div className="row g-3">
            <div className="col-md-4">
              <div className="p-3 rounded border bg-white h-100">
                <h3 className="h6 fw-semibold">Auth &amp; API</h3>
                <p className="small text-secondary mb-0">
                  JWT access + refresh, <code className="small">/api/auth/me</code>, and a typed{" "}
                  <code className="small">lib/api.ts</code> client for the Next.js app.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 rounded border bg-white h-100">
                <h3 className="h6 fw-semibold">Documents</h3>
                <p className="small text-secondary mb-0">
                  Pay stubs and bank statements with HTML/JSON/PDF paths; download via query or path{" "}
                  <code className="small">/download/pdf</code>.
                </p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="p-3 rounded border bg-white h-100">
                <h3 className="h6 fw-semibold">Templates &amp; agents</h3>
                <p className="small text-secondary mb-0">
                  Gallery sync (<code className="small">flask init-templates</code>), field registry, and{" "}
                  <code className="small">/api/agents</code> orchestration endpoints.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

