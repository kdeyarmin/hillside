'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  ShieldCheck,
  Video,
  VideoOff
} from 'lucide-react';

type KeySequence = {
  toArray?: () => string[];
  forEach?: (callback: (key: string) => void) => void;
};

type CollectionLike<T> =
  | Map<string, T>
  | Record<string, T>
  | {
      get?: (key: string) => T | undefined;
      forEach?: (callback: (value: T, key: string) => void) => void;
      keySeq?: () => KeySequence;
    };

type RoomState = {
  participants?: CollectionLike<ParticipantLike>;
};

type ParticipantLike = {
  origin?: string;
  context?: string;
  streams?: CollectionLike<unknown>;
};

type ParticipantStream = {
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
};

type TelnyxRoom = {
  on: (event: string, callback: (...args: unknown[]) => void) => (() => void) | void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  addStream: (
    key: string,
    tracks: { audio?: MediaStreamTrack; video?: MediaStreamTrack }
  ) => Promise<void>;
  updateStream?: (
    key: string,
    tracks: { audio?: MediaStreamTrack; video?: MediaStreamTrack }
  ) => Promise<void>;
  removeStream: (key: string) => Promise<void>;
  addSubscription: (
    participantId: string,
    streamKey: string,
    config: { audio: boolean; video: boolean }
  ) => Promise<void>;
  getParticipantStream: (participantId: string, streamKey: string) => ParticipantStream;
  getState?: () => RoomState;
  updateClientToken: (clientToken: string) => Promise<void>;
};

type TelnyxModule = {
  Room: new (
    roomId: string,
    options: { clientToken: string; localParticipant: unknown }
  ) => TelnyxRoom;
  createLocalParticipant: (options: { context: string }) => unknown;
};

type VideoCredentials = {
  roomId: string;
  clientToken: string;
  expiresAt: string;
  sdkUrl: string;
  error?: string;
};

type RemoteTile = {
  id: string;
  label: string;
  stream: MediaStream;
};

function collectionEntries<T>(collection: CollectionLike<T> | undefined): Array<[string, T]> {
  if (!collection) return [];
  if (collection instanceof Map) return Array.from(collection.entries());

  const iterable = collection as {
    forEach?: (callback: (value: T, key: string) => void) => void;
  };
  if (typeof iterable.forEach === 'function') {
    const entries: Array<[string, T]> = [];
    iterable.forEach((value, key) => entries.push([String(key), value]));
    return entries;
  }

  return Object.entries(collection as Record<string, T>);
}

function collectionGet<T>(collection: CollectionLike<T> | undefined, key: string) {
  if (!collection) return undefined;
  if (collection instanceof Map) return collection.get(key);
  const immutable = collection as { get?: (candidate: string) => T | undefined };
  if (typeof immutable.get === 'function') return immutable.get(key);
  return (collection as Record<string, T>)[key];
}

function collectionKeys<T>(collection: CollectionLike<T> | undefined) {
  if (!collection) return [] as string[];
  if (collection instanceof Map) return Array.from(collection.keys());

  const immutable = collection as {
    keySeq?: () => KeySequence;
    forEach?: (callback: (value: T, key: string) => void) => void;
  };
  if (typeof immutable.keySeq === 'function') {
    const sequence = immutable.keySeq();
    if (typeof sequence.toArray === 'function') return sequence.toArray().map(String);
    if (typeof sequence.forEach === 'function') {
      const keys: string[] = [];
      sequence.forEach((key) => keys.push(String(key)));
      return keys;
    }
  }
  if (typeof immutable.forEach === 'function') {
    const keys: string[] = [];
    immutable.forEach((_value, key) => keys.push(String(key)));
    return keys;
  }

  return Object.keys(collection as Record<string, T>);
}

function participantEntries(state: RoomState | undefined) {
  return collectionEntries(state?.participants);
}

function getParticipant(state: RoomState | undefined, participantId: string) {
  return collectionGet(state?.participants, participantId);
}

function streamKeys(participant: ParticipantLike) {
  return collectionKeys(participant.streams);
}

function participantLabel(participant: ParticipantLike | undefined) {
  try {
    const context = JSON.parse(participant?.context || '{}') as { name?: string };
    return context.name || 'Class participant';
  } catch {
    return 'Class participant';
  }
}

function RemoteVideo({ tile }: { tile: RemoteTile }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // Captured on the way in: by the time cleanup runs React may have detached
    // this element, so `ref.current` would be null and the stream never released.
    const element = ref.current;
    if (element) element.srcObject = tile.stream;
    return () => {
      if (element) element.srcObject = null;
    };
  }, [tile.stream]);

  return (
    <div className="classroom-video-tile">
      <video ref={ref} autoPlay playsInline />
      <span>{tile.label}</span>
    </div>
  );
}

export default function TelnyxClassroom({
  classId,
  title,
  participantName,
  host = false,
  recording = false
}: {
  classId: string;
  title: string;
  participantName: string;
  host?: boolean;
  recording?: boolean;
}) {
  const roomRef = useRef<TelnyxRoom | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const screenMediaRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<'ready' | 'joining' | 'connected' | 'left' | 'error'>(
    'ready'
  );
  const [message, setMessage] = useState('');
  const [remoteTiles, setRemoteTiles] = useState<RemoteTile[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [listeningOnly, setListeningOnly] = useState(false);

  const requestCredentials = useCallback(async () => {
    const response = await fetch(`/api/classes/${encodeURIComponent(classId)}/video-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });
    const result = (await response.json()) as VideoCredentials;
    if (!response.ok || !result.clientToken || !result.roomId || !result.sdkUrl) {
      throw new Error(result.error || 'Unable to open the online classroom.');
    }
    return result;
  }, [classId]);

  const stopAllMedia = useCallback(() => {
    localMediaRef.current?.getTracks().forEach((track) => track.stop());
    screenMediaRef.current?.getTracks().forEach((track) => track.stop());
    localMediaRef.current = null;
    screenMediaRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
  }, []);

  const leave = useCallback(async () => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = null;
    try {
      if (screenMediaRef.current)
        await roomRef.current?.removeStream('screen').catch(() => undefined);
      if (localMediaRef.current)
        await roomRef.current?.removeStream('camera').catch(() => undefined);
      await roomRef.current?.disconnect().catch(() => undefined);
    } finally {
      stopAllMedia();
      roomRef.current = null;
      subscribedRef.current.clear();
      setRemoteTiles([]);
      setScreenSharing(false);
      setListeningOnly(false);
      setStatus('left');
      setMessage('You left the classroom. You may rejoin while the classroom remains open.');
    }
  }, [stopAllMedia]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      stopAllMedia();
      void roomRef.current?.disconnect().catch(() => undefined);
    };
  }, [stopAllMedia]);

  async function join() {
    if (status === 'joining' || status === 'connected') return;
    setStatus('joining');
    setMessage('Preparing your secure classroom…');
    setListeningOnly(false);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setScreenSharing(false);
    setRemoteTiles([]);
    subscribedRef.current.clear();

    try {
      const credentials = await requestCredentials();
      const sdk = (await import(
        /* webpackIgnore: true */ credentials.sdkUrl
      )) as unknown as TelnyxModule;
      if (!sdk.Room || !sdk.createLocalParticipant) {
        throw new Error('The video classroom could not be loaded. Please refresh and try again.');
      }

      const localParticipant = sdk.createLocalParticipant({
        context: JSON.stringify({
          name: participantName,
          role: host ? 'host' : 'guest',
          classId
        })
      });
      const room = new sdk.Room(credentials.roomId, {
        clientToken: credentials.clientToken,
        localParticipant
      });
      roomRef.current = room;

      const removeRemoteStream = (participantId: string, streamKey: string) => {
        const subscriptionKey = `${participantId}:${streamKey}`;
        subscribedRef.current.delete(subscriptionKey);
        if (mountedRef.current) {
          setRemoteTiles((current) => current.filter((item) => item.id !== subscriptionKey));
        }
      };

      const removeRemoteParticipant = (participantId: string) => {
        const prefix = `${participantId}:`;
        for (const key of Array.from(subscribedRef.current)) {
          if (key.startsWith(prefix)) subscribedRef.current.delete(key);
        }
        if (mountedRef.current) {
          setRemoteTiles((current) => current.filter((item) => !item.id.startsWith(prefix)));
        }
      };

      const subscribe = async (participantId: string, streamKey: string, state?: RoomState) => {
        const participant = getParticipant(state, participantId);
        if (participant?.origin === 'local') return;
        const key = `${participantId}:${streamKey}`;
        if (subscribedRef.current.has(key)) return;
        subscribedRef.current.add(key);
        try {
          await room.addSubscription(participantId, streamKey, { audio: true, video: true });
        } catch (error) {
          subscribedRef.current.delete(key);
          console.error('Unable to subscribe to classroom stream', error);
        }
      };

      room.on('stream_published', (...args: unknown[]) => {
        const [participantId, streamKey, state] = args as [string, string, RoomState];
        if (typeof participantId === 'string' && typeof streamKey === 'string') {
          void subscribe(participantId, streamKey, state);
        }
      });

      room.on('subscription_started', (...args: unknown[]) => {
        const [participantId, streamKey, state] = args as [string, string, RoomState];
        if (typeof participantId !== 'string' || typeof streamKey !== 'string') return;
        const remote = room.getParticipantStream(participantId, streamKey);
        const tracks = [remote.audioTrack, remote.videoTrack].filter(
          (track): track is MediaStreamTrack => Boolean(track)
        );
        if (!tracks.length || !mountedRef.current) return;
        const id = `${participantId}:${streamKey}`;
        const participant = getParticipant(state, participantId);
        const tile: RemoteTile = {
          id,
          label: participantLabel(participant),
          stream: new MediaStream(tracks)
        };
        setRemoteTiles((current) => [...current.filter((item) => item.id !== id), tile]);
      });

      room.on('stream_unpublished', (...args: unknown[]) => {
        const [participantId, streamKey] = args as [string, string];
        if (typeof participantId === 'string' && typeof streamKey === 'string') {
          removeRemoteStream(participantId, streamKey);
        }
      });

      room.on('subscription_ended', (...args: unknown[]) => {
        const [participantId, streamKey] = args as [string, string];
        if (typeof participantId === 'string' && typeof streamKey === 'string') {
          removeRemoteStream(participantId, streamKey);
        }
      });

      room.on('participant_left', (...args: unknown[]) => {
        const [participantId] = args as [string];
        if (typeof participantId === 'string') removeRemoteParticipant(participantId);
      });

      room.on('disconnected', () => {
        if (mountedRef.current && roomRef.current === room) {
          stopAllMedia();
          roomRef.current = null;
          subscribedRef.current.clear();
          setRemoteTiles([]);
          setScreenSharing(false);
          setListeningOnly(false);
          setStatus('left');
          setMessage('The video connection ended. Select rejoin to reconnect.');
        }
      });

      await room.connect();

      const currentState = room.getState?.();
      for (const [participantId, participant] of participantEntries(currentState)) {
        if (participant.origin === 'local') continue;
        for (const streamKey of streamKeys(participant)) {
          void subscribe(participantId, streamKey, currentState);
        }
      }

      let joinedListeningOnly = false;
      let joinedWithPartialMedia = false;
      let media: MediaStream | null = null;

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          media = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
          });
        } catch (combinedError) {
          console.warn('Full camera and microphone access was unavailable', combinedError);
          const fallbackTracks: MediaStreamTrack[] = [];
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
              video: false
            });
            fallbackTracks.push(...audioOnly.getAudioTracks());
          } catch (audioError) {
            console.warn('Microphone access was unavailable', audioError);
          }
          try {
            const videoOnly = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            fallbackTracks.push(...videoOnly.getVideoTracks());
          } catch (videoError) {
            console.warn('Camera access was unavailable', videoError);
          }
          if (fallbackTracks.length) {
            media = new MediaStream(fallbackTracks);
            joinedWithPartialMedia = true;
          }
        }
      }

      if (media && media.getTracks().length) {
        localMediaRef.current = media;
        if (localVideoRef.current) localVideoRef.current.srcObject = media;
        const audioTrack = media.getAudioTracks()[0];
        const videoTrack = media.getVideoTracks()[0];
        setAudioEnabled(Boolean(audioTrack));
        setVideoEnabled(Boolean(videoTrack));
        await room.addStream('camera', {
          audio: audioTrack,
          video: videoTrack
        });
      } else {
        joinedListeningOnly = true;
        setAudioEnabled(false);
        setVideoEnabled(false);
      }
      setListeningOnly(joinedListeningOnly);

      refreshTimerRef.current = setInterval(async () => {
        try {
          const refreshed = await requestCredentials();
          await room.updateClientToken(refreshed.clientToken);
        } catch (error) {
          console.error('Unable to refresh Telnyx classroom token', error);
        }
      }, 45 * 60_000);

      setStatus('connected');
      setMessage(
        joinedListeningOnly
          ? 'Connected in listening-only mode.'
          : joinedWithPartialMedia
            ? 'Connected with the camera or microphone that your browser allowed.'
            : 'Connected to the classroom.'
      );
    } catch (error) {
      console.error('Unable to join Telnyx classroom', error);
      await roomRef.current?.disconnect().catch(() => undefined);
      roomRef.current = null;
      stopAllMedia();
      subscribedRef.current.clear();
      setRemoteTiles([]);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to join the online classroom.');
    }
  }

  function toggleAudio() {
    const tracks = localMediaRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;
    const next = !audioEnabled;
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setAudioEnabled(next);
  }

  function toggleVideo() {
    const tracks = localMediaRef.current?.getVideoTracks() || [];
    if (!tracks.length) return;
    const next = !videoEnabled;
    tracks.forEach((track) => {
      track.enabled = next;
    });
    setVideoEnabled(next);
  }

  async function toggleScreenShare() {
    if (!host || !roomRef.current) return;
    if (screenMediaRef.current) {
      await roomRef.current.removeStream('screen').catch(() => undefined);
      screenMediaRef.current.getTracks().forEach((track) => track.stop());
      screenMediaRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenSharing(false);
      return;
    }

    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = media.getVideoTracks()[0];
      if (!track) return;
      screenMediaRef.current = media;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = media;
      await roomRef.current.addStream('screen', { video: track });
      setScreenSharing(true);
      track.addEventListener('ended', () => void toggleScreenShare(), { once: true });
    } catch (error) {
      if ((error as Error).name !== 'NotAllowedError') {
        setMessage('Screen sharing could not be started.');
      }
    }
  }

  const canJoin = status === 'ready' || status === 'left' || status === 'error';
  const hasLocalAudio = Boolean(localMediaRef.current?.getAudioTracks().length);
  const hasLocalVideo = Boolean(localMediaRef.current?.getVideoTracks().length);

  return (
    <section className="telnyx-classroom" aria-label={`${title} online classroom`}>
      <div className="classroom-heading">
        <div>
          <span className="eyebrow">Secure Hillside classroom</span>
          <h1>{title}</h1>
          <p>
            <ShieldCheck size={16} /> Your place is verified before the classroom opens.
          </p>
        </div>
        {recording && <span className="classroom-recording-notice">Recording enabled</span>}
      </div>

      {canJoin && (
        <div className="classroom-prejoin">
          <Video size={42} />
          <h2>{host ? 'Open your host studio' : 'Ready to join us?'}</h2>
          <p>
            Select join, then allow camera and microphone access. You can still join in
            listening-only mode when browser permissions are unavailable.
          </p>
          {message && <p className={status === 'error' ? 'classroom-error' : 'muted'}>{message}</p>}
          <button className="btn" type="button" onClick={join}>
            <Video size={18} />{' '}
            {status === 'left' ? 'Rejoin class' : host ? 'Open host studio' : 'Join online class'}
          </button>
        </div>
      )}

      {status === 'joining' && (
        <div className="classroom-prejoin" role="status">
          <LoaderCircle className="classroom-spinner" size={38} />
          <h2>Opening the classroom…</h2>
          <p>{message}</p>
        </div>
      )}

      {status === 'connected' && (
        <>
          {listeningOnly && (
            <div className="classroom-banner">
              You are connected in listening-only mode. Other participants cannot see or hear you.
            </div>
          )}
          <div className="classroom-grid">
            <div className="classroom-video-tile local">
              <video ref={localVideoRef} autoPlay muted playsInline />
              <span>
                {participantName} {host ? '• Host' : '• You'}
              </span>
            </div>
            {screenSharing && (
              <div className="classroom-video-tile screen-preview">
                <video ref={screenVideoRef} autoPlay muted playsInline />
                <span>Your shared screen</span>
              </div>
            )}
            {remoteTiles.map((tile) => (
              <RemoteVideo tile={tile} key={tile.id} />
            ))}
          </div>
          <div className="classroom-controls" aria-label="Classroom controls">
            <button type="button" onClick={toggleAudio} disabled={!hasLocalAudio}>
              {audioEnabled ? <Mic /> : <MicOff />} <span>{audioEnabled ? 'Mute' : 'Unmute'}</span>
            </button>
            <button type="button" onClick={toggleVideo} disabled={!hasLocalVideo}>
              {videoEnabled ? <Video /> : <VideoOff />}{' '}
              <span>{videoEnabled ? 'Camera off' : 'Camera on'}</span>
            </button>
            {host && (
              <button type="button" onClick={toggleScreenShare}>
                <MonitorUp /> <span>{screenSharing ? 'Stop sharing' : 'Share screen'}</span>
              </button>
            )}
            <button className="leave" type="button" onClick={() => void leave()}>
              <PhoneOff /> <span>Leave</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
