import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { isAxiosError } from "axios";

import { api } from "../../services/api";

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? "Could not change your password.";
  }

  return error instanceof Error
    ? error.message
    : "Could not change your password.";
}

export default function OwnerChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (newPassword.length < 10 || newPassword.length > 72) {
      setError("New password must contain between 10 and 72 characters.");
      return;
    }

    if (new TextEncoder().encode(newPassword).length > 72) {
      setError("New password must be no more than 72 bytes.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    try {
      setSaving(true);
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed successfully.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-50 disabled:bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/owner/settings" className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-600 p-3 text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold">AquaTrail</h1>
              <p className="text-xs text-slate-500">Owner account security</p>
            </div>
          </Link>

          <Link
            to="/owner/settings"
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            <ArrowLeft size={16} />
            Settings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-3xl bg-gradient-to-r from-sky-800 to-cyan-500 p-6 text-white sm:p-8">
          <p className="text-xs font-bold tracking-widest">OWNER ACCOUNT</p>
          <h2 className="mt-2 text-3xl font-extrabold">Change password</h2>
          <p className="mt-2 text-sm text-sky-50">
            Verify your current password before choosing a new one.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-sm font-semibold text-slate-700">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={72}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
                disabled={saving}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Use at least 10 characters; passwords are limited to 72 bytes.
              </span>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              <LockKeyhole size={17} />
              {saving ? "Updating password..." : "Update password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
