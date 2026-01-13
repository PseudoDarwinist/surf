<script lang="ts">
  import { getAllContexts, mount, onMount, onDestroy, unmount } from 'svelte'
  import { useOverlayManager, type Overlay } from '@deta/services/views'
  import type { Fn } from '@deta/types'
  import { copyStyles } from '@deta/utils/src/dom/copy-styles.svelte'

  import OverlayConsumer from './OverlayConsumer.svelte'
  import type { OverlayProps } from './types.js'

  // Debug logging prefix
  const LOG_PREFIX = '[Overlay.svelte]'

  let { bounds, children, disabled, autofocus = false, persistent = false }: OverlayProps = $props()

  const overlayManager = useOverlayManager()

  let overlay: Overlay
  let instance: ReturnType<typeof mount> | null

  function unmountInstance() {
    if (overlay) {
      overlayManager.destroy(overlay.id)
    }

    if (instance) {
      unmount(instance)
      instance = null
    }
  }

  let unsubs: Fn[] = []

  $effect(() => {
    if (bounds) overlay?.saveBounds(bounds)
  })

  onMount(async () => {
    console.log(LOG_PREFIX, '=== OVERLAY COMPONENT MOUNTING ===')
    console.log(LOG_PREFIX, 'Props:', { bounds, persistent, autofocus, disabled })

    try {
      overlay = await overlayManager.create({ bounds, persistent })
      console.log(LOG_PREFIX, 'Overlay created successfully:', overlay?.id)

      instance = mount(OverlayConsumer, {
        target: overlay.wrapperElement,
        props: { children }
      })
      console.log(LOG_PREFIX, 'OverlayConsumer mounted, target:', overlay.wrapperElement)

      unsubs.push(copyStyles(overlay.window))

      if (autofocus) {
        console.log(LOG_PREFIX, 'Auto-focusing overlay')
        overlay.focus()

        // sue me
        setTimeout(() => {
          overlay.focus()
        }, 100)

        setTimeout(() => {
          overlay.focus()
        }, 300)

        setTimeout(() => {
          overlay.focus()
        }, 400)
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Failed to create overlay:', err)
    }
  })

  onDestroy(() => {
    console.log(LOG_PREFIX, '=== OVERLAY COMPONENT DESTROYING ===', overlay?.id)
    unsubs.forEach((unsub) => unsub())

    unmountInstance()
  })
</script>

{#if disabled}
  {@render children?.()}
{/if}
