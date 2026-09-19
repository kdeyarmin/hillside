'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import ResilientImage from '@/components/ResilientImage';
import { trapTabKey } from '@/lib/focus-trap';
import type { ProductPhoto } from '@/lib/product-photos';

/** How much larger a photograph becomes on a tap inside the lightbox. */
const ZOOM = 2.5;

/** Pointer travel under which a press still counts as a tap, in CSS pixels. */
const TAP_TRAVEL = 6;

/**
 * A product photograph at full size, and then closer.
 *
 * The product page shows each photograph cropped to a square-ish frame, which
 * is right for a page and wrong for deciding whether the variegation is real:
 * shoppers were pinching a picture that would not grow. This shows the whole
 * photograph, and a tap on it zooms into that spot — the pointer's position
 * becomes the centre — after which the frame scrolls, so a finger drags it
 * natively and a mouse drags it through the pointer handlers below. Arrow keys
 * and the arrows on screen move between photographs; Escape closes; Tab stays
 * inside, as it does in the cart drawer and the planter gallery.
 *
 * The zoomed size is worked out from the displayed size at the moment of the
 * tap rather than from a percentage, because the displayed size depends on
 * which of width and height the frame ran out of first.
 */
export default function PhotoLightbox({
  photos,
  name,
  index,
  onChange,
  onClose
}: {
  photos: ProductPhoto[];
  name: string;
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const count = photos.length;
  const current = photos[Math.min(index, count - 1)];
  const [zoomed, setZoomed] = useState(false);
  const [zoomWidth, setZoomWidth] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Where the tap landed, as fractions of the photograph, until the zoomed layout has painted. */
  const pendingFocus = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  /** A click that follows a drag is the end of the drag, not a tap. */
  const suppressClick = useRef(false);

  /** The photograph itself, which `ResilientImage` renders without a ref. */
  const stageImage = () =>
    stageRef.current?.querySelector<HTMLImageElement>('.photo-lightbox-image') ?? null;

  const zoomOut = useCallback(() => {
    setZoomed(false);
    setZoomWidth(null);
  }, []);

  const show = useCallback(
    (next: number) => {
      if (count <= 1) return;
      zoomOut();
      onChange(((next % count) + count) % count);
    },
    [count, onChange, zoomOut]
  );

  /**
   * Scroll lock and the first focus, once per opening. Kept apart from the key
   * handling below, which re-binds as the photograph changes: with the two
   * together, every arrow press yanked focus back to the close button.
   */
  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight' && count > 1) {
        event.preventDefault();
        show(index + 1);
        return;
      }
      if (event.key === 'ArrowLeft' && count > 1) {
        event.preventDefault();
        show(index - 1);
        return;
      }
      if (event.key !== 'Tab') return;
      if (trapTabKey(event, dialogRef.current, closeButtonRef.current)) event.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [count, index, onClose, show]);

  /**
   * Once the zoomed photograph has been laid out, scroll the frame so the spot
   * that was tapped sits in the middle of it. A layout effect rather than a
   * frame later, so the eye never sees the top-left corner first.
   */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const image = stageImage();
    const focus = pendingFocus.current;
    if (!zoomed || !stage || !image || !focus) return;
    pendingFocus.current = null;
    stage.scrollLeft = focus.x * image.clientWidth - stage.clientWidth / 2;
    stage.scrollTop = focus.y * image.clientHeight - stage.clientHeight / 2;
  }, [zoomed, zoomWidth]);

  const zoomIn = (clientX?: number, clientY?: number) => {
    const image = stageImage();
    if (!image) return;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    pendingFocus.current = {
      x: clientX == null ? 0.5 : clamp((clientX - rect.left) / rect.width),
      y: clientY == null ? 0.5 : clamp((clientY - rect.top) / rect.height)
    };
    setZoomWidth(Math.round(rect.width * ZOOM));
    setZoomed(true);
  };

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    /**
     * Zoomed, any press that was not a drag zooms back out — including one
     * the pointer capture above retargeted from the photograph to the frame.
     * Unzoomed, the letterbox beside a portrait photograph is not the
     * photograph, and a press on it does nothing.
     */
    if (zoomed) {
      zoomOut();
      return;
    }
    if (event.target !== stageImage()) return;
    zoomIn(event.clientX, event.clientY);
  };

  /**
   * Mouse panning. A finger scrolls the zoomed frame natively (`touch-action`
   * allows it), but a mouse has no gesture for scrolling sideways, so a press
   * and drag moves the frame by the same distance. Pointer capture keeps the
   * drag alive when the pointer leaves the frame mid-gesture.
   */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!zoomed || event.pointerType === 'touch' || event.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: stage.scrollLeft,
      top: stage.scrollTop,
      moved: false
    };
    stage.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    const stage = stageRef.current;
    if (!active || !stage || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) > TAP_TRAVEL) active.moved = true;
    if (!active.moved) return;
    stage.scrollLeft = active.left - dx;
    stage.scrollTop = active.top - dy;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    if (active.moved) suppressClick.current = true;
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };

  const position = count > 1 ? `${Math.min(index, count - 1) + 1} of ${count}` : null;

  /**
   * Rendered at the end of the body rather than where the gallery sits. The
   * gallery lives in the product page's pinned column, and `position: sticky`
   * makes a stacking context — so a fixed layer inside it, whatever its
   * z-index, paints beneath the site header, which covered the lightbox's
   * title and close button. This only renders after a click, so there is
   * always a document to render into.
   */
  return createPortal(
    <div className="drawer-layer">
      <div
        className="photo-lightbox"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} photographs`}
      >
        <div className="photo-lightbox-bar">
          <span className="photo-lightbox-title">
            {name}
            {count > 1 && (
              <small>
                {current.caption} · {position}
              </small>
            )}
          </span>
          <div className="photo-lightbox-tools">
            <button
              className="icon-button"
              type="button"
              onClick={() => (zoomed ? zoomOut() : zoomIn())}
              aria-pressed={zoomed}
              aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
            >
              {zoomed ? <ZoomOut /> : <ZoomIn />}
            </button>
            <button
              className="icon-button"
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close photographs"
            >
              <X />
            </button>
          </div>
        </div>

        {/* The handlers are the mouse's way of doing what a finger does
            natively; the buttons above are the keyboard's. The frame itself is
            not a control, so it carries no role. */}
        <div
          className={zoomed ? 'photo-lightbox-stage zoomed' : 'photo-lightbox-stage'}
          ref={stageRef}
          onClick={handleStageClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <ResilientImage
            className="photo-lightbox-image"
            src={current.src}
            fallbackSrc="/images/botanical-placeholder.svg"
            alt={count > 1 ? `${name} — ${current.caption.toLowerCase()}` : name}
            width={1600}
            height={1600}
            /* Wider than the viewport on purpose: the candidate chosen has to
               survive being zoomed, or the close-up is a blur of the same
               file the page already had. */
            sizes={`${Math.round(ZOOM * 100)}vw`}
            loading="eager"
            decoding="async"
            style={zoomed && zoomWidth ? { width: zoomWidth } : undefined}
          />
        </div>

        {count > 1 && (
          <>
            <button
              className="icon-button photo-lightbox-arrow prev"
              type="button"
              onClick={() => show(index - 1)}
              aria-label="Previous photograph"
            >
              <ChevronLeft />
            </button>
            <button
              className="icon-button photo-lightbox-arrow next"
              type="button"
              onClick={() => show(index + 1)}
              aria-label="Next photograph"
            >
              <ChevronRight />
            </button>
          </>
        )}

        <div className="photo-lightbox-foot">
          {count > 1 && (
            <div className="photo-lightbox-thumbs" role="group" aria-label="Choose a photograph">
              {photos.map((photo, thumbIndex) => (
                <button
                  type="button"
                  className={thumbIndex === index ? 'active' : ''}
                  aria-pressed={thumbIndex === index}
                  aria-label={`Show ${photo.caption.toLowerCase()} — photograph ${thumbIndex + 1} of ${count}`}
                  onClick={() => show(thumbIndex)}
                  key={`${photo.src}-${thumbIndex}`}
                >
                  <ResilientImage
                    sizeRole="thumb"
                    src={photo.src}
                    fallbackSrc="/images/botanical-placeholder.svg"
                    alt=""
                    aria-hidden="true"
                    width={112}
                    height={112}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          )}
          <p className="photo-lightbox-hint" aria-live="polite">
            {zoomed
              ? 'Drag to look around. Tap the photograph to zoom back out.'
              : 'Tap the photograph to zoom in on that spot.'}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
