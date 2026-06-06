import AsyncStorage from "@react-native-async-storage/async-storage";

const COOKIE_KEY = "session_cookie";
const CREDS_KEY = "stored_credentials";

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "/api";
}

async function getSessionCookie(): Promise<string | null> {
  return AsyncStorage.getItem(COOKIE_KEY);
}

export async function saveSessionCookie(cookie: string) {
  await AsyncStorage.setItem(COOKIE_KEY, cookie);
}

export async function clearSession() {
  await AsyncStorage.multiRemove([COOKIE_KEY, CREDS_KEY]);
}

export async function saveCredentials(email: string, password: string) {
  await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ email, password }));
}

export async function getCredentials(): Promise<{ email: string; password: string } | null> {
  const raw = await AsyncStorage.getItem(CREDS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { email: string; password: string };
  } catch {
    return null;
  }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const base = getBaseUrl();
  const cookie = await getSessionCookie();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  return fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      message = (body as { error?: string }).error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface User {
  id: string;
  email: string;
  barbershopName: string;
  ownerName: string;
  trialDaysLeft: number;
  hasActiveSubscription: boolean;
  canAccess: boolean;
}

export interface DashboardSummary {
  appointmentsToday: number;
  appointmentsCompleted: number;
  appointmentsPending: number;
  monthlyRevenue: number;
  totalClients: number;
  queueCount: number;
  currentAppointment: Appointment | null;
  nextAppointment: Appointment | null;
}

export interface Appointment {
  id: number;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  barberName: string | null;
  scheduledAt: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  createdAt: string;
}

export interface QueueEntry {
  id: number;
  appointmentId: number | null;
  clientName: string;
  serviceName: string;
  servicePrice: number;
  serviceDuration: number;
  notes: string | null;
  position: number;
  status: "waiting" | "in_progress" | "completed";
  startedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalAppointments: number;
  averageTicket: number;
  revenueByService: { serviceName: string; revenue: number; count: number }[];
  revenueByDay: { date: string; revenue: number; count: number }[];
}

export const api = {
  async login(email: string, password: string): Promise<User> {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      await saveSessionCookie(setCookie);
    }
    return handleResponse<User>(res);
  },

  async logout(): Promise<void> {
    await apiFetch("/auth/logout", { method: "POST" });
    await clearSession();
  },

  async me(): Promise<User> {
    const res = await apiFetch("/auth/me");
    return handleResponse<User>(res);
  },

  async getDashboard(): Promise<DashboardSummary> {
    const res = await apiFetch("/dashboard/summary");
    return handleResponse<DashboardSummary>(res);
  },

  async getQueue(): Promise<QueueEntry[]> {
    const res = await apiFetch("/queue");
    return handleResponse<QueueEntry[]>(res);
  },

  async startQueueEntry(id: number): Promise<QueueEntry> {
    const res = await apiFetch(`/queue/${id}/start`, { method: "POST" });
    return handleResponse<QueueEntry>(res);
  },

  async removeFromQueue(id: number): Promise<void> {
    const res = await apiFetch(`/queue/${id}`, { method: "DELETE" });
    return handleResponse<void>(res);
  },

  async addToQueue(data: {
    clientName: string;
    serviceName: string;
    servicePrice: number;
    serviceDuration: number;
    notes?: string;
  }): Promise<QueueEntry> {
    const res = await apiFetch("/queue", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return handleResponse<QueueEntry>(res);
  },

  async getAppointments(date?: string): Promise<Appointment[]> {
    const qs = date ? `?date=${date}` : "";
    const res = await apiFetch(`/appointments${qs}`);
    return handleResponse<Appointment[]>(res);
  },

  async startAppointment(id: number): Promise<Appointment> {
    const res = await apiFetch(`/appointments/${id}/start`, { method: "POST" });
    return handleResponse<Appointment>(res);
  },

  async completeAppointment(id: number): Promise<Appointment> {
    const res = await apiFetch(`/appointments/${id}/complete`, { method: "POST" });
    return handleResponse<Appointment>(res);
  },

  async cancelAppointment(id: number): Promise<Appointment> {
    const res = await apiFetch(`/appointments/${id}/cancel`, { method: "POST" });
    return handleResponse<Appointment>(res);
  },

  async getFinancialSummary(month?: number, year?: number): Promise<FinancialSummary> {
    const params = new URLSearchParams();
    if (month !== undefined) params.set("month", String(month));
    if (year !== undefined) params.set("year", String(year));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch(`/financial/summary${qs}`);
    return handleResponse<FinancialSummary>(res);
  },
};
