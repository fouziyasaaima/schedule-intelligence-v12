"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, ArrowRight } from "lucide-react";

function AcceptInvitationContent() {
  const params = useSearchParams();
  const received = Boolean(params.get("token"));

  return (
    <main className="auth-shell">
      <div className="auth-panel" style={{ margin: "auto" }}>
        <div className="auth-card">
          <div className="mobile-brand">Schedule Intelligence</div>
          <div className="forecast-orb"><ShieldCheck /></div>
          <h2>Organization invitation</h2>
          <p className="auth-sub">
            Your invitation is ready. Continue to Schedule Intelligence to sign in or create an account using the invited email address.
          </p>
          <button className="auth-primary" onClick={() => { location.href = "/"; }}>
            Continue to Schedule Intelligence <ArrowRight size={16} />
          </button>
          <small className="security-note">
            Secure invitation token: {received ? "received" : "missing"}
          </small>
        </div>
      </div>
    </main>
  );
}

export default function AcceptInvitation() {
  return (
    <Suspense fallback={<main className="auth-shell" />}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
