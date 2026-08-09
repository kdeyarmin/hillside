'use client';

import { useEffect } from 'react';

type UploadResponse = { url?: string; error?: string };

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
  help.textContent = 'JPEG, PNG, WebP or GIF — up to 8 MB. The photo URL field above fills in automatically.';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.className = 'admin-upload-file';
  fileInput.tabIndex = -1;

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

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    chooseButton.disabled = true;
    chooseButton.textContent = 'Uploading…';
    status.textContent = '';
    status.dataset.state = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const result = (await response.json()) as UploadResponse;
      if (!response.ok || !result.url) {
        throw new Error(result.error || 'The image could not be uploaded.');
      }
      updateInput(input, result.url);
      status.textContent = 'Upload complete. Save the form to publish this photo.';
      status.dataset.state = 'success';
      refreshPreview();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'The image could not be uploaded.';
      status.dataset.state = 'error';
    } finally {
      chooseButton.disabled = false;
      chooseButton.textContent = 'Choose and upload photo';
      fileInput.value = '';
    }
  });

  wrapper.append(heading, help, fileInput, controls, preview);
  const anchor = input.closest('label') || input;
  anchor.insertAdjacentElement('afterend', wrapper);
  refreshPreview();
}

export default function AdminUploadEnhancer() {
  useEffect(() => {
    const enhanceAll = () => {
      document
        .querySelectorAll<HTMLInputElement>('input[name="imageUrl"]')
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
    `}</style>
  );
}
