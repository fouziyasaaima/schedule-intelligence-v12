"use client";

/** Legacy integration screen intentionally retained only for backwards compatibility.
 * Interactive users authenticate with a Schedule Intelligence session; API keys are
 * created and managed in the Developer area and are never injected into the browser bundle.
 */
export function ConnectScreen() {
  return (
    <div className="auth-loading">
      API connections are managed securely from Developer settings.
    </div>
  );
}
