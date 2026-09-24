"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to reset password");
      setMessage("Password updated successfully. You can now sign in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-panel" style={{ margin: "auto" }}>
        <div className="auth-card">
          <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div className="mobile-brand">Schedule Intelligence</div>
            <div className="forecast-orb"><ShieldCheck /></div>
            <h2>Set a new password</h2>
            <p className="auth-sub">Choose a strong password of at least 12 characters.</p>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                minLength={12}
                required
              />
            </label>
            {message && <div className="auth-error">{message}</div>}
            <button type="submit" className="auth-primary" disabled={busy || password.length < 12 || !token}>
              {busy ? "Updating…" : "Update password"} <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<main className="auth-shell" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
