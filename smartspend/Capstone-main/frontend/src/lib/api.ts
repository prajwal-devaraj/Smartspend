// src/lib/api.ts
const API = import.meta.env.VITE_API_BASE; // e.g. http://127.0.0.1:5000/api/v1

let access = localStorage.getItem("access") || "";
let refresh = localStorage.getItem("refresh") || "";
let userId = localStorage.getItem("userId") || "";

export function setTokens(t: { access?: string; refresh?: string; userId?: string }) {
  if (t.access !== undefined) {
    access = t.access || "";
    if (t.access) localStorage.setItem("access", t.access);
    else localStorage.removeItem("access");
  }
  if (t.refresh !== undefined) {
    refresh = t.refresh || "";
    if (t.refresh) localStorage.setItem("refresh", t.refresh);
    else localStorage.removeItem("refresh");
  }
  if (t.userId !== undefined) {
    userId = t.userId || "";
    if (t.userId) localStorage.setItem("userId", t.userId);
    else localStorage.removeItem("userId");
  }
}

// accept access | access_token | token
function pickAccessToken(d: any): string | undefined {
  return d?.access_token ?? d?.access ?? d?.token;
}

// robust JSON parser that tolerates 204 / empty body
async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // non-JSON body; expose raw text when caller needs it
    return { raw: text } as unknown as T;
  }
}

// serialize query with booleans and arrays handled nicely
function qsString(qs?: Record<string, any>): string {
  if (!qs) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      v.forEach((item) => sp.append(k, String(item)));
    } else if (typeof v === "boolean") {
      sp.set(k, v ? "true" : "false");
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function call(path: string, opts: RequestInit = {}, allow401 = false) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status !== 401 || allow401) return res;

  // Try refresh once
  if (!refresh || !userId) throw new Error("Unauthorized");
  const r = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: Number(userId), refresh_token: refresh }),
  });
  if (!r.ok) throw new Error("Unauthorized");
  const data = await safeJson<any>(r);
  const newAccess = pickAccessToken(data);
  const newRefresh = data?.refresh_token;
  if (!newAccess || !newRefresh) throw new Error("Unauthorized");

  setTokens({ access: newAccess, refresh: newRefresh });

  // retry original with fresh access
  const retry = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...headers, Authorization: `Bearer ${newAccess}` },
  });
  return retry;
}

export async function get<T = any>(path: string, qs?: Record<string, any>) {
  const res = await call(path + qsString(qs));
  if (!res.ok) throw new Error(await res.text());
  return safeJson<T>(res);
}

export async function post<T = any>(path: string, body?: any, allow401 = false) {
  const res = await call(
    path,
    { method: "POST", body: body ? JSON.stringify(body) : undefined },
    allow401
  );
  if (!res.ok) throw new Error(await res.text());
  // tolerate 201/204 empty bodies
  if (res.status === 204) return {} as T;
  return safeJson<T>(res);
}

export async function put<T = any>(path: string, body?: any) {
  const res = await call(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return {} as T;
  return safeJson<T>(res);
}

export async function patch<T = any>(path: string, body?: any) {
  const res = await call(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return {} as T;
  return safeJson<T>(res);
}

export async function del<T = any>(path: string, body?: any) {
  const res = await call(path, {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return {} as T;
  return safeJson<T>(res);
}
