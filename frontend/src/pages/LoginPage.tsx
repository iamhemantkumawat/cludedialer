import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../app/api";
import { useDialer } from "../app/context";
import { BrandLogo } from "../components/BrandLogo";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useDialer();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Enter username and password");
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate("/campaigns", { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="boot-screen boot-screen--login">
      <div className="login-card">
        <div className="login-card__hero">
          <div className="login-card__badge">MagnusBilling Access</div>
          <BrandLogo context="login" subtitle="Sign in with your MagnusBilling account" />
          <p className="login-card__copy">Use your MagnusBilling credentials to access the autodialer portal.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-user">Username</label>
            <input
              id="login-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. hemantpc"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-pass">Password</label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your SIP account password"
            />
          </div>

          <div className="login-form__error">{error}</div>

          <button className="btn btn-primary login-form__submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>

          <div className="login-form__footer">
            Private workspace access for campaigns, contacts, SIP trunks, and live call history.
          </div>
        </form>
      </div>
    </div>
  );
}
