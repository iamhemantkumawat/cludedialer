import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { webappApi, type CurrencyCode, type WebappUser } from "@/react-app/lib/api";

const FX_FROM_INR: Record<CurrencyCode, number> = {
  INR: 1.0,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0095,
  RUB: 1.1,
};

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  RUB: "₽",
};

function formatBalanceFromInr(balanceInr: number, currency: CurrencyCode): string {
  const safeInr = Number.isFinite(balanceInr) ? balanceInr : 0;
  const fx = FX_FROM_INR[currency] ?? 1.0;
  const converted = safeInr * fx;
  return `${CURRENCY_SYMBOL[currency] ?? currency} ${converted.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface AuthContextValue {
  user: WebappUser | null;
  loading: boolean;
  error: string | null;
  login: (sipUsername: string, sipPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<WebappUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await webappApi.me();
      setUser(response.user);
      setError(null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const response = await webappApi.me();
        if (mounted) {
          setUser(response.user);
          setError(null);
        }
      } catch {
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (sipUsername: string, sipPassword: string) => {
    setLoading(true);
    try {
      const response = await webappApi.login(sipUsername, sipPassword);
      setUser(response.user);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await webappApi.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Logout failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurrency = useCallback(
    async (currency: CurrencyCode) => {
      await webappApi.setCurrency(currency);
      setUser((prev) => {
        if (!prev) return prev;
        const balanceInr = Number.isFinite(Number(prev.balance_inr))
          ? Number(prev.balance_inr)
          : 0;
        return {
          ...prev,
          currency,
          balance_display: formatBalanceFromInr(balanceInr, currency),
        };
      });
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      refreshUser,
      setCurrency,
      clearError,
    }),
    [user, loading, error, login, logout, refreshUser, setCurrency, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
