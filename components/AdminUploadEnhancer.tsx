'use client';

import { useEffect } from 'react';
import { formatBytes, uploadImageFile } from '@/lib/image-compress';

/**
 * Adds a file picker and a drop target to the plain photo-URL fields on the
 * dashboard's other forms — collections, classes, the gallery, Amazon picks,
 * care sheets. The product form has its own richer editor
 * (`ProductPhotoManager`) and opts out with `data-upload-managed`, so these two
 * never both attach to the same field.
 */

function updateInput(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) nativeSetter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function enhanceImageInput(input: HTMLInputElement) {
  if (input.dataset.uploadEnhanced === 'true') return;
  input.dataset.uploadEnhanced = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'admin-upload-tools';

  const heading = document.createElement('div');
  heading.className = 'admin-upload-heading';
  heading.textContent = 'Upload a photo from this device';

  const help = document.createElement('p');
  help.textContent =
    'Choose a photo or drop one here. It is resized on this device before it uploads, so a picture straight off your phone is fine.';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'admin-upload-file';
  fileInput.tabIndex = -1;
  // The visible button is not this input's accessible name, and hiding a
  // programmatically focusable control from assistive technology is its own
  // problem, so it gets a name of its own.
  fileInput.setAttribute('aria-label', 'Choose a photo to upload');

  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.className = 'btn outline small';
  chooseButton.textContent = 'Choose and upload photo';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'text-button danger';
  clearButton.textContent = 'Remove photo';

  const status = document.createElement('span');
  status.className = 'admin-upload-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const controls = document.createElement('div');
  controls.className = 'admin-upload-controls';
  controls.append(chooseButton, clearButton, status);

  const preview = document.createElement('img');
  preview.className = 'admin-upload-preview';
  preview.alt = 'Selected admin photo preview';

  const refreshPreview = () => {
    const url = input.value.trim();
    preview.hidden = !url;
    clearButton.hidden = !url;
    if (url) preview.src = url;
    else preview.removeAttribute('src');
  };

  chooseButton.addEventListener('click', () => fileInput.click());
  clearButton.addEventListener('click', () => {
    updateInput(input, '');
    status.textContent = 'Photo removed from this form. Save the form to apply the change.';
    status.dataset.state = 'success';
    refreshPreview();
  });
  input.addEventListener('input', refreshPreview);

  const send = async (file: File | undefined) => {
    if (!file) return;

    chooseButton.disabled = true;
    chooseButton.textContent = 'Uploading…';
    status.textContent = '';
    status.dataset.state = '';

    try {
      const { url, prepared } = await uploadImageFile(file);
      const saved = prepared.originalBytes - prepared.uploadedBytes;
      updateInput(input, url);
      status.textContent =
        saved > 0
          ? `Upload complete — ${formatBytes(saved)} smaller. Save the form to publish this photo.`
          : 'Upload complete. Save the form to publish this photo.';
      status.dataset.state = 'success';
      refreshPreview();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'The image could not be uploaded.';
      status.dataset.state = 'error';
    } finally {
      chooseButton.disabled = false;
      chooseButton.textContent = 'Choose and upload photo';
      fileInput.value = '';
    }
  };

  fileInput.addEventListener('change', () => void send(fileInput.files?.[0]));
  acceptDrops(wrapper, (files) => void send(files[0]));

  wrapper.append(heading, help, fileInput, controls, preview);
  const anchor = input.closest('label') || input;
  anchor.insertAdjacentElement('afterend', wrapper);
  refreshPreview();
}

/**
 * Turns a panel into a drop target. Both `dragover` and `dragenter` have to be
 * cancelled or the browser navigates to the dropped file instead, which loses
 * whatever was typed into the form.
 */
function acceptDrops(zone: HTMLElement, onFiles: (files: File[]) => void) {
  const stop = (event: DragEvent) => {
    event.preventDefault();
    zone.dataset.dropping = 'true';
  };
  zone.addEventListener('dragenter', stop);
  zone.addEventListener('dragover', stop);
  zone.addEventListener('dragleave', () => delete zone.dataset.dropping);
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    delete zone.dataset.dropping;
    const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length) onFiles(files);
  });
}

export default function AdminUploadEnhancer() {
  useEffect(() => {
    const enhanceAll = () => {
      /* `variantImageUrl` too: a variant may carry its own photograph — the 6"
         decorative planter does not look like the 4" nursery pot — and Tammy
         takes those on her phone like every other one. */
      document
        .querySelectorAll<HTMLInputElement>(
          'input[name="imageUrl"]:not([data-upload-managed]), input[name="variantImageUrl"]:not([data-upload-managed])'
        )
        .forEach(enhanceImageInput);
    };

    enhanceAll();
    const observer = new MutationObserver(enhanceAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      .admin-upload-tools {
        grid-column: 1 / -1;
        display: grid;
        gap: 8px;
        padding: 14px;
        margin: -2px 0 14px;
        border: 1px dashed var(--sage);
        border-radius: 14px;
        background: var(--sage-light);
      }
      .admin-upload-heading {
        color: var(--forest);
        font-weight: 900;
        font-size: 13px;
      }
      .admin-upload-tools p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }
      .admin-upload-file {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .admin-upload-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 9px;
      }
      .admin-upload-status {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .admin-upload-status[data-state='success'] { color: var(--success); }
      .admin-upload-status[data-state='error'] { color: var(--danger); }
      .admin-upload-preview {
        width: min(240px, 100%);
        max-height: 180px;
        object-fit: cover;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: var(--white);
      }
      .admin-upload-tools[data-dropping='true'] {
        border-color: var(--forest);
        background: var(--cream);
      }
    `}</style>
  );
}
