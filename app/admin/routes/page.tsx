"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Stop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type RouteItem = {
  id: string;
  routeId: string;
  name: string;
  stops: Stop[];
  stopCount: number;
  assignmentCount: number;
  tripCount: number;
};

type RouteForm = {
  id: string;
  routeId: string;
  name: string;
};

type StopForm = {
  id: string;
  stopId: string;
  name: string;
  latitude: string;
  longitude: string;
  sequence: string;
};

const emptyRouteForm: RouteForm = {
  id: "",
  routeId: "",
  name: "",
};

const emptyStopForm: StopForm = {
  id: "",
  stopId: "",
  name: "",
  latitude: "",
  longitude: "",
  sequence: "",
};

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [showRouteForm, setShowRouteForm] = useState(false);
  const [showStopForm, setShowStopForm] = useState(false);

  const [routeForm, setRouteForm] =
    useState<RouteForm>(emptyRouteForm);

  const [stopForm, setStopForm] =
    useState<StopForm>(emptyStopForm);

  const [selectedRoute, setSelectedRoute] =
    useState<RouteItem | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRoutes() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/routes", {
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

        setError(data.message || "Unable to load routes.");
        return;
      }

      setRoutes(data.routes || []);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, []);

  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return routes;
    }

    return routes.filter(
      (route) =>
        route.routeId.toLowerCase().includes(query) ||
        route.name.toLowerCase().includes(query) ||
        route.stops.some((stop) =>
          stop.name.toLowerCase().includes(query)
        )
    );
  }, [routes, search]);

  function openAddRoute() {
    setRouteForm(emptyRouteForm);
    setError("");
    setMessage("");
    setShowRouteForm(true);
  }

  function openEditRoute(route: RouteItem) {
    setRouteForm({
      id: route.id,
      routeId: route.routeId,
      name: route.name,
    });

    setError("");
    setMessage("");
    setShowRouteForm(true);
  }

  function openAddStop(route: RouteItem) {
    setSelectedRoute(route);

    const nextSequence =
      route.stops.length > 0
        ? Math.max(
            ...route.stops.map((stop) => stop.sequence)
          ) + 1
        : 1;

    setStopForm({
      ...emptyStopForm,
      sequence: String(nextSequence),
    });

    setError("");
    setMessage("");
    setShowStopForm(true);
  }

  function openEditStop(
    route: RouteItem,
    stop: Stop
  ) {
    setSelectedRoute(route);

    setStopForm({
      id: stop.id,
      stopId: stop.stopId,
      name: stop.name,
      latitude: String(stop.latitude),
      longitude: String(stop.longitude),
      sequence: String(stop.sequence),
    });

    setError("");
    setMessage("");
    setShowStopForm(true);
  }

  function closeModals() {
    if (saving) return;

    setShowRouteForm(false);
    setShowStopForm(false);
    setSelectedRoute(null);
    setRouteForm(emptyRouteForm);
    setStopForm(emptyStopForm);
    setError("");
  }

  async function handleRouteSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/routes", {
        method: routeForm.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(routeForm),
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

        setError(data.message || "Unable to save route.");
        return;
      }

      setMessage(
        routeForm.id
          ? "Route updated successfully."
          : "Route created successfully."
      );

      setShowRouteForm(false);
      setRouteForm(emptyRouteForm);

      await loadRoutes();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStopSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedRoute) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const latitude = Number(stopForm.latitude);
    const longitude = Number(stopForm.longitude);
    const sequence = Number(stopForm.sequence);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      setError("Please enter valid coordinates.");
      setSaving(false);
      return;
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("Latitude or longitude is outside the valid range.");
      setSaving(false);
      return;
    }

    if (!Number.isInteger(sequence) || sequence < 1) {
      setError("Sequence must be a positive whole number.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/routes/${selectedRoute.id}/stops`,
        {
          method: stopForm.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            id: stopForm.id || undefined,
            stopId: stopForm.stopId,
            name: stopForm.name,
            latitude,
            longitude,
            sequence,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href = "/admin/login";
          return;
        }

        setError(data.message || "Unable to save stop.");
        return;
      }

      setMessage(
        stopForm.id
          ? "Stop updated successfully."
          : "Stop created successfully."
      );

      setShowStopForm(false);
      setStopForm(emptyStopForm);
      setSelectedRoute(null);

      await loadRoutes();
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
                  className="block rounded-xl px-3 py-2.5 text-slate-300 hover:bg-slate-900"
                >
                  Drivers
                </Link>

                <div className="rounded-xl bg-blue-600 px-3 py-2.5 font-medium">
                  Routes & Stops
                </div>

                {[
                  "Students",
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
                  Routes & Stops
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
                  Route Management
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Create routes and manage ordered pickup stops.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddRoute}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                + Add Route
              </button>
            </section>

            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {error && !showRouteForm && !showStopForm && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label
                htmlFor="routeSearch"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Search routes
              </label>

              <input
                id="routeSearch"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Route ID, route name or stop name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </section>

            <section className="space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

                  <p className="mt-4 text-sm text-slate-500">
                    Loading routes...
                  </p>
                </div>
              ) : filteredRoutes.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">
                    ROUTE
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-700">
                    {routes.length === 0
                      ? "No routes registered"
                      : "No matching routes"}
                  </h4>

                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    {routes.length === 0
                      ? "Create a route before assigning buses and students."
                      : "Try another search term."}
                  </p>
                </div>
              ) : (
                filteredRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                            {route.routeId}
                          </span>

                          <h3 className="text-lg font-semibold">
                            {route.name}
                          </h3>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                          <span>
                            {route.stopCount} stops
                          </span>

                          <span>
                            {route.assignmentCount} assignments
                          </span>

                          <span>
                            {route.tripCount} trips
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditRoute(route)
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600"
                        >
                          Edit Route
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openAddStop(route)
                          }
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                        >
                          + Add Stop
                        </button>
                      </div>
                    </div>

                    {route.stops.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm font-medium text-slate-600">
                          No stops added
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Add the first stop to define this route.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="px-6 py-3 font-semibold">
                                #
                              </th>

                              <th className="px-6 py-3 font-semibold">
                                Stop
                              </th>

                              <th className="px-6 py-3 font-semibold">
                                Coordinates
                              </th>

                              <th className="px-6 py-3 text-right font-semibold">
                                Action
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100">
                            {route.stops.map((stop) => (
                              <tr
                                key={stop.id}
                                className="hover:bg-slate-50"
                              >
                                <td className="px-6 py-4">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                                    {stop.sequence}
                                  </span>
                                </td>

                                <td className="px-6 py-4">
                                  <p className="text-sm font-semibold">
                                    {stop.name}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    {stop.stopId}
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-xs text-slate-500">
                                  {stop.latitude.toFixed(6)},{" "}
                                  {stop.longitude.toFixed(6)}
                                </td>

                                <td className="px-6 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEditStop(
                                        route,
                                        stop
                                      )
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
                  </div>
                ))
              )}
            </section>
          </div>
        </section>
      </div>

      {/* Route Modal */}
      {showRouteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Route Management
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {routeForm.id
                    ? "Edit Route"
                    : "Add New Route"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeModals}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleRouteSubmit}
              className="space-y-5 p-6"
            >
              <div>
                <label
                  htmlFor="routeId"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Route ID
                </label>

                <input
                  id="routeId"
                  value={routeForm.routeId}
                  onChange={(event) =>
                    setRouteForm({
                      ...routeForm,
                      routeId:
                        event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="ROUTE-03"
                  required
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="routeName"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Route Name
                </label>

                <input
                  id="routeName"
                  value={routeForm.name}
                  onChange={(event) =>
                    setRouteForm({
                      ...routeForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="Chennai → Tambaram"
                  required
                  disabled={saving}
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
                  onClick={closeModals}
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
                    : routeForm.id
                      ? "Save Changes"
                      : "Create Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stop Modal */}
      {showStopForm && selectedRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  {selectedRoute.routeId}
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {stopForm.id
                    ? "Edit Stop"
                    : "Add Stop"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedRoute.name}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModals}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleStopSubmit}
              className="space-y-5 p-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="stopId"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Stop ID
                  </label>

                  <input
                    id="stopId"
                    value={stopForm.stopId}
                    onChange={(event) =>
                      setStopForm({
                        ...stopForm,
                        stopId:
                          event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="STOP-0301"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sequence"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Sequence
                  </label>

                  <input
                    id="sequence"
                    type="number"
                    min="1"
                    step="1"
                    value={stopForm.sequence}
                    onChange={(event) =>
                      setStopForm({
                        ...stopForm,
                        sequence: event.target.value,
                      })
                    }
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="stopName"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Stop Name
                </label>

                <input
                  id="stopName"
                  value={stopForm.name}
                  onChange={(event) =>
                    setStopForm({
                      ...stopForm,
                      name: event.target.value,
                    })
                  }
                  placeholder="Tambaram"
                  required
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="latitude"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Latitude
                  </label>

                  <input
                    id="latitude"
                    type="number"
                    step="any"
                    value={stopForm.latitude}
                    onChange={(event) =>
                      setStopForm({
                        ...stopForm,
                        latitude: event.target.value,
                      })
                    }
                    placeholder="12.924900"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="longitude"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Longitude
                  </label>

                  <input
                    id="longitude"
                    type="number"
                    step="any"
                    value={stopForm.longitude}
                    onChange={(event) =>
                      setStopForm({
                        ...stopForm,
                        longitude: event.target.value,
                      })
                    }
                    placeholder="80.127800"
                    required
                    disabled={saving}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
                Coordinates are used later for bus-to-stop
                distance calculations and arrival alerts.
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModals}
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
                    : stopForm.id
                      ? "Save Changes"
                      : "Create Stop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}