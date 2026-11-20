import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, KeyRound, LoaderCircle, Save, UserRound } from "lucide-react";
import { api } from "../../services/api";

type OwnerProfile = {
  name: string;
  email: string;
  phone: string;
  accountStatus: "ACTIVE" | "INACTIVE";
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response
  ) {
    const data = error.response.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
  }
  return fallback;
}

export default function OwnerSettings() {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void api
      .get<ApiResponse<OwnerProfile>>("/owner/profile")
      .then((response) => {
        if (active) setProfile(response.data.data);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(getErrorMessage(cause, "Unable to load account settings."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.patch<ApiResponse<OwnerProfile>>(
        "/owner/profile",
        { name: profile.name.trim(), phone: profile.phone.trim() }
      );
      setProfile(response.data.data);
      setNotice(response.data.message ?? "Account settings saved.");
    } catch (cause: unknown) {
      setError(getErrorMessage(cause, "Unable to save account settings."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="at-page">
        <div className="at-loading" role="status" aria-live="polite">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Loading account settings…
        </div>
      </main>
    );
  }

  return (
    <main className="at-page">
      <header className="at-page-heading">
        <div>
          <p className="at-eyebrow">Owner account</p>
          <h1>Settings</h1>
          <p>Update your basic contact details and password.</p>
        </div>
        <Link className="at-button-secondary" to="/owner/change-password">
          <KeyRound size={17} aria-hidden="true" />
          Change password
        </Link>
      </header>

      {error && (
        <div className="at-alert at-alert-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div className="at-alert at-alert-success" role="status">
          {notice}
        </div>
      )}

      {profile && (
        <form className="at-card max-w-3xl space-y-5" onSubmit={saveProfile}>
          <div className="flex items-center gap-3">
            <span className="at-icon-tile">
              <UserRound size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold">Account details</h2>
              <p className="text-sm text-slate-500">
                Account status: {profile.accountStatus.toLowerCase()}
              </p>
            </div>
          </div>

          <label className="at-form-label">
            Name
            <input
              className="at-input"
              autoComplete="name"
              maxLength={100}
              minLength={2}
              required
              value={profile.name}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
            />
          </label>

          <label className="at-form-label">
            Email
            <input
              className="at-input"
              autoComplete="email"
              readOnly
              value={profile.email}
            />
          </label>

          <label className="at-form-label">
            Mobile number
            <input
              className="at-input"
              autoComplete="tel"
              maxLength={20}
              minLength={7}
              required
              type="tel"
              value={profile.phone}
              onChange={(event) =>
                setProfile({ ...profile, phone: event.target.value })
              }
            />
          </label>

          <button className="at-button-primary" disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle className="animate-spin" size={17} aria-hidden />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            Save settings
          </button>
        </form>
      )}
    </main>
  );
}
