<script lang="ts">
  import { onMount } from 'svelte'

  export let url: string = ''
  export let title: string | null = null
  export let description: string | null = null
  export let image: string | null = null
  export let icon: string | null = null
  export let provider: string | null = null
  export let loading: boolean = false
  export let error: boolean = false

  // Extract domain from URL for display
  $: displayDomain = (() => {
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace('www.', '')
    } catch {
      return url
    }
  })()

  function handleClick() {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick()
    }
  }

  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement
    img.style.display = 'none'
  }
</script>

<div
  class="link-preview"
  class:loading
  class:error
  class:has-image={!!image}
  class:empty={!url && !loading}
  role="link"
  tabindex="0"
  on:click={handleClick}
  on:keydown={handleKeydown}
>
  {#if loading}
    <div class="loading-skeleton">
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-title"></div>
        <div class="skeleton-description"></div>
        <div class="skeleton-domain"></div>
      </div>
    </div>
  {:else if error}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-content">
        <div class="error-message">Failed to load preview</div>
        <a href={url} class="error-url" target="_blank" rel="noopener noreferrer">{url}</a>
      </div>
    </div>
  {:else}
    {#if image}
      <div class="preview-image">
        <img src={image} alt={title || 'Link preview'} on:error={handleImageError} />
      </div>
    {/if}
    <div class="preview-content">
      <div class="preview-title">{title || url}</div>
      {#if description}
        <div class="preview-description">{description}</div>
      {/if}
      <div class="preview-meta">
        {#if icon}
          <img src={icon} alt="" class="preview-favicon" on:error={handleImageError} />
        {/if}
        <span class="preview-domain">{provider || displayDomain}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .link-preview {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg-secondary, #fff);
    cursor: pointer;
    transition: all 0.2s ease;
    max-width: 500px;
    margin: 8px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  /* Hide empty link previews to prevent white boxes */
  .link-preview.empty {
    display: none;
  }

  .link-preview:hover {
    border-color: var(--accent, #007aff);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  .link-preview:focus {
    outline: 2px solid var(--accent, #007aff);
    outline-offset: 2px;
  }

  /* Image at top for cards with images */
  .preview-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background: var(--bg-tertiary, #f5f5f5);
  }

  .preview-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .preview-description {
    font-size: 14px;
    color: var(--text-secondary, #666);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .preview-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }

  .preview-favicon {
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }

  .preview-domain {
    font-size: 13px;
    color: var(--text-tertiary, #888);
  }

  /* Loading skeleton */
  .loading-skeleton {
    display: flex;
    flex-direction: column;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-image {
    width: 100%;
    height: 150px;
    background: var(--bg-tertiary, #e0e0e0);
  }

  .skeleton-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-title {
    height: 18px;
    width: 80%;
    background: var(--bg-tertiary, #e0e0e0);
    border-radius: 4px;
  }

  .skeleton-description {
    height: 14px;
    width: 100%;
    background: var(--bg-tertiary, #e0e0e0);
    border-radius: 4px;
  }

  .skeleton-domain {
    height: 12px;
    width: 40%;
    background: var(--bg-tertiary, #e0e0e0);
    border-radius: 4px;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Error state */
  .error-state {
    display: flex;
    align-items: center;
    padding: 16px;
    gap: 12px;
  }

  .error-icon {
    font-size: 24px;
  }

  .error-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .error-message {
    font-size: 14px;
    color: var(--text-secondary, #666);
  }

  .error-url {
    font-size: 13px;
    color: var(--accent, #007aff);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error-url:hover {
    text-decoration: underline;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .link-preview {
      border-color: rgba(255, 255, 255, 0.1);
      background: var(--bg-secondary, #2a2a2a);
    }

    .preview-title {
      color: var(--text-primary, #fff);
    }

    .preview-description {
      color: var(--text-secondary, #aaa);
    }

    .preview-domain {
      color: var(--text-tertiary, #888);
    }

    .skeleton-image,
    .skeleton-title,
    .skeleton-description,
    .skeleton-domain {
      background: var(--bg-tertiary, #3a3a3a);
    }
  }
</style>
