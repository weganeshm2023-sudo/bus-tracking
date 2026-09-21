"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type BusStatus =
  | "WAITING"
  | "RUNNING"
  | "EMERGENCY"
  | "OFFLINE"
  | "INACTIVE";

type Bus = {
  id: string;
  busId: string;
  busNumber: string;
  registration: string;
  status: BusStatus;
  driver: {
    driverId: string;
    name: string;
  } | null;
  studentCount: number;
};

type FormState = {
  id: string;
  busId: string;
  busNumber: string;
  registration: string;
  status: BusStatus;
};

const emptyForm: FormState = {
  id: "",
  busId: "",
  busNumber: "",
  registration: "",
  status: "WAITING",
};

const statusOptions: BusStatus[] = [
  "WAITING",
  "RUNNING",
  "EMERGENCY",
  "OFFLINE",
  "INACTIVE",
];

export default function AdminBusesPage() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | BusStatus>(
    "ALL"
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadBuses() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/buses", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "/admin/login";
          return;
        }

        setError(data.message || "Unable to load buses.");
        return;
      }

      setBuses(data.buses || []);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBuses();
  }, []);

  const filteredBuses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return buses.filter((bus) => {
      const matchesSearch =
        !query ||
        bus.busId.toLowerCase().includes(query) ||
        bus.busNumber.toLowerCase().includes(query) ||
        bus.registration.toLowerCase().includes(query) ||
        bus.driver?.name.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || bus.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [buses, search, statusFilter]);

  function openAddForm() {
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEditForm(bus: Bus) {
    setForm({
      id: bus.id,
      busId: bus.busId,
      busNumber: bus.busNumber,
      registration: bus.registration,
      status: bus.status,
    });

    setMessage("");
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    const editing = Boolean(form.id);

    try {
      const response = await fetch("/api/admin/buses", {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "/admin/login";
          return;
        }

        setError(data.message || "Unable to save bus.");
        return;
      }

      setMessage(
        editing
          ? "Bus updated successfully."
          : "Bus created successfully."
      );

      setShowForm(false);
      setForm(emptyForm);

      await loadBuses();
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
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-800 px-6 py-6">
              <Link href="/admin/dashboard" className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold">
                  BT
                </div>

                <div>
                  <h1 className="font-semibold">Bus Tracking</h1>
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
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900"
              >
                Dashboard
              </Link>

              <div className="mt-1 space-y-1 text-sm">
                <Link
                  href="/admin/buses"
                  className="block rounded-xl bg-blue-600 px-3 py-2.5 font-medium text-white"
                >
                  Buses
                </Link>

                {[
                  "Drivers",
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
                <p className="text-xs text-slate-500">Admin Portal</p>
                <p className="mt-1 text-sm font-medium text-white">
                  Bus Management
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
              <div>
                <p className="text-sm text-slate-500">
                  Transport Management
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Buses
                </h2>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            {/* Header */}
            <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h3 className="text-lg font-semibold">
                  Bus Fleet
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Manage registered buses and their operating status.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddForm}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                + Add Bus
              </button>
            </section>

            {/* Messages */}
            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Filters */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div>
                  <label
                    htmlFor="search"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Search buses
                  </label>

                  <input
                    id="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Bus ID, number, registration or driver"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="statusFilter"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Status
                  </label>

                  <select
                    id="statusFilter"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value as "ALL" | BusStatus
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  >
                    <option value="ALL">All statuses</option>

                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 sm:px-6">
                <div>
                  <h3 className="font-semibold">Registered Buses</h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {filteredBuses.length} bus
                    {filteredBuses.length === 1 ? "" : "es"} shown
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading buses...
                  </p>
                </div>
              ) : filteredBuses.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">
                    BUS
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-700">
                    {buses.length === 0
                      ? "No buses registered"
                      : "No matching buses"}
                  </h4>

                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    {buses.length === 0
                      ? "Add your first bus to start building the transport fleet."
                      : "Try changing your search or status filter."}
                  </p>

                  {buses.length === 0 && (
                    <button
                      type="button"
                      onClick={openAddForm}
                      className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                    >
                      Add First Bus
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">
                          Bus
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Registration
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Driver
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Students
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Status
                        </th>

                        <th className="px-6 py-4 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredBuses.map((bus) => (
                        <tr
                          key={bus.id}
                          className="transition hover:bg-slate-50"
                        >
                          <td className="px-6 py-4">
                            <p className="font-semibold">
                              BUS {bus.busNumber}
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              {bus.busId}
                            </p>
                          </td>

                          <td className="px-6 py-4 text-sm font-medium">
                            {bus.registration}
                          </td>

                          <td className="px-6 py-4">
                            {bus.driver ? (
                              <div>
                                <p className="text-sm font-medium">
                                  {bus.driver.name}
                                </p>

                                <p className="mt-1 text-xs text-slate-400">
                                  {bus.driver.driverId}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">
                                Not assigned
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <span className="font-medium">
                              {bus.studentCount}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <StatusBadge status={bus.status} />
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => openEditForm(bus)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white hover:border-blue-300 hover:text-blue-600"
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

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Bus Management
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {form.id ? "Edit Bus" : "Add New Bus"}
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

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="busId"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Unique Bus ID
                  </label>

                  <input
                    id="busId"
                    value={form.busId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        busId: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="BUS-010"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium uppercase outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
                  />

                  <p className="mt-1.5 text-xs text-slate-400">
                    Permanent backend identity.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="busNumber"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Bus Number
                  </label>

                  <input
                    id="busNumber"
                    value={form.busNumber}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        busNumber: event.target.value,
                      })
                    }
                    placeholder="10"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
                  />

                  <p className="mt-1.5 text-xs text-slate-400">
                    Display number shown to users.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="registration"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Vehicle Registration
                </label>

                <input
                  id="registration"
                  value={form.registration}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      registration: event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="TN 01 AB 1234"
                  required
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="status"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>

                <select
                  id="status"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as BusStatus,
                    })
                  }
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
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
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : form.id
                      ? "Save Changes"
                      : "Create Bus"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function formatStatus(status: BusStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function StatusBadge({ status }: { status: BusStatus }) {
  const config: Record<
    BusStatus,
    {
      label: string;
      className: string;
    }
  > = {
    WAITING: {
      label: "Waiting",
      className:
        "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
    },
    RUNNING: {
      label: "Running",
      className:
        "bg-green-50 text-green-700 ring-green-600/20",
    },
    EMERGENCY: {
      label: "Emergency",
      className:
        "bg-red-50 text-red-700 ring-red-600/20",
    },
    OFFLINE: {
      label: "Offline",
      className:
        "bg-slate-100 text-slate-600 ring-slate-500/20",
    },
    INACTIVE: {
      label: "Inactive",
      className:
        "bg-slate-100 text-slate-600 ring-slate-500/20",
    },
  };

  const item = config[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${item.className}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {item.label}
    </span>
  );
}