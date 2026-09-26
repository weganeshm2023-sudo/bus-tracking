"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type DashboardData = {
  success: boolean;

  student: {
    id: string;
    studentId: string;
    name: string;
    voiceName: string;
  };

  assignment: {
    id: string;

    bus: {
      id: string;
      busId: string;
      busNumber: string;
      registration: string;
      status: string;
    };

    route: {
      id: string;
      routeId: string;
      name: string;
    };

    stop: {
      id: string;
      stopId: string;
      name: string;
      latitude: number;
      longitude: number;
      sequence: number;
    };
  } | null;

  trip: {
    id: string;
    tripId: string;
    status: string;
    startedAt: string | null;
  } | null;

  latestLocation: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    recordedAt: string;
  } | null;

  studentTripStatus: {
    status: string;
    boardedAt: string | null;
    missedAt: string | null;
  } | null;

  studentLocation: {
    id: string;
    studentId: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    active: boolean;
    updatedAt: string;
  } | null;

  collegeLocation: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    active: boolean;
    updatedAt: string;
  } | null;

  notifications: {
    id: string;
    type: string;
    title: string;
    message: string;
    tripId: string | null;
    read: boolean;
    createdAt: string;
  }[];
};

type LiveLocation = {
  tripId: string;
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
};

type ProximityPayload = {
  tripId?: string;
  studentId?: string;
  distanceMeters?: number;
  status?: string;
  notificationType?: string;
  message?: string;
};

type StudentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  tripId: string | null;
  read: boolean;
  createdAt: string;
};

type SoundSettings = {
  enabled: boolean;
  volume: number;
  approaching: boolean;
  nearby: boolean;
  arrived: boolean;
};

const StudentMap = dynamic(
  () => import("./StudentMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[380px] items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-4xl">🗺️</div>

          <p className="mt-3 text-sm text-slate-400">
            Live map loading...
          </p>
        </div>
      </div>
    ),
  }
);

const SOCKET_URL = "http://127.0.0.1:4001";

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.8,
  approaching: true,
  nearby: true,
  arrived: true,
};

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function formatDistance(
  distance: number | null
) {
  if (distance === null) {
    return "—";
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distance)} m`;
}

function formatDate(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function gpsQuality(
  accuracy: number | null | undefined
) {
  if (accuracy == null) {
    return "UNKNOWN";
  }

  if (accuracy <= 50) {
    return "GOOD";
  }

  if (accuracy <= 200) {
    return "FAIR";
  }

  return "POOR";
}

function notificationIcon(
  type: string
) {
  if (type === "BUS_APPROACHING") {
    return "🚌";
  }

  if (type === "BUS_NEAR") {
    return "🔔";
  }

  if (type === "BUS_ARRIVING") {
    return "📍";
  }

  if (type === "BUS_STARTED") {
    return "🚍";
  }

  return "🔔";
}

function tamilMessage(
  name: string,
  type: string,
  distance?: number
) {
  const studentName =
    name.trim() || "மாணவரே";

  if (type === "BUS_ARRIVING") {
    return `${studentName}, உங்கள் பஸ் உங்கள் நிறுத்தத்திற்கு வந்துவிட்டது. தயாராக இருங்கள்.`;
  }

  if (
    type === "BUS_NEAR" &&
    typeof distance === "number"
  ) {
    return `${studentName}, உங்கள் பஸ் ${Math.round(distance)} மீட்டர் தொலைவில் உள்ளது. தயாராக இருங்கள்.`;
  }

  if (
    type === "BUS_APPROACHING" &&
    typeof distance === "number"
  ) {
    return `${studentName}, உங்கள் பஸ் ${Math.round(distance)} மீட்டர் தொலைவில் உள்ளது. தயாராக இருங்கள்.`;
  }

  if (type === "BUS_NEAR") {
    return `${studentName}, உங்கள் பஸ் அருகில் வந்துவிட்டது. தயாராக இருங்கள்.`;
  }

  if (type === "BUS_APPROACHING") {
    return `${studentName}, உங்கள் பஸ் உங்கள் நிறுத்தத்தை நோக்கி வருகிறது. தயாராக இருங்கள்.`;
  }

  return null;
}

export default function StudentDashboardPage() {
  const router = useRouter();

  const socketRef =
    useRef<Socket | null>(null);

  const dataRef =
    useRef<DashboardData | null>(null);

  const spokenRef =
    useRef<Set<string>>(new Set());

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const soundSettingsRef =
    useRef<SoundSettings>(
      DEFAULT_SOUND_SETTINGS
    );

  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [connected, setConnected] =
    useState(false);

  const [liveLocation, setLiveLocation] =
    useState<LiveLocation | null>(null);

  const [notifications, setNotifications] =
    useState<StudentNotification[]>([]);

  const [soundSettings, setSoundSettings] =
    useState<SoundSettings>(
      DEFAULT_SOUND_SETTINGS
    );

  const [audioReady, setAudioReady] =
    useState(false);

  const [voiceStatus, setVoiceStatus] =
    useState(
      "Voice not tested yet."
    );

  const [now, setNow] =
    useState<number>(Date.now());

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * SOUND SETTINGS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          "student-notification-settings"
        );

      if (saved) {
        const parsed =
          JSON.parse(saved);

        const settings: SoundSettings = {
          enabled:
            parsed.enabled !== false,

          volume:
            typeof parsed.volume === "number"
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    parsed.volume
                  )
                )
              : 0.8,

          approaching:
            parsed.approaching !== false,

          nearby:
            parsed.nearby !== false,

          arrived:
            parsed.arrived !== false,
        };

        setSoundSettings(settings);

        soundSettingsRef.current =
          settings;
      }
    } catch {
      // Keep defaults.
    }
  }, []);

  useEffect(() => {
    soundSettingsRef.current =
      soundSettings;

    try {
      localStorage.setItem(
        "student-notification-settings",
        JSON.stringify(
          soundSettings
        )
      );
    } catch {
      // Ignore storage errors.
    }
  }, [soundSettings]);

  /*
   * ---------------------------------------------------------
   * AUDIO UNLOCK
   * ---------------------------------------------------------
   */

  const unlockAudio =
    useCallback(async () => {
      if (
        typeof window === "undefined"
      ) {
        return null;
      }

      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (!AudioContextClass) {
          return null;
        }

        audioContextRef.current =
          new AudioContextClass();
      }

      const context =
        audioContextRef.current;

      try {
        if (
          context.state ===
          "suspended"
        ) {
          await context.resume();
        }

        setAudioReady(true);

        return context;
      } catch (error) {
        console.error(
          "Audio unlock failed:",
          error
        );

        return null;
      }
    }, []);

  /*
   * ---------------------------------------------------------
   * BEEP
   * ---------------------------------------------------------
   */

  const playBeep =
    useCallback(
      async (
        frequency: number
      ) => {
        const context =
          await unlockAudio();

        if (!context) {
          return;
        }

        const oscillator =
          context.createOscillator();

        const gain =
          context.createGain();

        oscillator.type = "sine";

        oscillator.frequency.value =
          frequency;

        gain.gain.setValueAtTime(
          0,
          context.currentTime
        );

        gain.gain.linearRampToValueAtTime(
          soundSettingsRef.current.volume *
            0.15,
          context.currentTime + 0.03
        );

        gain.gain.linearRampToValueAtTime(
          0,
          context.currentTime + 0.35
        );

        oscillator.connect(gain);

        gain.connect(
          context.destination
        );

        oscillator.start();

        oscillator.stop(
          context.currentTime + 0.35
        );
      },
      [unlockAudio]
    );

  /*
   * ---------------------------------------------------------
   * GET TAMIL VOICE
   * ---------------------------------------------------------
   */

  const getTamilVoice =
    useCallback(() => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      ) {
        return null;
      }

      const voices =
        window.speechSynthesis.getVoices();

      const tamilIndiaVoice =
        voices.find(
          (voice) =>
            voice.lang
              .toLowerCase() ===
            "ta-in"
        );

      if (tamilIndiaVoice) {
        return tamilIndiaVoice;
      }

      const tamilVoice =
        voices.find(
          (voice) =>
            voice.lang
              .toLowerCase()
              .startsWith("ta")
        );

      return tamilVoice ?? null;
    }, []);

  /*
   * ---------------------------------------------------------
   * WAIT FOR BROWSER VOICES
   * ---------------------------------------------------------
   */

  const waitForVoices =
    useCallback(async () => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      ) {
        return [];
      }

      const synth =
        window.speechSynthesis;

      const hasTamilVoice = (
        voices: SpeechSynthesisVoice[]
      ) =>
        voices.some(
          (voice) =>
            voice.lang
              .toLowerCase()
              .replace("_", "-")
              .startsWith("ta")
        );

      let voices =
        synth.getVoices();

      /*
       * Important:
       * Do NOT return merely because English
       * voices loaded. Wait until Tamil voice
       * appears or timeout expires.
       */

      if (
        voices.length > 0 &&
        hasTamilVoice(voices)
      ) {
        return voices;
      }

      voices =
        await new Promise<
          SpeechSynthesisVoice[]
        >((resolve) => {
          let finished = false;

          let timer:
            number | undefined;

          const finish = () => {
            if (finished) {
              return;
            }

            finished = true;

            synth.removeEventListener(
              "voiceschanged",
              handleVoicesChanged
            );

            if (timer !== undefined) {
              window.clearTimeout(timer);
            }

            resolve(
              synth.getVoices()
            );
          };

          const handleVoicesChanged =
            () => {
              const current =
                synth.getVoices();

              if (
                hasTamilVoice(
                  current
                )
              ) {
                finish();
              }
            };

          synth.addEventListener(
            "voiceschanged",
            handleVoicesChanged
          );

          timer =
            window.setTimeout(
              finish,
              4000
            );

          /*
           * Re-check immediately in case
           * the event already fired.
           */

          const current =
            synth.getVoices();

          if (
            hasTamilVoice(current)
          ) {
            finish();
          }
        });

      return voices;
    }, []);

  /*
   * ---------------------------------------------------------
   * SPEAK TAMIL
   * ---------------------------------------------------------
   */

  const speakTamil =
    useCallback(
      async (
        type: string,
        distance?: number
      ) => {
        const settings =
          soundSettingsRef.current;

        if (!settings.enabled) {
          return;
        }

        if (
          type === "BUS_APPROACHING" &&
          !settings.approaching
        ) {
          return;
        }

        if (
          type === "BUS_NEAR" &&
          !settings.nearby
        ) {
          return;
        }

        if (
          type === "BUS_ARRIVING" &&
          !settings.arrived
        ) {
          return;
        }

        const current =
          dataRef.current;

        if (!current) {
          return;
        }

        const name =
          current.student.voiceName?.trim() ||
          current.student.name;

        const text =
          tamilMessage(
            name,
            type,
            distance
          );

        if (!text) {
          return;
        }

        await unlockAudio();

        if (
          type === "BUS_APPROACHING"
        ) {
          await playBeep(660);
        } else if (
          type === "BUS_NEAR"
        ) {
          await playBeep(880);
        } else if (
          type === "BUS_ARRIVING"
        ) {
          await playBeep(1046);
        }

        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window)
        ) {
          setVoiceStatus(
            "Browser Speech Synthesis is not available."
          );

          return;
        }

        const voices =
          await waitForVoices();

        const tamilVoice =
          voices.find(
            (voice) =>
              voice.lang
                .toLowerCase() ===
              "ta-in"
          ) ||
          voices.find(
            (voice) =>
              voice.lang
                .toLowerCase()
                .startsWith("ta")
          );

        if (!tamilVoice) {
          setVoiceStatus(
            "Tamil voice not installed in this browser/Windows."
          );

          console.warn(
            "Tamil voice not found.",
            voices.map(
              (voice) =>
                `${voice.name} (${voice.lang})`
            )
          );

          return;
        }

        const synth =
          window.speechSynthesis;

        synth.cancel();

        const utterance =
          new SpeechSynthesisUtterance(
            text
          );

        utterance.lang =
          "ta-IN";

        utterance.voice =
          tamilVoice;

        utterance.volume =
          settings.volume;

        utterance.rate = 0.88;
        utterance.pitch = 1;

        utterance.onstart = () => {
          setVoiceStatus(
            `Speaking Tamil: ${tamilVoice.name}`
          );
        };

        utterance.onend = () => {
          setVoiceStatus(
            `Tamil voice ready: ${tamilVoice.name}`
          );
        };

        utterance.onerror = (
          event
        ) => {
          console.error(
            "Tamil speech error:",
            event
          );

          setVoiceStatus(
            `Tamil speech error: ${event.error}`
          );
        };

        synth.speak(utterance);
      },
      [
        playBeep,
        unlockAudio,
        waitForVoices,
      ]
    );

  /*
   * ---------------------------------------------------------
   * TEST TAMIL VOICE
   * ---------------------------------------------------------
   */

  const testTamilVoice =
    useCallback(async () => {
      const current =
        dataRef.current;

      if (!current) {
        setVoiceStatus(
          "Student data is not loaded."
        );

        return;
      }

      const context =
        await unlockAudio();

      if (!context) {
        setVoiceStatus(
          "Audio could not be unlocked. Check browser sound permission."
        );

        return;
      }

      /*
       * First play a short beep.
       * This proves browser audio itself is working.
       */

      await playBeep(880);

      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      ) {
        setVoiceStatus(
          "Speech Synthesis is not supported by this browser."
        );

        return;
      }

      const synth =
        window.speechSynthesis;

      /*
       * Wait for Chrome/Edge to load
       * its available voice list.
       */

      const voices =
        await waitForVoices();

      console.log(
        "Available browser voices:",
        voices.map(
          (voice) => ({
            name: voice.name,
            lang: voice.lang,
            localService:
              voice.localService,
          })
        )
      );

      const tamilVoices =
        voices.filter(
          (voice) =>
            voice.lang
              .toLowerCase()
              .startsWith("ta")
        );

      console.log(
        "Tamil voices:",
        tamilVoices.map(
          (voice) => ({
            name: voice.name,
            lang: voice.lang,
            localService:
              voice.localService,
          })
        )
      );

      const tamilVoice =
        tamilVoices.find(
          (voice) =>
            voice.lang
              .toLowerCase() ===
            "ta-in"
        ) ||
        tamilVoices[0];

      if (!tamilVoice) {
        setVoiceStatus(
          "Tamil voice not installed. Beep works, but Tamil Speech Voice is missing."
        );

        console.warn(
          "No Tamil voice available."
        );

        return;
      }

      const name =
        current.student.voiceName?.trim() ||
        current.student.name;

      const text =
        `${name}, உங்கள் பேருந்து எச்சரிக்கை. தயாராக இருங்கள்.`;

      /*
       * Cancel any previous speech.
       */

      synth.cancel();

      /*
       * Small delay helps Chrome/Edge
       * after cancel().
       */

      await new Promise<void>(
        (resolve) => {
          window.setTimeout(
            resolve,
            120
          );
        }
      );

      const utterance =
        new SpeechSynthesisUtterance(
          text
        );

      utterance.lang =
        "ta-IN";

      utterance.voice =
        tamilVoice;

      utterance.volume =
        soundSettingsRef.current.volume;

      utterance.rate = 0.88;
      utterance.pitch = 1;

      utterance.onstart = () => {
        setVoiceStatus(
          `Speaking Tamil using: ${tamilVoice.name} (${tamilVoice.lang})`
        );
      };

      utterance.onend = () => {
        setVoiceStatus(
          `Tamil voice working: ${tamilVoice.name} (${tamilVoice.lang})`
        );
      };

      utterance.onerror = (
        event
      ) => {
        console.error(
          "Tamil voice test error:",
          event
        );

        setVoiceStatus(
          `Tamil voice error: ${event.error}`
        );
      };

      synth.speak(utterance);

      /*
       * Some Chromium versions can keep
       * speechSynthesis paused.
       */

      window.setTimeout(() => {
        if (synth.paused) {
          synth.resume();
        }
      }, 250);
    }, [
      playBeep,
      unlockAudio,
      waitForVoices,
    ]);

  /*
   * ---------------------------------------------------------
   * DASHBOARD API
   * ---------------------------------------------------------
   */

  const loadDashboard =
    useCallback(async () => {
      try {
        setError("");

        const response =
          await fetch(
            "/api/student/dashboard",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
            }
          );

        const result =
          await response.json();

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          router.replace(
            "/student/login"
          );

          return;
        }

        if (
          !response.ok ||
          !result.success
        ) {
          setError(
            result.message ||
              "Dashboard load failed."
          );

          return;
        }

        setData(result);

        dataRef.current =
          result;

        setNotifications(
          result.notifications ||
            []
        );

        if (
          result.latestLocation &&
          result.trip &&
          result.assignment?.bus
        ) {
          setLiveLocation({
            tripId:
              result.trip.id,

            busId:
              result.assignment.bus.id,

            latitude:
              result.latestLocation
                .latitude,

            longitude:
              result.latestLocation
                .longitude,

            accuracy:
              result.latestLocation
                .accuracy,

            speed:
              result.latestLocation
                .speed,

            heading:
              result.latestLocation
                .heading,

            recordedAt:
              result.latestLocation
                .recordedAt,
          });
        } else {
          setLiveLocation(null);
        }
      } catch (err) {
        console.error(err);

        setError(
          "Unable to connect to server."
        );
      } finally {
        setLoading(false);
      }
    }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  /*
   * ---------------------------------------------------------
   * PERIODIC REFRESH
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        void loadDashboard();
      }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadDashboard]);

  /*
   * ---------------------------------------------------------
   * SOCKET.IO
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function connectSocket() {
      try {
        const response =
          await fetch(
            "/api/auth/socket-token",
            {
              credentials: "include",
              cache: "no-store",
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          router.replace(
            "/student/login"
          );

          return;
        }

        if (!mounted) {
          return;
        }

        const socket =
          io(SOCKET_URL, {
            transports: [
              "websocket",
            ],
            auth: {
              token:
                result.token,
            },
          });

        socketRef.current =
          socket;

        socket.on(
          "connect",
          () => {
            if (mounted) {
              setConnected(
                true
              );
            }
          }
        );

        socket.on(
          "disconnect",
          () => {
            if (mounted) {
              setConnected(
                false
              );
            }
          }
        );

        socket.on(
          "connect_error",
          (err) => {
            console.error(
              "Student socket error:",
              err
            );

            if (mounted) {
              setConnected(
                false
              );
            }
          }
        );

        /*
         * LIVE BUS LOCATION
         */

        socket.on(
          "bus:location",
          (
            location: LiveLocation
          ) => {
            const current =
              dataRef.current;

            if (
              !current?.assignment ||
              !current.trip
            ) {
              return;
            }

            if (
              location.busId !==
                current
                  .assignment
                  .bus.id ||
              location.tripId !==
                current.trip.id
            ) {
              return;
            }

            setLiveLocation(
              location
            );
          }
        );

        /*
         * PROXIMITY
         */

        socket.on(
          "student:bus-proximity",
          (
            payload: ProximityPayload
          ) => {
            const current =
              dataRef.current;

            if (!current) {
              return;
            }

            if (
              payload.tripId &&
              current.trip &&
              payload.tripId !==
                current.trip.id
            ) {
              return;
            }

            if (
              payload.studentId &&
              payload.studentId !==
                current.student.id
            ) {
              return;
            }

            if (
              payload.status
            ) {
              setData((old) => {
                if (!old) {
                  return old;
                }

                return {
                  ...old,

                  studentTripStatus:
                    {
                      status:
                        payload.status!,

                      boardedAt:
                        old
                          .studentTripStatus
                          ?.boardedAt ??
                        null,

                      missedAt:
                        old
                          .studentTripStatus
                          ?.missedAt ??
                        null,
                    },
                };
              });
            }

            if (
              payload.notificationType &&
              payload.tripId
            ) {
              const key =
                `${payload.tripId}:${payload.notificationType}`;

              if (
                !spokenRef.current.has(
                  key
                )
              ) {
                spokenRef.current.add(
                  key
                );

                void speakTamil(
                  payload.notificationType,
                  payload.distanceMeters
                );
              }
            }
          }
        );

        /*
         * NOTIFICATION
         */

        socket.on(
          "student:notification",
          (
            notification: StudentNotification
          ) => {
            setNotifications(
              (old) => {
                if (
                  old.some(
                    (item) =>
                      item.id ===
                      notification.id
                  )
                ) {
                  return old;
                }

                return [
                  notification,
                  ...old,
                ].slice(0, 20);
              }
            );
          }
        );

        socket.on(
          "trip:started",
          () => {
            spokenRef.current.clear();

            setLiveLocation(
              null
            );

            void loadDashboard();
          }
        );

        socket.on(
          "trip:completed",
          () => {
            setLiveLocation(
              null
            );

            void loadDashboard();
          }
        );
      } catch (err) {
        console.error(
          "Socket connection failed:",
          err
        );
      }
    }

    void connectSocket();

    return () => {
      mounted = false;

      if (
        socketRef.current
      ) {
        socketRef.current.disconnect();

        socketRef.current =
          null;
      }
    };
  }, [
    loadDashboard,
    router,
    speakTamil,
  ]);

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  async function logout() {
    try {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials: "include",
        }
      );
    } catch {
      // Continue.
    }

    socketRef.current?.disconnect();

    router.replace(
      "/student/login"
    );

    router.refresh();
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="text-5xl">
            🚌
          </div>

          <p className="mt-4 text-slate-400">
            Student dashboard loading...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * ERROR
   * ---------------------------------------------------------
   */

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center">
          <div className="text-4xl">
            ⚠️
          </div>

          <h1 className="mt-4 text-xl font-bold text-white">
            Dashboard load failed
          </h1>

          <p className="mt-2 text-sm text-red-200">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadDashboard()
            }
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const assignment =
    data.assignment;

  /*
   * ---------------------------------------------------------
   * NO ASSIGNMENT
   * ---------------------------------------------------------
   */

  if (!assignment) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <header className="border-b border-white/10 bg-slate-900">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl">
                🚌
              </div>

              <div>
                <h1 className="font-bold">
                  Student Bus Tracking
                </h1>

                <p className="text-xs text-slate-500">
                  Live tracking system
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                logout
              }
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="text-3xl font-bold">
            {data.student.name}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Student ID:{" "}
            {data.student.studentId}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Tamil voice name:{" "}
            {data.student.voiceName}
          </p>

          <div className="mt-8 rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-8">
            <div className="text-4xl">
              🚌
            </div>

            <h2 className="mt-4 text-xl font-bold text-yellow-200">
              Bus assignment இல்லை
            </h2>

            <p className="mt-2 text-sm text-yellow-100/70">
              உங்கள் account-க்கு bus மற்றும்
              pickup stop இன்னும் assign
              செய்யப்படவில்லை.
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * LOCATION
   * ---------------------------------------------------------
   */

  const location =
    liveLocation ??
    (data.latestLocation &&
    data.trip
      ? {
          tripId:
            data.trip.id,

          busId:
            assignment.bus.id,

          latitude:
            data.latestLocation
              .latitude,

          longitude:
            data.latestLocation
              .longitude,

          accuracy:
            data.latestLocation
              .accuracy,

          speed:
            data.latestLocation
              .speed,

          heading:
            data.latestLocation
              .heading,

          recordedAt:
            data.latestLocation
              .recordedAt,
        }
      : null);

  let distanceToStop:
    | number
    | null = null;

  if (location) {
    distanceToStop =
      distanceMeters(
        location.latitude,
        location.longitude,
        assignment.stop.latitude,
        assignment.stop.longitude
      );
  }

  const status =
    data.studentTripStatus
      ?.status ||
    "WAITING";

  /*
   * IMPORTANT:
   * Speed is displayed only when
   * server/driver sends a real speed.
   */

  const speedKmh =
    location?.speed != null &&
    Number.isFinite(
      location.speed
    ) &&
    location.speed >= 0
      ? location.speed * 3.6
      : null;

  const locationTimestamp =
    location?.recordedAt
      ? new Date(
          location.recordedAt
        ).getTime()
      : 0;

  const stale =
    !locationTimestamp ||
    now - locationTimestamp >
      60000;

  const quality =
    gpsQuality(
      location?.accuracy
    );

  const tripRunning =
    data.trip?.status ===
    "RUNNING";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl shadow-lg shadow-blue-900/30">
              🚌
            </div>

            <div>
              <h1 className="font-bold">
                Student Bus Tracking
              </h1>

              <p className="text-xs text-slate-500">
                Live tracking system
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:block ${
                connected
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {connected
                ? "● Realtime Connected"
                : "● Realtime Offline"}
            </span>

            <button
              type="button"
              onClick={
                logout
              }
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* STUDENT */}

        <section className="mb-6">
          <p className="text-sm text-slate-500">
            Welcome
          </p>

          <h2 className="mt-1 text-3xl font-bold">
            {data.student.name}
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Student ID:{" "}
            {data.student.studentId}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Tamil voice name:{" "}
            <span className="text-slate-300">
              {data.student.voiceName}
            </span>
          </p>
        </section>

        {/* BUS CARDS */}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-500">
              Assigned Bus
            </p>

            <p className="mt-2 text-3xl font-bold">
              {assignment.bus.busNumber}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {assignment.bus.registration}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-500">
              Route
            </p>

            <p className="mt-2 text-xl font-bold">
              {assignment.route.name}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {assignment.route.routeId}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-500">
              Pickup Stop
            </p>

            <p className="mt-2 text-xl font-bold">
              {assignment.stop.name}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Stop{" "}
              {assignment.stop.sequence}
            </p>
          </div>
        </section>

        {/* TRIP STATUS */}

        <section className="mt-6 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-blue-200/50">
                Your Trip Status
              </p>

              <h2 className="mt-1 text-3xl font-bold">
                {status}
              </h2>

              <p className="mt-2 text-sm text-blue-100/70">
                {status ===
                  "WAITING" &&
                  "உங்கள் பஸ் இன்னும் உங்கள் நிறுத்தத்திற்கு வரவில்லை."}

                {status ===
                  "APPROACHING" &&
                  "உங்கள் பஸ் உங்கள் நிறுத்தத்தை நோக்கி வருகிறது."}

                {status ===
                  "ARRIVED" &&
                  "உங்கள் பஸ் உங்கள் நிறுத்தத்திற்கு அருகில் வந்துவிட்டது."}

                {status ===
                  "BOARDED" &&
                  "நீங்கள் bus-ல் boarded என்று பதிவு செய்யப்பட்டுள்ளது."}

                {status ===
                  "MISSED" &&
                  "இந்த trip-க்கு bus missed status பதிவு செய்யப்பட்டுள்ளது."}

                {status ===
                  "ABSENT" &&
                  "இந்த trip-க்கு absent status பதிவு செய்யப்பட்டுள்ளது."}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/40 px-6 py-5 text-center">
              <p className="text-xs text-slate-500">
                Bus → Your Pickup Stop
              </p>

              <p className="mt-1 text-3xl font-bold">
                {formatDistance(
                  distanceToStop
                )}
              </p>
            </div>
          </div>
        </section>

        {/* MAP */}

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                🗺️ Live Bus Map
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                உங்கள் bus-ன் realtime location.
              </p>
            </div>

            <div className="flex gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  stale
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {stale
                  ? "● GPS STALE"
                  : "● GPS LIVE"}
              </span>

              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
                Bus{" "}
                {
                  assignment.bus
                    .busNumber
                }
              </span>
            </div>
          </div>

          <div className="h-[380px] w-full">
            <StudentMap
              busLocation={
                location
              }
              pickupStop={
                assignment.stop
              }
              busNumber={
                assignment.bus
                  .busNumber
              }
              registration={
                assignment.bus
                  .registration
              }
              tripRunning={
                tripRunning
              }
              studentLocation={
                data.studentLocation
              }
              collegeLocation={
                data.collegeLocation
              }
            />
          </div>

          {!location && (
            <div className="border-t border-yellow-500/10 bg-yellow-500/5 px-5 py-4 text-sm text-yellow-200">
              🚌 Driver GPS location
              இன்னும் கிடைக்கவில்லை.
            </div>
          )}

          {location && stale && (
            <div className="border-t border-amber-500/10 bg-amber-500/5 px-5 py-4 text-sm text-amber-200">
              ⚠️ Last GPS update
              1 minute-க்கு மேல்
              பழையது.
            </div>
          )}
        </section>

        {/* LIVE DATA */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-slate-500">
              📍 Distance
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatDistance(
                distanceToStop
              )}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Bus →{" "}
              {assignment.stop.name}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-slate-500">
              🚌 Bus Speed
            </p>

            <p className="mt-2 text-3xl font-bold">
              {speedKmh !== null
                ? speedKmh.toFixed(
                    1
                  )
                : "—"}

              <span className="ml-1 text-sm text-slate-400">
                km/h
              </span>
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {location?.speed !=
              null
                ? `${location.speed.toFixed(1)} m/s`
                : "Live speed unavailable"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-slate-500">
              🎯 GPS Accuracy
            </p>

            <p className="mt-2 text-3xl font-bold">
              {location?.accuracy !=
              null
                ? Math.round(
                    location.accuracy
                  )
                : "—"}

              <span className="ml-1 text-sm text-slate-400">
                m
              </span>
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {quality}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-slate-500">
              📡 Realtime
            </p>

            <p
              className={`mt-2 text-xl font-bold ${
                connected
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {connected
                ? "CONNECTED"
                : "OFFLINE"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Socket server
            </p>
          </div>
        </section>

        {/* LAST GPS */}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 text-sm md:flex-row md:justify-between">
            <div>
              <span className="text-slate-500">
                Last GPS
              </span>

              <span className="ml-2 text-slate-300">
                {formatDate(
                  location?.recordedAt
                )}
              </span>
            </div>

            <div>
              <span className="text-slate-500">
                GPS status
              </span>

              <span
                className={`ml-2 font-semibold ${
                  stale
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {stale
                  ? "STALE"
                  : "LIVE"}
              </span>
            </div>
          </div>
        </section>

        {/* PICKUP */}

        <section className="mt-6 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-6">
          <p className="text-sm font-semibold text-blue-200">
            📍 Pickup Location
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            {assignment.stop.name}
          </h2>

          <p className="mt-2 text-xs text-blue-100/50">
            {
              assignment.stop
                .latitude
            }
            ,{" "}
            {
              assignment.stop
                .longitude
            }
          </p>

          <div className="mt-5 rounded-2xl bg-slate-950/40 p-5">
            <p className="text-xs text-blue-100/50">
              Bus distance
            </p>

            <p className="mt-1 text-3xl font-bold">
              {formatDistance(
                distanceToStop
              )}
            </p>
          </div>
        </section>

        {/* SOUND */}

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                🔊 Tamil Notification Voice
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                உங்கள் bus alert-களை
                Tamil voice-ல்
                கேட்கலாம்.
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                audioReady
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {audioReady
                ? "Audio Ready"
                : "Voice Locked"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    🔊 Alert Sound
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Bus alert வந்தால்
                    voice notification.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSoundSettings(
                      (old) => ({
                        ...old,
                        enabled:
                          !old.enabled,
                      })
                    )
                  }
                  className={`h-7 w-12 rounded-full p-1 ${
                    soundSettings.enabled
                      ? "bg-emerald-500"
                      : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition ${
                      soundSettings.enabled
                        ? "translate-x-5"
                        : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 p-5">
              <p className="font-semibold">
                🎙️ Tamil Voice
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Voice name:{" "}
                {
                  data.student
                    .voiceName
                }
              </p>

              <button
                type="button"
                onClick={() =>
                  void testTamilVoice()
                }
                className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500"
              >
                🔊 Test Tamil Voice
              </button>

              <div className="mt-3 rounded-xl border border-white/5 bg-slate-950 p-3">
                <p className="text-xs text-slate-500">
                  Voice status
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {voiceStatus}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-900 p-5">
            <div className="flex justify-between">
              <p className="font-semibold">
                Volume
              </p>

              <span className="font-bold text-blue-300">
                {Math.round(
                  soundSettings.volume *
                    100
                )}
                %
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={
                soundSettings.volume
              }
              onChange={(event) =>
                setSoundSettings(
                  (old) => ({
                    ...old,
                    volume:
                      Number(
                        event.target
                          .value
                      ),
                  })
                )
              }
              className="mt-4 w-full accent-blue-500"
            />
          </div>
        </section>

        {/* NOTIFICATION TYPES */}

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-2xl bg-slate-900 p-4">
            <span className="text-sm">
              🚌 Approaching
            </span>

            <input
              type="checkbox"
              checked={
                soundSettings.approaching
              }
              onChange={(event) =>
                setSoundSettings(
                  (old) => ({
                    ...old,
                    approaching:
                      event.target
                        .checked,
                  })
                )
              }
              className="h-5 w-5 accent-blue-500"
            />
          </label>

          <label className="flex items-center justify-between rounded-2xl bg-slate-900 p-4">
            <span className="text-sm">
              🔔 Nearby
            </span>

            <input
              type="checkbox"
              checked={
                soundSettings.nearby
              }
              onChange={(event) =>
                setSoundSettings(
                  (old) => ({
                    ...old,
                    nearby:
                      event.target
                        .checked,
                  })
                )
              }
              className="h-5 w-5 accent-blue-500"
            />
          </label>

          <label className="flex items-center justify-between rounded-2xl bg-slate-900 p-4">
            <span className="text-sm">
              📍 Arrived
            </span>

            <input
              type="checkbox"
              checked={
                soundSettings.arrived
              }
              onChange={(event) =>
                setSoundSettings(
                  (old) => ({
                    ...old,
                    arrived:
                      event.target
                        .checked,
                  })
                )
              }
              className="h-5 w-5 accent-blue-500"
            />
          </label>
        </section>

        {/* NOTIFICATIONS */}

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Notifications
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Bus proximity alerts
              </p>
            </div>

            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">
              {
                notifications.length
              }
            </span>
          </div>

          {notifications.length ===
          0 ? (
            <div className="mt-5 rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {notifications.map(
                (
                  notification
                ) => (
                  <div
                    key={
                      notification.id
                    }
                    className="rounded-2xl border border-white/5 bg-slate-900 p-4"
                  >
                    <div className="flex gap-3">
                      <div className="text-2xl">
                        {notificationIcon(
                          notification.type
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {
                              notification.title
                            }
                          </p>

                          {!notification.read && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                              NEW
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-slate-400">
                          {
                            notification.message
                          }
                        </p>

                        <p className="mt-2 text-xs text-slate-600">
                          {formatDate(
                            notification.createdAt
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-xs text-slate-600">
          Live Student Bus Tracking
        </footer>
      </div>
    </main>
  );
}