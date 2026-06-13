const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

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

export async function submitOrderWithFiles(portalToken, orderData, filesByCompany) {
  const formData = new FormData();
  formData.append("order_data", JSON.stringify(orderData));

  filesByCompany.forEach((files, companyIndex) => {
    files.forEach((file) => {
      formData.append("files", file);
      formData.append("file_company_indexes", String(companyIndex));
    });
  });

  return request("/api/portal/submit-order-with-files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${portalToken}`,
    },
    body: formData,
  });
}
