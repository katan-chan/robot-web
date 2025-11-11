import config from '@/config.js';

function resolveUrl(base, path) {
  if (!path) {
    return base;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!base) {
    return path;
  }

  if (/^https?:\/\//i.test(base)) {
    const url = new URL(path, base);
    return url.toString();
  }

  if (path.startsWith('/') && base.endsWith('/')) {
    return `${base}${path.slice(1)}`;
  }

  if (!base.endsWith('/') && !path.startsWith('/')) {
    return `${base}/${path}`;
  }

  return `${base}${path}`;
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const message = errorText || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }

  if (contentType.startsWith('text/')) {
    return response.text();
  }

  return response.arrayBuffer();
}

function mergeHeaders(extra = {}) {
  return {
    ...config.aiServer.headers,
    ...extra
  };
}

export async function sendChatMessage({ text, role, isNewChat }) {
  const url = resolveUrl(config.aiServer.baseUrl, config.aiServer.chatPath);
  const payload = {
    text,
    role,
    is_new_chat: isNewChat
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: mergeHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

export async function sendVoiceMessage({ blob, role, text = '', isNewChat }) {
  const url = resolveUrl(config.aiServer.baseUrl, config.aiServer.voicePath);
  const form = new FormData();

  form.append(config.voiceForm.fileField, blob, 'voice.wav');
  form.append(config.voiceForm.roleField, role);
  form.append(config.voiceForm.isNewChatField, isNewChat ? 'true' : 'false');
  if (text) {
    form.append(config.voiceForm.textField, text);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: mergeHeaders(),
    body: form
  });

  return handleResponse(response);
}

export async function postMapSetToAi(matrix) {
  if (!config.aiServer.baseUrl) {
    return null;
  }

  const url = resolveUrl(config.aiServer.baseUrl, config.aiServer.mapSetPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: mergeHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(matrix)
  });

  return handleResponse(response);
}

export async function postMapSetToRobot(matrix) {
  if (!config.robot.baseUrl) {
    return null;
  }

  const url = resolveUrl(config.robot.baseUrl, config.robot.mapSetPath);
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(matrix),
    headers: { 'Content-Type': 'application/json' }
  });

  return handleResponse(response);
}

export async function sendRobotPlay(blob) {
  if (!config.robot.baseUrl) {
    return null;
  }

  const url = resolveUrl(config.robot.baseUrl, config.robot.playPath);
  const form = new FormData();
  form.append(config.robot.playFormField, blob, 'reply.wav');

  const response = await fetch(url, {
    method: 'POST',
    body: form
  });

  return handleResponse(response);
}

export async function dispatchMapSet(matrix) {
  const tasks = [];

  if (config.aiServer.baseUrl) {
    tasks.push(postMapSetToAi(matrix));
  }

  if (config.robot.baseUrl) {
    tasks.push(postMapSetToRobot(matrix));
  }

  if (!tasks.length) {
    return [];
  }

  return Promise.allSettled(tasks);
}
