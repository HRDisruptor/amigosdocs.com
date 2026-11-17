// Every call to the server goes through here. Errors carry a stable `code`
// that the interface translates into the reader's language.
export class ApiError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields || [];
  }
}

export async function api(path, { method = 'GET', body, file } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (file) {
    options.headers['Content-Type'] = 'application/octet-stream';
    options.headers['X-Filename'] = encodeURIComponent(file.name);
    options.body = file;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || 'server_error', data.fields);
  return data;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body });
