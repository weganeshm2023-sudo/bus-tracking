"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  tripId: string | null;
  read: boolean;
  createdAt: string;
  student: {
    id: string;
    studentId: string;
    name: string;
    active: boolean;
  };
};

type NotificationsResponse = {
  success: boolean;
  message?: string;
  notifications?: NotificationItem[];
  meta?: {
    total: number;
    unread: number;
    read: number;
  };
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTypeLabel(type: string) {
  return type
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function getTypeClass(type: string) {
  const normalized = type.toUpperCase();

  if (
    normalized.includes("EMERGENCY") ||
    normalized.includes("DANGER")
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (
    normalized.includes("ARRIVAL") ||
    normalized.includes("NEAR") ||
    normalized.includes("PROXIMITY")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    normalized.includes("BOARD") ||
    normalized.includes("START")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function getTypeIcon(type: string) {
  const normalized = type.toUpperCase();

  if (
    normalized.includes("EMERGENCY") ||
    normalized.includes("DANGER")
  ) {
    return "??";
  }

  if (
    normalized.includes("ARRIVAL") ||
    normalized.includes("NEAR") ||
    normalized.includes("PROXIMITY")
  ) {
    return "??";
  }

  if (
    normalized.includes("BOARD") ||
    normalized.includes("START")
  ) {
    return "??";
  }

  return "??";
}

export default function NotificationsPage() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshing, setRefreshing] =
    useState(false);

  const [filter, setFilter] =
    useState<"ALL" | "UNREAD" | "READ">(
      "ALL"
    );

  const loadNotifications =
    useCallback(async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await fetch(
          "/api/admin/notifications",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data =
          (await response.json()) as NotificationsResponse;

        if (response.status === 401) {
          window.location.href =
            "/admin/login";
          return;
        }

        if (response.status === 403) {
          setError(
            "Admin access required."
          );
          return;
        }

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              "Unable to load notifications."
          );
        }

        setNotifications(
          data.notifications ?? []
        );
      } catch (err) {
        console.error(
          "[ADMIN NOTIFICATIONS]",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load notifications."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, []);

  useEffect(() => {
    loadNotifications();

    const interval = window.setInterval(
      () => {
        loadNotifications(true);
      },
      15000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  const filteredNotifications =
    useMemo(() => {
      if (filter === "UNREAD") {
        return notifications.filter(
          (notification) =>
            !notification.read
        );
      }

      if (filter === "READ") {
        return notifications.filter(
          (notification) =>
            notification.read
        );
      }

      return notifications;
    }, [notifications, filter]);

  const totalCount =
    notifications.length;

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.read
    ).length;

  const readCount =
    totalCount - unreadCount;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-500">
              <span>Admin</span>
              <span>/</span>
              <span>Notifications</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Notifications
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              Monitor notifications generated
              for students during bus trips.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadNotifications(true)
            }
            disabled={refreshing}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing
              ? "Refreshing..."
              : "? Refresh"}
          </button>
        </div>

        {/* Summary */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total Notifications
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {totalCount}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-amber-700">
              Unread
            </p>

            <p className="mt-2 text-3xl font-bold text-amber-900">
              {unreadCount}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">
              Read
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-900">
              {readCount}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["ALL", "All"],
              ["UNREAD", "Unread"],
              ["READ", "Read"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setFilter(value)
              }
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filter === value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />

            <p className="text-sm text-slate-600">
              Loading notifications...
            </p>
          </div>
        ) : filteredNotifications.length ===
          0 ? (
          /* Empty */
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="text-4xl">
              ??
            </div>

            <h2 className="mt-4 text-lg font-bold text-slate-900">
              No notifications
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              There are no notifications matching
              the current filter.
            </p>
          </div>
        ) : (
          /* Notification list */
          <div className="space-y-3">
            {filteredNotifications.map(
              (notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                    notification.read
                      ? "border-slate-200"
                      : "border-blue-200 ring-1 ring-blue-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                        {getTypeIcon(
                          notification.type
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-bold text-slate-900">
                            {notification.title}
                          </h2>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getTypeClass(
                              notification.type
                            )}`}
                          >
                            {getTypeLabel(
                              notification.type
                            )}
                          </span>

                          {!notification.read && (
                            <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                              Unread
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {notification.message}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                          <span>
                            ?????{" "}
                            <strong className="text-slate-700">
                              {
                                notification
                                  .student
                                  .name
                              }
                            </strong>
                          </span>

                          <span>
                            ID:{" "}
                            <strong className="text-slate-700">
                              {
                                notification
                                  .student
                                  .studentId
                              }
                            </strong>
                          </span>

                          {notification.tripId && (
                            <span>
                              Trip:{" "}
                              <strong className="text-slate-700">
                                {
                                  notification.tripId
                                }
                              </strong>
                            </span>
                          )}

                          <span>
                            {formatDateTime(
                              notification.createdAt
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
                          notification.student
                            .active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {notification.student
                          .active
                          ? "Student Active"
                          : "Student Inactive"}
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}
