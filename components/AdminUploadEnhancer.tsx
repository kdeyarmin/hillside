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

function updateTextarea(textarea: HTMLTextAreaElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) nativeSetter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function galleryUrls(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
    'JPEG, PNG, WebP or GIF — up to 8 MB. The photo URL field above fills in automatically.';

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
      status.textContent =
        error instanceof Error ? error.message : 'The image could not be uploaded.';
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

const GALLERY_LIMIT = 8;

function enhanceGalleryInput(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.uploadEnhanced === 'true') return;
  textarea.dataset.uploadEnhanced = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'admin-upload-tools';

  const heading = document.createElement('div');
  heading.className = 'admin-upload-heading';
  heading.textContent = 'Upload extra photos from this device';

  const help = document.createElement('p');
  help.textContent =
    'JPEG, PNG, WebP or GIF — up to 8 MB each. Each upload is added as another line above (up to 8).';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.className = 'admin-upload-file';
  fileInput.tabIndex = -1;

  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.className = 'btn outline small';
  chooseButton.textContent = 'Upload extra photo';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'text-button danger';
  removeButton.textContent = 'Remove last extra photo';

  const status = document.createElement('span');
  status.className = 'admin-upload-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const controls = document.createElement('div');
  controls.className = 'admin-upload-controls';
  controls.append(chooseButton, removeButton, status);

  const preview = document.createElement('div');
  preview.className = 'admin-upload-gallery';

  const refreshPreview = () => {
    const urls = galleryUrls(textarea.value);
    removeButton.hidden = urls.length === 0;
    chooseButton.disabled = urls.length >= GALLERY_LIMIT;
    preview.replaceChildren();
    for (const url of urls.slice(0, GALLERY_LIMIT)) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      preview.append(image);
    }
    preview.hidden = urls.length === 0;
  };

  chooseButton.addEventListener('click', () => fileInput.click());
  removeButton.addEventListener('click', () => {
    const urls = galleryUrls(textarea.value);
    urls.pop();
    updateTextarea(textarea, urls.join('\n'));
    status.textContent =
      'Last extra photo removed from this form. Save the form to apply the change.';
    status.dataset.state = 'success';
    refreshPreview();
  });
  textarea.addEventListener('input', refreshPreview);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const current = galleryUrls(textarea.value);
    if (current.length >= GALLERY_LIMIT) {
      status.textContent = 'This product already has 8 extra photos.';
      status.dataset.state = 'error';
      fileInput.value = '';
      return;
    }

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
      if (!current.includes(result.url)) current.push(result.url);
      updateTextarea(textarea, current.slice(0, GALLERY_LIMIT).join('\n'));
      status.textContent = 'Upload complete. Save the form to publish this extra photo.';
      status.dataset.state = 'success';
      refreshPreview();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'The image could not be uploaded.';
      status.dataset.state = 'error';
    } finally {
      chooseButton.disabled = galleryUrls(textarea.value).length >= GALLERY_LIMIT;
      chooseButton.textContent = 'Upload extra photo';
      fileInput.value = '';
    }
  });

  wrapper.append(heading, help, fileInput, controls, preview);
  const anchor = textarea.closest('label') || textarea;
  anchor.insertAdjacentElement('afterend', wrapper);
  refreshPreview();
}

export default function AdminUploadEnhancer() {
  useEffect(() => {
    const enhanceAll = () => {
      document
        .querySelectorAll<HTMLInputElement>('input[name="imageUrl"]')
        .forEach(enhanceImageInput);
      document
        .querySelectorAll<HTMLTextAreaElement>('textarea[name="galleryImages"]')
        .forEach(enhanceGalleryInput);
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
      .admin-upload-gallery {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-upload-gallery img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: var(--white);
      }
    `}</style>
  );
}
