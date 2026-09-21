"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DriverLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password,
          role: "DRIVER",
        }),
      });

      const data = await response.json();

      console.log("LOGIN RESPONSE:", data);

      if (!response.ok || !data.success) {
        setError(data.message || "Login failed.");
        setLoading(false);
        return;
      }

      // Verify that the browser received the session.
      const meResponse = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const meData = await meResponse.json();

      console.log("SESSION AFTER LOGIN:", meData);

      if (
        !meResponse.ok ||
        !meData.success ||
        meData.user?.role !== "DRIVER"
      ) {
        setError(
          "Login successful, but driver session was not created."
        );
        setLoading(false);
        return;
      }

      window.location.href = "/driver/dashboard";
    } catch (error) {
      console.error("DRIVER_LOGIN_ERROR:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to login."
      );

      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl">
              🚌
            </div>

            <h1 className="text-2xl font-bold text-white">
              Driver Login
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Sign in to manage your bus trip
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-5">

            <div>
              <label
                htmlFor="driver-username"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Username
              </label>

              <input
                id="driver-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter username"
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="driver-password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <input
                id="driver-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-blue-500 disabled:opacity-60"
              />
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={
                loading ||
                !username.trim() ||
                !password
              }
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm text-slate-400 hover:text-white"
            >
              ← Back to Home
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
