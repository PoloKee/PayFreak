"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { randomRegisterFormValues } from "@/lib/formRandomFill";

export default function RegisterPage() {
  const { register, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("employee");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (user) {
    return null;
  }

  function fillRandomDemoData() {
    setError(null);
    const d = randomRegisterFormValues();
    setFirstName(d.firstName);
    setLastName(d.lastName);
    setEmail(d.email);
    setPassword(d.password);
    setConfirmPassword(d.confirmPassword);
    setAddressLine1(d.addressLine1);
    setCity(d.city);
    setState(d.state);
    setZipCode(d.zipCode);
    setPhone(d.phone);
    setRole(d.role);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const res = await register({
      email,
      password,
      role,
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      address_line1: addressLine1.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      zip_code: zipCode.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Registration failed");
      return;
    }
    if (role === "employee") router.push("/portal/employee");
    else router.push("/");
  }

  return (
    <div className="row justify-content-center py-5">
      <div className="col-md-8 col-lg-6">
        <div className="card shadow-sm border-0">
          <div className="card-body p-4 p-md-5">
            <h1 className="h4 fw-bold mb-1">Create account</h1>
            <p className="text-secondary small mb-4">
              Employee registrations create a linked employee profile for pay stubs. Choose employer or admin only if
              your deployment allows it.
            </p>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <div className="d-flex justify-content-end mb-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={fillRandomDemoData}
              >
                Fill with random demo data
              </button>
            </div>
            <form onSubmit={onSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">First name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Last name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="mt-3">
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
              <div className="row g-3 mt-0">
                <div className="col-md-6 mt-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div className="col-md-6 mt-3">
                  <label className="form-label">Confirm password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="form-label">Address line 1</label>
                <input
                  type="text"
                  className="form-control"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  autoComplete="street-address"
                />
              </div>
              <div className="row g-3">
                <div className="col-md-6 mt-3">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                  />
                </div>
                <div className="col-md-3 mt-3">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-control"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    autoComplete="address-level1"
                  />
                </div>
                <div className="col-md-3 mt-3">
                  <label className="form-label">ZIP</label>
                  <input
                    type="text"
                    className="form-control"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    autoComplete="postal-code"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="form-label">Phone (optional)</label>
                <input
                  type="tel"
                  className="form-control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="mt-3">
                <label className="form-label">Role</label>
                <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="employee">Employee</option>
                  <option value="employer">Employer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-pr-primary w-100 mt-4" disabled={busy}>
                {busy ? "Creating…" : "Register"}
              </button>
            </form>
            <p className="small text-secondary mt-3 mb-0 text-center">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
