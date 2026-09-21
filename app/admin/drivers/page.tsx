"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Driver = {
  id: string;
  driverId: string;
  name: string;
  username: string;
  assignedBus: {
    id: string;
    busId: string;
    busNumber: string;
    registration: string;
  } | null;
};

type FormState = {
  id: string;
  driverId: string;
  name: string;
  username: string;
  password: string;
};

const emptyForm: FormState = {
  id: "",
  driverId: "",
  name: "",
  username: "",
  password: "",
};

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDrivers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/drivers", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href = "/admin/login";
          return;
        }

        setError(data.message || "Unable to load drivers.");
        return;
      }

      setDrivers(data.drivers || []);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return drivers;
    }

    return drivers.filter(
      (driver) =>
        driver.driverId.toLowerCase().includes(query) ||
        driver.name.toLowerCase().includes(query) ||
        driver.username.toLowerCase().includes(query) ||
        driver.assignedBus?.busId
          .toLowerCase()
          .includes(query) ||
        driver.assignedBus?.busNumber
          .toLowerCase()
          .includes(query)
    );
  }, [drivers, search]);

  function openAddForm() {
    setForm(emptyForm);
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(driver: Driver) {
    setForm({
      id: driver.id,
      driverId: driver.driverId,
      name: driver.name,
      username: driver.username,
      password: "",
    });

    setError("");
    setMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    const editing = Boolean(form.id);

    if (!editing && form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/drivers", {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href = "/admin/login";
          return;
        }

        setError(data.message || "Unable to save driver.");
        return;
      }

      setMessage(
        editing
          ? "Driver updated successfully."
          : "Driver created successfully."
      );

      setShowForm(false);
      setForm(emptyForm);

      await loadDrivers();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/admin/login";
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-800 px-6 py-6">
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold">
                  BT
                </div>

                <div>
                  <h1 className="font-semibold">
                    Bus Tracking
                  </h1>

                  <p className="text-xs text-slate-400">
                    Administration
                  </p>
                </div>
              </Link>
            </div>

            <nav className="flex-1 px-3 py-5">
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overview
              </div>

              <Link
                href="/admin/dashboard"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                Dashboard
              </Link>

              <div className="mt-1 space-y-1 text-sm">
                <Link
                  href="/admin/buses"
                  className="block rounded-xl px-3 py-2.5 text-slate-300 hover:bg-slate-900"
                >
                  Buses
                </Link>

                <Link
                  href="/admin/drivers"
                  className="block rounded-xl bg-blue-600 px-3 py-2.5 font-medium text-white"
                >
                  Drivers
                </Link>

                {[
                  "Students",
                  "Routes & Stops",
                  "Assignments",
                  "Live Tracking",
                  "Trips",
                  "Notifications",
                  "Emergency",
                  "Reports",
                  "Settings",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl px-3 py-2.5 text-slate-300"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </nav>

            <div className="border-t border-slate-800 p-4">
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Admin Portal
                </p>

                <p className="mt-1 text-sm font-medium">
                  Driver Management
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
              <div>
                <p className="text-sm text-slate-500">
                  Transport Management
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Drivers
                </h2>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h3 className="text-lg font-semibold">
                  Driver Management
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Manage driver accounts and assigned buses.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddForm}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                + Add Driver
              </button>
            </section>

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {error && !showForm && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label
                htmlFor="search"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Search drivers
              </label>

              <input
                id="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Driver ID, name, username or bus"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                <h3 className="font-semibold">
                  Registered Drivers
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {filteredDrivers.length} driver
                  {filteredDrivers.length === 1 ? "" : "s"} shown
                </p>
              </div>

              {loading ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading drivers...
                  </p>
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">
                    DRV
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-700">
                    {drivers.length === 0
                      ? "No drivers registered"
                      : "No matching drivers"}
                  </h4>

                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    {drivers.length === 0
                      ? "Create a driver account to operate an assigned bus."
                      : "Try changing your search."}
                  </p>

                  {drivers.length === 0 && (
                    <button
                      type="button"
                      onClick={openAddForm}
                      className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                    >
                      Add First Driver
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">
                          Driver
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Username
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Assigned Bus
                        </th>

                        <th className="px-6 py-4 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredDrivers.map((driver) => (
                        <tr
                          key={driver.id}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <p className="font-semibold">
                              {driver.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {driver.driverId}
                            </p>
                          </td>

                          <td className="px-6 py-4 text-sm">
                            {driver.username}
                          </td>

                          <td className="px-6 py-4">
                            {driver.assignedBus ? (
                              <div>
                                <p className="text-sm font-semibold">
                                  BUS{" "}
                                  {driver.assignedBus.busNumber}
                                </p>

                                <p className="mt-1 text-xs text-slate-400">
                                  {driver.assignedBus.busId} ·{" "}
                                  {driver.assignedBus.registration}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">
                                Not assigned
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(driver)
                              }
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Driver Management
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {form.id
                    ? "Edit Driver"
                    : "Add New Driver"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 p-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="driverId"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Driver ID
                  </label>

                  <input
                    id="driverId"
                    value={form.driverId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        driverId:
                          event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="DRV-002"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Full Name
                  </label>

                  <input
                    id="name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        name: event.target.value,
                      })
                    }
                    placeholder="Driver name"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Login Username
                </label>

                <input
                  id="username"
                  value={form.username}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      username:
                        event.target.value.toLowerCase(),
                    })
                  }
                  placeholder="driver02"
                  required
                  disabled={saving}
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  {form.id
                    ? "New Password (optional)"
                    : "Password"}
                </label>

                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      password: event.target.value,
                    })
                  }
                  placeholder={
                    form.id
                      ? "Leave blank to keep current password"
                      : "Minimum 8 characters"
                  }
                  required={!form.id}
                  disabled={saving}
                  autoComplete={
                    form.id
                      ? "new-password"
                      : "new-password"
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : form.id
                      ? "Save Changes"
                      : "Create Driver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}