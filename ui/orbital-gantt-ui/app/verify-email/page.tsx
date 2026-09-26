"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, ArrowRight } from "lucide-react";

function VerifyEmailContent() {
  const params = useSearchParams();
  const [state, setState] = useState("Verifying your email…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("This verification link is incomplete.");
      return;
    }

    fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        setOk(response.ok);
        setState(
          response.ok
            ? "Your email is verified. Your Schedule Intelligence workspace is ready."
            : (body.error || "This link is invalid or expired.")
        );
      })
      .catch(() => setState("We could not complete verification. Please try again."));
  }, [params]);

  return (
    <main className="auth-shell">
      <div className="auth-panel" style={{ margin: "auto" }}>
        <div className="auth-card">
          <div className="mobile-brand">Schedule Intelligence</div>
          <div className="forecast-orb"><ShieldCheck /></div>
          <h2>{ok ? "Email verified" : "Email verification"}</h2>
          <p className="auth-sub">{state}</p>
          <button className="auth-primary" onClick={() => { location.href = "/"; }}>
            Continue to Schedule Intelligence <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmail() {
  return (
    <Suspense fallback={<main className="auth-shell" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
