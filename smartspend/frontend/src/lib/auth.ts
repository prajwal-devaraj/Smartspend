// src/lib/auth.ts
import { post, setTokens } from "./api";

export type StoredUser = { id: string; name: string; email: string; status?: string };
const KEY_USER = "user";
const KEY_ONB = "onboardingStep"; // 'balance' | 'pay' | 'bills' | 'done' | 'none'

function pickAccessToken(d: any): string | undefined {
  return d?.access_token ?? d?.access ?? d?.token;
}

export function setUser(u: StoredUser | null) {
  if (!u) localStorage.removeItem(KEY_USER);
  else localStorage.setItem(KEY_USER, JSON.stringify(u));
}
export function getUser(): StoredUser | null {
  const v = localStorage.getItem(KEY_USER);
  try {
    return v ? (JSON.parse(v) as StoredUser) : null;
  } catch {
    return null;
  }
}
export const clearUser = () => {
  localStorage.removeItem(KEY_USER);
  setOnboarding("none");
};

export function setOnboarding(step: "balance" | "pay" | "bills" | "done" | "none") {
  localStorage.setItem(KEY_ONB, step);
}
export function getOnboarding(): string | null {
  return localStorage.getItem(KEY_ONB);
}

export async function signup(name: string, email: string, password: string) {
  const data = await post("/auth/signup", { name, email, password }, /*allow401*/ true);

  const access = pickAccessToken(data);
  if (access) localStorage.setItem("access", access);
  localStorage.removeItem("refresh");

  const u = data.user;
  localStorage.setItem("userId", String(u.id));
  setUser({ id: String(u.id), name: u.name, email: u.email, status: u.status });

  // server returns onboarding: { step: 'balance' }
  setOnboarding(data.onboarding?.step ?? "balance");
  return data;
}

export async function login(email: string, password: string) {
  const data = await post("/auth/login", { email, password }, /*allow401*/ true);

  const access = pickAccessToken(data);
  if (access) localStorage.setItem("access", access);

  const u = data.user;
  localStorage.setItem("userId", String(u.id));
  setUser({ id: String(u.id), name: u.name, email: u.email, status: u.status });

  if (u.status === "pending_onboarding") {
    setOnboarding(data.onboarding?.step ?? "balance");
    localStorage.removeItem("refresh");
  } else {
    // active user gets refresh token too
    if (data.refresh_token) localStorage.setItem("refresh", data.refresh_token);
    setOnboarding("done");
  }

  // also update in-memory tokens used by fetch wrapper
  setTokens({
    access: access,
    refresh: data.refresh_token,
    userId: String(u.id),
  });

  return data;
}

export function logout() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("userId");
  setUser(null);
  setOnboarding("none");
  setTokens({ access: "", refresh: "", userId: "" });
}
