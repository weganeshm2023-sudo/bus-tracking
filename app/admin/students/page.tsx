"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type StudentLocation = {
  id: string;
  studentId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  active: boolean;
  updatedAt: string;
};

type Student = {
  id: string;
  studentId: string;
  name: string;
  user: {
    id: string;
    username: string;
  };
  location: StudentLocation | null;
  assignments: Array<{
    id: string;
    bus: {
      busId: string;
      busNumber: string;
      registration: string;
      status: string;
    };
    route: {
      routeId: string;
      name: string;
    };
    stop: {
      stopId: string;
      name: string;
      sequence: number;
    };
  }>;
};

type FormState = {
  studentId: string;
  name: string;
  username: string;
  password: string;
  locationName: string;
  address: string;
  latitude: string;
  longitude: string;
};

const emptyForm: FormState = {
  studentId: "",
  name: "",
  username: "",
  password: "",
  locationName: "",
  address: "",
  latitude: "",
  longitude: "",
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadStudents() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admin/students", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load students.");
      }

      setStudents(data.students ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load students."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return students;
    }

    return students.filter((student) => {
      return (
        student.name.toLowerCase().includes(value) ||
        student.studentId.toLowerCase().includes(value) ||
        student.user.username.toLowerCase().includes(value) ||
        student.location?.name.toLowerCase().includes(value) ||
        student.location?.address?.toLowerCase().includes(value) ||
        student.assignments.some(
          (assignment) =>
            assignment.bus.busId.toLowerCase().includes(value) ||
            assignment.route.name.toLowerCase().includes(value) ||
            assignment.stop.name.toLowerCase().includes(value)
        )
      );
    });
  }, [students, search]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startEdit(student: Student) {
    setEditingId(student.id);

    setForm({
      studentId: student.studentId,
      name: student.name,
      username: student.user.username,
      password: "",
      locationName: student.location?.name ?? "",
      address: student.location?.address ?? "",
      latitude:
        student.location?.latitude !== undefined
          ? String(student.location.latitude)
          : "",
      longitude:
        student.location?.longitude !== undefined
          ? String(student.location.longitude)
          : "",
    });

    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const endpoint = "/api/admin/students";

      const payload = editingId
        ? {
            id: editingId,
            ...form,
          }
        : form;

      const response = await fetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to save student.");
      }

      setMessage(data.message || "Student saved successfully.");
      setEditingId(null);
      setForm(emptyForm);

      await loadStudents();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save student."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteStudentLocation(student: Student) {
    if (!student.location) {
      return;
    }

    const confirmed = window.confirm(
      `Remove the saved location for ${student.name} (${student.studentId})?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const response = await fetch("/api/admin/students", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: student.id,
          deleteLocation: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to remove student location.");
      }

      setMessage(data.message || "Student location removed successfully.");

      if (editingId === student.id) {
        setForm((current) => ({
          ...current,
          locationName: "",
          address: "",
          latitude: "",
          longitude: "",
        }));
      }

      await loadStudents();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to remove student location."
      );
    }
  }

  async function deleteStudent(student: Student) {
    const confirmed = window.confirm(
      `Delete ${student.name} (${student.studentId})?\n\nThis will also remove the student's login account and saved location.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");
      setError("");

      const response = await fetch("/api/admin/students", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: student.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete student.");
      }

      setMessage(data.message || "Student deleted successfully.");

      if (editingId === student.id) {
        cancelEdit();
      }

      await loadStudents();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete student."
      );
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    window.location.href = "/admin/login";
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
                  <h1 className="font-semibold">Bus Tracking</h1>
                  <p className="text-xs text-slate-400">Administration</p>
                </div>
              </Link>
            </div>

            <nav className="flex-1 px-3 py-5">
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overview
              </div>

              <NavLink href="/admin/dashboard">Dashboard</NavLink>
              <NavLink href="/admin/buses">Buses</NavLink>
              <NavLink href="/admin/drivers">Drivers</NavLink>
              <NavLink href="/admin/routes">Routes & Stops</NavLink>

              <div className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operations
              </div>

              <NavLink href="/admin/assignments">Assignments</NavLink>
              <NavLink href="/admin/students" active>
                Students
              </NavLink>
              <NavLink href="/admin/live-tracking">Live Tracking</NavLink>
              <NavLink href="/admin/trips">Trips</NavLink>
              <NavLink href="/admin/notifications">
                Notifications
              </NavLink>
              <NavLink href="/admin/emergency">Emergency</NavLink>
              <NavLink href="/admin/reports">Reports</NavLink>
              <NavLink href="/admin/settings">Settings</NavLink>
            </nav>

            <div className="border-t border-slate-800 p-4">
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-xs text-slate-500">Administrator</p>
                <p className="mt-1 text-sm font-medium">
                  Bus Tracking Admin
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
                  Students
                </h2>
              </div>

              <button
                type="button"
                onClick={logout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-6">
                <p className="text-sm font-medium text-blue-600">
                  Student Management
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {editingId ? "Edit Student" : "Add Student"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Create and manage student accounts and their individual
                  pickup locations.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field
                    label="Student ID"
                    placeholder="STU-0002"
                    value={form.studentId}
                    onChange={(value) => updateField("studentId", value)}
                  />

                  <Field
                    label="Student Name"
                    placeholder="Arun Kumar"
                    value={form.name}
                    onChange={(value) => updateField("name", value)}
                  />

                  <Field
                    label="Username"
                    placeholder="student02"
                    value={form.username}
                    onChange={(value) => updateField("username", value)}
                  />

                  <Field
                    label={
                      editingId ? "New Password (optional)" : "Password"
                    }
                    placeholder={
                      editingId ? "Leave blank to keep current" : "••••••••"
                    }
                    type="password"
                    value={form.password}
                    onChange={(value) => updateField("password", value)}
                  />
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                  <div className="mb-5">
                    <p className="text-sm font-semibold text-blue-700">
                      📍 Individual Student Location
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      This location is used as the student&apos;s individual
                      pickup point on the live tracking map.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field
                      label="Location Name"
                      placeholder="Poovandhi Home"
                      value={form.locationName}
                      onChange={(value) =>
                        updateField("locationName", value)
                      }
                    />

                    <Field
                      label="Address"
                      placeholder="Poovandhi, Sivaganga"
                      value={form.address}
                      onChange={(value) => updateField("address", value)}
                    />

                    <Field
                      label="Latitude"
                      placeholder="9.866123"
                      type="number"
                      value={form.latitude}
                      onChange={(value) => updateField("latitude", value)}
                    />

                    <Field
                      label="Longitude"
                      placeholder="78.123456"
                      type="number"
                      value={form.longitude}
                      onChange={(value) =>
                        updateField("longitude", value)
                      }
                    />
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    Example: Latitude must be between -90 and 90. Longitude
                    must be between -180 and 180.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Update Student"
                        : "Create Student"}
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    Student Directory
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {students.length} registered student
                    {students.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="w-full lg:w-80">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search student, ID, location, bus..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {loading ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">
                    STU
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-700">
                    {students.length === 0
                      ? "No students found"
                      : "No matching students"}
                  </h4>

                  <p className="mt-2 text-sm text-slate-500">
                    {students.length === 0
                      ? "Create the first student account above."
                      : "Try another search term."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-left">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">
                          Student
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Login
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Bus
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Route
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Pickup Stop
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Student Location
                        </th>
                        <th className="px-6 py-4 font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map((student) => {
                        const assignment = student.assignments[0];

                        return (
                          <tr
                            key={student.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-6 py-5">
                              <p className="font-semibold">
                                {student.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {student.studentId}
                              </p>
                            </td>

                            <td className="px-6 py-5">
                              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {student.user.username}
                              </span>
                            </td>

                            <td className="px-6 py-5">
                              {assignment ? (
                                <>
                                  <p className="font-medium">
                                    {assignment.bus.busId}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    Bus {assignment.bus.busNumber}
                                  </p>
                                </>
                              ) : (
                                <span className="text-sm text-slate-400">
                                  Not assigned
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-5">
                              {assignment ? (
                                <>
                                  <p className="font-medium">
                                    {assignment.route.name}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    {assignment.route.routeId}
                                  </p>
                                </>
                              ) : (
                                <span className="text-sm text-slate-400">
                                  —
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-5">
                              {assignment ? (
                                <>
                                  <p className="font-medium">
                                    {assignment.stop.name}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    Stop {assignment.stop.sequence}
                                  </p>
                                </>
                              ) : (
                                <span className="text-sm text-slate-400">
                                  Not assigned
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-5">
                              {student.location ? (
                                <div>
                                  <p className="font-medium text-slate-800">
                                    {student.location.name}
                                  </p>

                                  <p className="mt-1 max-w-[230px] truncate text-xs text-slate-400">
                                    {student.location.address ||
                                      "Address not provided"}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {student.location.latitude.toFixed(6)},{" "}
                                    {student.location.longitude.toFixed(6)}
                                  </p>

                                  <span className="mt-2 inline-flex rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                                    Location Saved
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                  Location Not Set
                                </span>
                              )}
                            </td>

                            <td className="px-6 py-5">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(student)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                                >
                                  Edit
                                </button>

                                {student.location && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteStudentLocation(student)
                                    }
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                                  >
                                    Remove Location
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => deleteStudent(student)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function NavLink({
  href,
  children,
  active = false,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`mt-1 block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-300 hover:bg-slate-900 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        step={type === "number" ? "any" : undefined}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}