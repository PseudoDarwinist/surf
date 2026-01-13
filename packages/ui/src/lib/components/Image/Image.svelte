<script lang="ts">
  import { Icon, type Icons } from '@deta/icons'

  export let src: string
  export let alt: string
  export let error = false
  export let fallbackIcon: Icons = 'file'
  export let emptyOnError = false
  export let decoding: 'auto' | 'async' | 'sync' = 'auto'
  export let loading: 'eager' | 'lazy' = 'eager'

  const handleError = (_e: Event) => {
    error = true
  }

  const handleContextMenu = (e: MouseEvent) => {
    console.log('[Image] contextmenu event', { src, hasApi: typeof window !== 'undefined' && 'api' in window })
    // Only handle surf:// protocol images with custom context menu
    if (src.startsWith('surf://')) {
      e.preventDefault()
      e.stopPropagation()
      if (typeof window !== 'undefined' && 'api' in window) {
        // @ts-ignore - window.api is exposed by preload
        window.api.showImageContextMenu(src, e.clientX, e.clientY)
      } else {
        console.error('[Image] window.api not available for context menu')
      }
    }
  }
</script>

{#if !error}
  <img
    {src}
    {alt}
    {...$$restProps}
    on:error={handleError}
    on:contextmenu={handleContextMenu}
    draggable="false"
    {loading}
    {decoding}
  />
{:else if !emptyOnError}
  <div class="image-error">
    <Icon name={fallbackIcon} size="100%" fill="var(--contrast-color)" />
  </div>
{/if}

<style>
  img {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 2px;
    border: 1px solid oklch(93.1% 0 0);
    -webkit-user-drag: auto;
  }
</style>
