/* Supabase project settings are loaded from the local .env file, which is
   git-ignored. Only the public anon key belongs in the client: database access
   is still enforced by RLS policies. Never place a service_role key here. */
export const SB_URL = import.meta.env?.VITE_SUPABASE_URL || "";
export const SB_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

if (!SB_URL || !SB_KEY) {
  console.warn(
    'Supabase configuration missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

let getAccessToken = null;

export function setTokenProvider(fn) {
  getAccessToken = fn;
}

export async function api(path, opts = {}) {
  const headers = {
    "apikey": SB_KEY,
    "Content-Type": "application/json",
    ...(opts.headers || {})
  };

  const token = getAccessToken ? getAccessToken() : null;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${SB_URL}${path}`, {
    ...opts,
    headers
  });

  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.message || data.msg || JSON.stringify(data));
  }
  return data;
}

export const q = (table, qs) => api(`/rest/v1/${table}?${qs}`);

export const ins = (table, data) => api(`/rest/v1/${table}`, {
  method: "POST",
  headers: { "Prefer": "return=representation" },
  body: JSON.stringify(data)
});

export const upd = (table, match, data) => api(`/rest/v1/${table}?${match}`, {
  method: "PATCH",
  headers: { "Prefer": "return=representation" },
  body: JSON.stringify(data)
});

export const del = (table, match) => api(`/rest/v1/${table}?${match}`, {
  method: "DELETE"
});
