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

type TelnyxRoomListResponse = {
  data?: Array<{ id?: string; unique_name?: string }>;
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

async function telnyxRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('TELNYX_API_KEY is not configured.');

  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

async function findRoomIdByUniqueName(uniqueName: string) {
  const listed = await telnyxRequest<TelnyxRoomListResponse>(
    `/rooms?filter[unique_name]=${encodeURIComponent(uniqueName)}`,
    undefined,
    'GET'
  );
  return listed.data?.find((room) => room.unique_name === uniqueName)?.id || listed.data?.[0]?.id || null;
}

export async function ensureTelnyxRoom(event: TelnyxClass) {
  if (!isOnlineClass(event.format)) return null;
  if (event.telnyxRoomId) return event.telnyxRoomId;

  /**
   * Two concurrent prepares used to both see a null room id and both POST /rooms.
   * Telnyx then had two rooms and the later write won, leaking an orphaned room
   * and racing the unique `telnyxRoomId` column. Create-or-recover by unique
   * name, then claim the column only while it is still empty.
   */
  const uniqueName = `hillside-${event.id}`;
  let roomId: string | null = null;

  try {
    const response = await telnyxRequest<TelnyxRoomResponse>('/rooms', {
      unique_name: uniqueName,
      max_participants: Math.max(2, Math.min(50, event.capacity + 1)),
      enable_recording: event.telnyxRecordingEnabled
    });
    roomId = response.data?.id || null;
  } catch (error) {
    roomId = await findRoomIdByUniqueName(uniqueName);
    if (!roomId) throw error;
  }

  if (!roomId) throw new Error('Telnyx did not return a room ID.');

  const claimed = await db.classEvent.updateMany({
    where: { id: event.id, telnyxRoomId: null },
    data: { telnyxRoomId: roomId }
  });
  if (claimed.count === 0) {
    const existing = await db.classEvent.findUnique({
      where: { id: event.id },
      select: { telnyxRoomId: true }
    });
    return existing?.telnyxRoomId || roomId;
  }
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
