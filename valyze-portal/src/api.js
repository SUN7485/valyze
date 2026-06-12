const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      data?.error ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function auth(token, password) {
  return request("/api/portal/auth", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function submitOrder(portalToken, orderData) {
  return request("/api/portal/submit-order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${portalToken}`,
    },
    body: JSON.stringify(orderData),
  });
}
