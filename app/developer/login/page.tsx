"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AuthResponse = {
  success?: boolean;
  message?: string;
  role?: string;
};

export default function DeveloperLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (
          !cancelled &&
          response.ok &&
          (data?.role === "DEVELOPER" ||
            data?.user?.role === "DEVELOPER" ||
            data?.session?.role === "DEVELOPER")
        ) {
          router.replace("/developer/creator");
          return;
        }
      } catch {
        // Continue to login screen.
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok || !data.success) {
        setError(data.message || "Developer login failed.");
        return;
      }

      const meResponse = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const meData = await meResponse.json().catch(() => ({}));

      const role =
        meData?.role ||
        meData?.user?.role ||
        meData?.session?.role ||
        data.role;

      if (role !== "DEVELOPER") {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        }).catch(() => undefined);

        setError("This account is not authorized for Developer access.");
        return;
      }

      router.replace("/developer/creator");
      router.refresh();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
          <p className="text-sm text-slate-400">
            Checking developer session...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.15),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.18),transparent_30%)]" />

      <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/10 animate-pulse" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-cyan-400 text-4xl shadow-xl shadow-cyan-500/20">
            👨‍💻
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
            Private Access
          </p>

          <h1 className="text-3xl font-black tracking-tight">
            Developer Login
          </h1>

          <p className="mt-3 text-sm text-slate-400">
            Creator Profile Management
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Developer Username
            </label>

            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3.5 font-bold text-white shadow-lg shadow-cyan-500/10 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Authenticating..." : "Enter Developer Studio →"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs text-slate-500">
          Private developer area • Authorized access only
        </p>
      </div>
    </main>
  );
}