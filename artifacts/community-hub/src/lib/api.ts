export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers || {});
  
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  } else if (isFormData) {
    headers.delete("Content-Type");
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed with status ${response.status}`);
  }
  return data as T;
}