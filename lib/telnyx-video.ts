import type { ClassEvent } from '@prisma/client';
import { db } from '@/lib/db';
import { isOnlineClass } from '@/lib/class-access';

const DEFAULT_API_BASE = 'https://api.telnyx.com/v2';

type TelnyxRoomResponse = {
  data?: {
    id?: string;
    unique_name?: string;
    max_participants?: number;
    enable_recording?: boolean;
  };
  errors?: Array<{ detail?: string; title?: string }>;
};

type TelnyxTokenResponse = {
  data?: {
    token?: string;
    token_expires_at?: string;
    refresh_token?: string;
    refresh_token_expires_at?: string;
  };
  errors?: Array<{ detail?: string; title?: string }>;
};

type TelnyxClass = Pick<
  ClassEvent,
  'id' | 'title' | 'format' | 'capacity' | 'telnyxRoomId' | 'telnyxRecordingEnabled'
>;

function apiBase() {
  return (process.env.TELNYX_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
}

function apiKey() {
  return process.env.TELNYX_API_KEY?.trim() || '';
}

export function telnyxVideoConfigured() {
  return Boolean(apiKey());
}

async function telnyxRequest<T>(path: string, body: unknown): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('TELNYX_API_KEY is not configured.');

  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    errors?: Array<{ detail?: string; title?: string }>;
  };
  if (!response.ok) {
    const message = payload.errors?.map((item) => item.detail || item.title).filter(Boolean).join('; ');
    throw new Error(message || `Telnyx Video request failed with status ${response.status}.`);
  }
  return payload;
}

export async function ensureTelnyxRoom(event: TelnyxClass) {
  if (!isOnlineClass(event.format)) return null;
  if (event.telnyxRoomId) return event.telnyxRoomId;

  const uniqueName = `hillside-${event.id}`;
  const response = await telnyxRequest<TelnyxRoomResponse>('/rooms', {
    unique_name: uniqueName,
    max_participants: Math.max(2, Math.min(50, event.capacity + 1)),
    enable_recording: event.telnyxRecordingEnabled
  });
  const roomId = response.data?.id;
  if (!roomId) throw new Error('Telnyx did not return a room ID.');

  await db.classEvent.update({
    where: { id: event.id },
    data: { telnyxRoomId: roomId }
  });
  return roomId;
}

export async function generateTelnyxJoinToken(roomId: string) {
  const response = await telnyxRequest<TelnyxTokenResponse>(
    `/rooms/${encodeURIComponent(roomId)}/actions/generate_join_client_token`,
    {
      token_ttl_secs: 3600,
      refresh_token_ttl_secs: 86400
    }
  );

  const token = response.data?.token;
  if (!token) throw new Error('Telnyx did not return a client join token.');
  return {
    token,
    expiresAt: response.data?.token_expires_at || new Date(Date.now() + 55 * 60_000).toISOString()
  };
}
