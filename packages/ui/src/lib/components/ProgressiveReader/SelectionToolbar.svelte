<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { fly, fade } from 'svelte/transition'

  export let visible: boolean = false
  export let position: { x: number; y: number } = { x: 0, y: 0 }
  // Optional: context to know if we are selecting text or image (default 'text')
  export let context: 'text' | 'image' = 'text'

  const dispatch = createEventDispatcher<{
    select: { option: 'tldr' | 'visual' | 'explain' | 'realworld' | 'bigpicture' }
    highlight: { color: string }
    close: void
  }>()

  // AI Actions with SVG icons
  const aiOptions = [
    { 
      id: 'tldr', 
      label: 'TL;DR', 
      path: 'M4 6h16M4 12h10M4 18h7' // Summary/condensed text icon
    },
    { 
      id: 'visual', 
      label: 'Visual', 
      path: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' // Eye icon for visualization
    },
    { 
      id: 'explain', 
      label: 'Explain', 
      path: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z' // Info
    },
    { 
      id: 'realworld', 
      label: 'Real World', 
      path: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10ZM9 12l2 2 4-4' // Globe with checkmark
    },
    { 
      id: 'bigpicture', 
      label: 'Big Picture', 
      path: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm4 3h6v2H9V8zm0 4h6v2H9v-2z' // Map/Overview icon
    }
  ] as const

  // Highlight Colors
  const highlightColors = [
    { id: 'yellow', value: '#FDE047' },
    { id: 'green', value: '#86EFAC' },
    { id: 'blue', value: '#93C5FD' },
    { id: 'purple', value: '#D8B4FE' },
    { id: 'red', value: '#FCA5A5' },
    { id: 'orange', value: '#FDBA74' }
  ]

  let showColors = false
  let activeColor = highlightColors[0].value

  function handleOptionClick(option: typeof aiOptions[number]['id']) {
    dispatch('select', { option })
  }

  function handleHighlightClick() {
    dispatch('highlight', { color: activeColor })
    // showColors = false // Close after pick? Maybe not.
  }
  
  function handleColorSelect(color: string) {
    activeColor = color
    dispatch('highlight', { color })
    showColors = false
  }

  function handleClose() {
    dispatch('close')
    showColors = false
  }

  function toggleColors(e: MouseEvent) {
    e.stopPropagation()
    showColors = !showColors
  }
</script>

{#if visible}
  <!-- 
    Layout: 
    [ AI Options ] | [ Pen | Color ] [ v ] | [ Close ]
  -->
  <div
    class="selection-toolbar-root"
    style="left: {position.x}px; top: {position.y}px;"
    transition:fly={{ y: 10, duration: 200, opacity: 0 }}
    role="toolbar"
    aria-label="Text selection tools"
  >
    <div class="toolbar-main">
      <!-- AI Actions Group -->
      <div class="action-group">
        {#each aiOptions as option}
          <button
            class="tool-btn ai-btn"
            on:click={() => handleOptionClick(option.id)}
            title={option.label}
          >
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d={option.path} />
            </svg>
            <span class="btn-label">{option.label}</span>
          </button>
        {/each}
      </div>

      <div class="divider"></div>

      <!-- Highlight Tool Combined -->
      <div class="action-group highlight-group">
        <button 
          class="tool-btn highlight-btn" 
          on:click={handleHighlightClick}
          title="Highlight"
        >
          <svg class="icon small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15.23 2.76a2 2 0 0 1 2.59.25l1.17 1.17a2 2 0 0 1 .25 2.59L6.75 19.25l-4.5 1.5 1.5-4.5 12.48-13.49Z" />
          </svg>
          <span class="color-bit" style:background-color={activeColor}></span>
        </button>
        
        <button 
          class="tool-btn dropdown-btn"
          class:active={showColors}
          on:click={toggleColors}
          title="Select Color"
        >
          <svg class="icon micro-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        {#if showColors}
          <div class="color-dropdown" transition:fade={{ duration: 100 }}>
             {#each highlightColors as color}
               <button 
                 class="color-option" 
                 class:selected={activeColor === color.value}
                 style:background-color={color.value}
                 on:click|stopPropagation={() => handleColorSelect(color.value)}
                 title={color.id}
               ></button>
             {/each}
          </div>
        {/if}
      </div>

      <!-- Close Button Separated -->
      <!-- <div class="divider"></div> -->
      <div class="action-group">
          <div class="divider-small"></div>
          <button 
            class="tool-btn icon-only close-btn" 
            on:click={handleClose}
            title="Close"
          >
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
      </div>

    </div>

    <!-- Arrow -->
    <div class="arrow"></div>
  </div>
{/if}

<style lang="scss">
  .selection-toolbar-root {
    position: fixed;
    z-index: 9999;
    transform: translate(-50%, -100%);
    margin-top: -12px; /* Gap from selection */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05)) drop-shadow(0 10px 15px rgba(0,0,0,0.1));
  }

  .toolbar-main {
    background: #FBF8F1; /* Cream background like screenshot */
    border: 1px solid #EBE5DA;
    border-radius: 12px;
    padding: 4px 6px; /* Slightly tighter padding */
    display: flex;
    align-items: center;
    gap: 2px;
    height: 44px;
    box-sizing: border-box;
  }

  .action-group {
    display: flex;
    align-items: center;
    gap: 2px;
    position: relative;
  }

  .highlight-group {
    position: relative;
    background: rgba(0,0,0,0.03); /* Subtle group bg like generic input group */
    border-radius: 8px;
    padding: 2px;
    gap: 0; 
  }

  .divider {
    width: 1px;
    height: 24px;
    background: #EBE5DA;
    margin: 0 6px;
  }
  
  .divider-small {
     width: 1px;
     height: 24px;
     background: #EBE5DA;
     margin: 0 4px 0 8px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: #5D5650;
    border-radius: 6px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    height: 32px;

    /* Highlight group specific styling */
    &.highlight-btn {
        padding: 6px 8px;
        gap: 6px;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        &:hover { background: #EFE9DB; }
    }
    
    &.dropdown-btn {
        padding: 6px 4px;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-left: 1px solid rgba(0,0,0,0.05); /* Separator inside group */
        &:hover { background: #EFE9DB; }
        &.active { background: #EFE9DB; }
    }

    &.ai-btn:hover {
      background: #EFE9DB;
      color: #1A1A1A;
    }

    &.icon-only {
      padding: 6px;
      width: 32px;
      justify-content: center;
      
      &:hover {
          background: #EFE9DB;
          color: #1A1A1A;
      }
    }

    &.close-btn {
      opacity: 0.5;
      &:hover {
        opacity: 0.8;
      }
    }
  }

  .icon {
    width: 16px;
    height: 16px;
    stroke-width: 2px;
    
    &.small-icon {
        width: 14px;
        height: 14px;
    }
    &.micro-icon {
        width: 12px;
        height: 12px;
    }
  }

  .btn-label {
    line-height: 1;
  }

  .color-bit {
    width: 10px;
    height: 10px;
    border-radius: 2px; /* Square bit as requested */
    border: 1px solid rgba(0,0,0,0.1);
  }

  /* Color Dropdown */
  .color-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    background: #FBF8F1;
    border: 1px solid #EBE5DA;
    border-radius: 8px;
    padding: 6px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 100;
  }

  .color-option {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.1);
    cursor: pointer;
    transition: transform 0.1s;
    
    &:hover {
        transform: scale(1.1);
        border-color: rgba(0,0,0,0.3);
    }
    
    &.selected {
        border: 2px solid #5D5650;
    }
  }

  .arrow {
    width: 12px;
    height: 12px;
    background: #FBF8F1;
    border-right: 1px solid #EBE5DA;
    border-bottom: 1px solid #EBE5DA;
    transform: rotate(45deg) translateY(-50%);
    margin-top: -6px;
  }

  /* Dark mode overrides */
  :global([data-theme="dark"]) {
    .toolbar-main, .color-dropdown, .arrow {
      background: #1F1F1F;
      border-color: #333;
    }
    
    .highlight-group {
        background: rgba(255,255,255,0.05);
    }
    
    .dropdown-btn {
        border-left-color: rgba(255,255,255,0.1);
    }

    .tool-btn {
      color: #AAA;
      &:hover {
        background: #333;
        color: #FFF;
      }
    }

    .divider, .divider-small {
      background: #333;
    }
  }
</style>
