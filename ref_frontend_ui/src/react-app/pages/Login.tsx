import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import { useAuth } from "@/react-app/context/AuthContext";
import { useLanguage } from "@/react-app/context/LanguageContext";

const REMEMBERED_USERNAME_KEY = "cx_remembered_username";

export default function Login() {
  const { user, login, loading, error, clearError } = useAuth();
  const { t } = useLanguage();
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBERED_USERNAME_KEY) || "";
    if (remembered) {
      setSipUsername(remembered);
      setRememberMe(true);
    }
  }, []);

  if (user) {
    return <Navigate to={user.is_admin ? "/admin" : "/"} replace />;
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await login(sipUsername.trim(), sipPassword);
      if (rememberMe && sipUsername.trim()) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, sipUsername.trim());
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
    } catch {
      // handled in context
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;

  return (
    <div className="cx-loader-bg min-h-screen relative overflow-hidden [font-family:'Plus_Jakarta_Sans',Inter,ui-sans-serif,system-ui,sans-serif]">
      <div className="cx-loader-orb cx-loader-orb-a" />
      <div className="cx-loader-orb cx-loader-orb-b" />

      <div className="relative z-10 min-h-screen px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10">
            <img
              src="/logo_custom1.png"
              alt="CyberX Calls"
              className="h-12 w-auto object-contain"
            />
          </div>

          <Card className="w-full border border-slate-200 bg-white/95 backdrop-blur-sm shadow-xl rounded-2xl">
            <CardHeader className="pb-4 text-center">
              <CardTitle className="text-2xl font-semibold tracking-[-0.01em] text-slate-900">
                {t("login.title")}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {t("login.subtitle")}
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="sip-username" className="text-slate-700">
                    {t("login.username")}
                  </Label>
                  <Input
                    id="sip-username"
                    value={sipUsername}
                    onChange={(event) => setSipUsername(event.target.value)}
                    placeholder={t("login.usernamePlaceholder")}
                    required
                    autoComplete="username"
                    disabled={busy}
                    className="h-11 bg-[#f9f8f4] border-slate-200 focus-visible:ring-red-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sip-password" className="text-slate-700">
                    {t("login.password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="sip-password"
                      type={showPassword ? "text" : "password"}
                      value={sipPassword}
                      onChange={(event) => setSipPassword(event.target.value)}
                      placeholder={t("login.passwordPlaceholder")}
                      required
                      autoComplete="current-password"
                      disabled={busy}
                      className="pr-10 h-11 bg-[#f9f8f4] border-slate-200 focus-visible:ring-red-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                      aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      disabled={busy}
                      className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    {t("login.rememberMe")}
                  </label>
                  <span className="text-sm font-medium text-red-600">
                    {t("login.forgotPassword")}
                  </span>
                </div>

                {error ? (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="w-full h-11 !bg-red-600 hover:!bg-red-700 !text-white text-base font-semibold shadow-sm disabled:!bg-red-300 disabled:!text-white"
                  disabled={busy}
                >
                  {busy ? t("login.signingIn") : t("login.signIn")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
