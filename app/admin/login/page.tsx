"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const errorCode = params.get("error");

    if (errorCode === "invalid-input") {
      setError(
        "Please enter a valid username and password."
      );
    }

    if (errorCode === "invalid-credentials") {
      setError("Invalid username or password.");
    }

    if (errorCode === "unauthorized") {
      setError(
        "You are not authorized to access the admin portal."
      );
    }

    if (errorCode === "server-error") {
      setError(
        "Unable to process login request. Please try again."
      );
    }
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const cleanUsername = username.trim();

    if (!cleanUsername) {
      setError("Please enter your username.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoggingIn(true);

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            username: cleanUsername,
            password,
            role: "ADMIN",
          }),
        }
      );

      const data =
        await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setError(
          data?.message ||
            "Invalid username or password."
        );

        setLoggingIn(false);
        return;
      }

      if (data.user?.role !== "ADMIN") {
        setError(
          "You are not authorized to access the admin portal."
        );

        setLoggingIn(false);
        return;
      }

      window.location.replace(
        "/admin/dashboard"
      );
    } catch (error) {
      console.error(
        "ADMIN_LOGIN_ERROR:",
        error
      );

      setError(
        "Unable to connect to the server. Please make sure the server is running."
      );

      setLoggingIn(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">

          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20">
              <span className="text-2xl font-bold">
                BT
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              Bus Tracking
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Transport Administration Portal
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">

            <div className="mb-7">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                Admin Access
              </p>

              <h2 className="text-2xl font-semibold">
                Sign in to continue
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Manage buses, drivers, students, routes and live tracking.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <form
              method="post"
              action="/api/auth/login"
              onSubmit={handleSubmit}
              className="space-y-5"
            >

              <input
                type="hidden"
                name="role"
                value="ADMIN"
              />

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Username
                </label>

                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                    )
                  }
                  placeholder="Enter admin username"
                  required
                  disabled={loggingIn}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-200"
                >
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Enter your password"
                  required
                  disabled={loggingIn}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingIn
                  ? "Signing in..."
                  : "Sign in securely"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-800 pt-5">
              <p className="text-center text-xs leading-5 text-slate-500">
                Authorized administration access only.
                <br />
                Your session is protected by an HTTP-only secure cookie.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            Bus Tracking System
          </p>

        </div>
      </div>
    </main>
  );
}