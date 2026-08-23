'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { formatBytes, uploadImageFile } from '@/lib/image-compress';
import { PHOTO_SLOTS, photoStatus, type PhotoSlotKey } from '@/lib/product-photos';

/**
 * The product form's photography section.
 *
 * What was here before was a text box per photo URL, enhanced afterwards by a
 * script that appended a file picker to it. It worked, but it asked Tammy to
 * think in URLs: the gallery was a textarea of paths, one per line, "remove"
 * meant "remove the last line", there was no way to reorder anything, and
 * promoting a better photograph to the front meant retyping two lines in the
 * right order.
 *
 * This is the same data — the same form fields, submitted to the same action —
 * with the photographs shown as photographs. Everything still degrades to typing
 * a URL, because that is the only thing that works when an upload fails.
 */

/** Matches the ceiling `saveProduct` stores, so the UI cannot promise more. */
const GALLERY_LIMIT = 8;

type SlotValues = Record<PhotoSlotKey, string>;

type Status = { text: string; state: 'success' | 'error' | '' };

const EMPTY: Status = { text: '', state: '' };

function useUploader(onDone: (url: string) => void) {
  const [status, setStatus] = useState<Status>(EMPTY);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (files: FileList | File[] | null, limit = 1) => {
      const chosen = Array.from(files || []).slice(0, limit);
      if (!chosen.length) return;

      setBusy(true);
      setStatus({ text: `Preparing ${chosen.length === 1 ? 'photo' : 'photos'}…`, state: '' });
      let done = 0;
      let saved = 0;
      try {
        for (const file of chosen) {
          const { url, prepared } = await uploadImageFile(file);
          onDone(url);
          done += 1;
          saved += Math.max(0, prepared.originalBytes - prepared.uploadedBytes);
        }
        setStatus({
          text:
            saved > 0
              ? `Uploaded ${done === 1 ? 'photo' : `${done} photos`} — ${formatBytes(saved)} smaller. Save the form to publish.`
              : `Uploaded ${done === 1 ? 'photo' : `${done} photos`}. Save the form to publish.`,
          state: 'success'
        });
      } catch (error) {
        setStatus({
          text: error instanceof Error ? error.message : 'The image could not be uploaded.',
          state: 'error'
        });
      } finally {
        setBusy(false);
      }
    },
    [onDone]
  );

  return { upload, status, setStatus, busy };
}

/** A file picker, a drop target and a preview, sized for one photograph. */
function PhotoDropzone({
  label,
  inputLabel,
  busy,
  multiple,
  onFiles,
  children
}: {
  label: string;
  /** The file input's own accessible name; the button beside it is not one. */
  inputLabel: string;
  busy: boolean;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`photo-dropzone${over ? ' over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFiles(event.dataTransfer?.files || null);
      }}
    >
      {children}
      <div className="photo-dropzone-actions">
        <button
          className="btn outline small"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : label}
        </button>
        <span className="admin-hint">or drop a photo here</span>
      </div>
      {/* No `capture` attribute on purpose: it forces the camera open and takes
          away the camera roll, which is where the photograph she took this
          morning already is.

          It carries its own `aria-label` rather than being hidden from assistive
          technology: `aria-hidden` on something still programmatically focusable
          is its own violation, and the visible button is not this input's
          accessible name. */}
      <input
        ref={input}
        className="admin-upload-file"
        type="file"
        aria-label={inputLabel}
        accept="image/*"
        multiple={multiple}
        tabIndex={-1}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function SlotEditor({
  slotKey,
  label,
  hint,
  required,
  value,
  onChange
}: {
  slotKey: PhotoSlotKey;
  label: string;
  hint: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const { upload, status, setStatus, busy } = useUploader(onChange);
  const state = photoStatus(value);

  return (
    <div className="photo-slot">
      <div className="photo-slot-head">
        <b>{label}</b>
        {required && <span className="photo-slot-flag required">Required</span>}
        {state === 'generic' && (
          <span className="photo-slot-flag generic">Generic artwork — not this product</span>
        )}
        {state === 'missing' && !required && <span className="photo-slot-flag muted">Empty</span>}
      </div>
      <p className="admin-hint">{hint}</p>

      <PhotoDropzone
        label={state === 'own' ? 'Replace photo' : 'Upload photo'}
        inputLabel={`Choose a file for the ${label.toLowerCase()}`}
        busy={busy}
        onFiles={(files) => upload(files)}
      >
        {value ? (
          // A plain <img>: this previews a just-uploaded file behind the admin
          // login, where the loader and its responsive variants have nothing to
          // add and the file may not be on the CDN yet.
          <img className="photo-slot-preview" src={value} alt={`${label} preview`} />
        ) : (
          <div className="photo-slot-empty" aria-hidden="true">
            No photo yet
          </div>
        )}
      </PhotoDropzone>

      <label className="admin-label" htmlFor={fieldId}>
        <span className="sr-only">{label} URL</span>
        <input
          id={fieldId}
          className="admin-input"
          name={slotKey}
          data-upload-managed="true"
          value={value}
          placeholder="/media/… or paste an address"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>

      <div className="photo-slot-actions">
        {value && (
          <button
            className="text-button danger"
            type="button"
            onClick={() => {
              onChange('');
              setStatus({ text: 'Removed. Save the form to apply it.', state: 'success' });
            }}
          >
            Remove
          </button>
        )}
        {status.text && (
          <span className="admin-upload-status" data-state={status.state} role="status">
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProductPhotoManager({
  product
}: {
  product?: {
    imageUrl: string | null;
    lifestyleImageUrl: string | null;
    detailImageUrl: string | null;
    scaleImageUrl: string | null;
    packagingImageUrl: string | null;
    galleryImages: string[];
  };
}) {
  const [slots, setSlots] = useState<SlotValues>({
    imageUrl: product?.imageUrl || '',
    lifestyleImageUrl: product?.lifestyleImageUrl || '',
    detailImageUrl: product?.detailImageUrl || '',
    scaleImageUrl: product?.scaleImageUrl || '',
    packagingImageUrl: product?.packagingImageUrl || ''
  });
  const [gallery, setGallery] = useState<string[]>(product?.galleryImages || []);
  const [typedUrl, setTypedUrl] = useState('');
  const dragged = useRef<number | null>(null);

  const addToGallery = useCallback((url: string) => {
    setGallery((current) =>
      current.includes(url) || current.length >= GALLERY_LIMIT ? current : [...current, url]
    );
  }, []);

  const { upload, status, busy } = useUploader(addToGallery);
  const room = GALLERY_LIMIT - gallery.length;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= gallery.length || from === to) return;
    setGallery((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /**
   * Promoting an extra photo swaps it with the main one rather than overwriting
   * it. Overwriting would silently delete whatever was in the main slot, which
   * on a product with one good photograph and one better one is the wrong half
   * to lose.
   */
  const makePrimary = (index: number) => {
    const promoted = gallery[index];
    const demoted = slots.imageUrl;
    setSlots((current) => ({ ...current, imageUrl: promoted }));
    setGallery((current) =>
      demoted
        ? current.map((url, at) => (at === index ? demoted : url))
        : current.filter((_, at) => at !== index)
    );
  };

  return (
    <fieldset className="photo-manager">
      <legend>Photographs</legend>
      <p className="admin-hint">
        Photos are resized and converted on this device before they upload, so a picture straight
        off your phone is fine. The shop serves the right size for each screen automatically.
      </p>

      <div className="photo-slot-grid">
        {PHOTO_SLOTS.map((slot) => (
          <SlotEditor
            key={slot.key}
            slotKey={slot.key}
            label={slot.label}
            hint={slot.hint}
            required={slot.required}
            value={slots[slot.key]}
            onChange={(value) => setSlots((current) => ({ ...current, [slot.key]: value }))}
          />
        ))}
      </div>

      <div className="photo-gallery-editor">
        <div className="photo-slot-head">
          <b>Additional photographs</b>
          <span className="photo-slot-flag muted">
            {gallery.length} of {GALLERY_LIMIT}
          </span>
        </div>
        <p className="admin-hint">
          Any other angles worth showing. Drag a photo to reorder it, or use the arrows — the order
          here is the order customers see.
        </p>

        <input type="hidden" name="galleryImages" value={gallery.join('\n')} />

        {gallery.length > 0 && (
          <ol className="photo-gallery-list">
            {gallery.map((url, index) => (
              <li
                key={`${url}-${index}`}
                draggable
                onDragStart={() => {
                  dragged.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged.current !== null) move(dragged.current, index);
                  dragged.current = null;
                }}
              >
                {/* Plain <img> for the same reason as the slot preview above. */}
                <img src={url} alt={`Additional photograph ${index + 1}`} />
                <div className="photo-gallery-controls">
                  <button
                    className="text-button"
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <span aria-hidden="true">←</span>
                    <span className="sr-only">Move photograph {index + 1} earlier</span>
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={index === gallery.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">Move photograph {index + 1} later</span>
                  </button>
                  <button className="text-button" type="button" onClick={() => makePrimary(index)}>
                    Make main
                  </button>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => setGallery((current) => current.filter((_, at) => at !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <PhotoDropzone
          label={room > 0 ? 'Upload photos' : `Limit is ${GALLERY_LIMIT} photos`}
          inputLabel="Choose files for the additional photographs"
          busy={busy || room <= 0}
          multiple
          onFiles={(files) => upload(files, Math.max(0, room))}
        />

        <div className="photo-url-add">
          <label className="admin-label">
            <span className="sr-only">Add a photograph by address</span>
            <input
              className="admin-input"
              value={typedUrl}
              placeholder="Or paste a photo address"
              onChange={(event) => setTypedUrl(event.target.value)}
            />
          </label>
          <button
            className="btn outline small"
            type="button"
            disabled={!typedUrl.trim() || room <= 0}
            onClick={() => {
              addToGallery(typedUrl.trim());
              setTypedUrl('');
            }}
          >
            Add
          </button>
        </div>

        {status.text && (
          <span className="admin-upload-status" data-state={status.state} role="status">
            {status.text}
          </span>
        )}
      </div>
    </fieldset>
  );
}
