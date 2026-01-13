<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Icon } from '@deta/icons'
  import {
    readingPreferences,
    defaultPreferences,
    type ReadingPreferences
  } from './readingPreferences.store'

  export let open: boolean = false

  const dispatch = createEventDispatcher<{
    close: void
  }>()

  function handleClose() {
    dispatch('close')
  }

  // Local reactive bindings
  $: prefs = $readingPreferences

  function setReadingMode(mode: ReadingPreferences['readingMode']) {
    readingPreferences.setReadingMode(mode)
  }

  function handleFontSizeChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value)
    readingPreferences.setFontSize(value)
  }

  function handleLineHeightChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value)
    readingPreferences.setLineHeight(value)
  }

  function handleFontFamilyChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as ReadingPreferences['fontFamily']
    readingPreferences.setFontFamily(value)
  }

  function handleThemeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as ReadingPreferences['theme']
    readingPreferences.setTheme(value)
  }

  function resetToDefault() {
    readingPreferences.reset()
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div class="prefs-backdrop" on:click={handleClose} on:keydown={() => {}} role="presentation"></div>
  
  <!-- Popover Panel -->
  <aside class="reading-preferences">
    <header class="prefs-header">
      <div class="header-title">
        <Icon name="type" size={16} />
        <span>Reading Preferences</span>
      </div>
      <button class="close-btn" on:click={handleClose} title="Close">
        <Icon name="x" size={16} />
      </button>
    </header>

    <div class="prefs-content">
      <!-- Text Revealing Animation -->
      <section class="pref-section">
        <div class="section-header">
          <Icon name="eye" size={14} />
          <span>Text Revealing Animation</span>
        </div>
        <label class="toggle-row">
          <span class="toggle-label">Word-by-word</span>
          <button
            class="toggle-switch"
            class:active={prefs.wordByWordAnimation}
            on:click={() => readingPreferences.toggleWordByWord()}
            role="switch"
            aria-checked={prefs.wordByWordAnimation}
          >
            <span class="toggle-knob"></span>
          </button>
        </label>
        <p class="section-hint">Text appears word by word for a typewriter effect.</p>
      </section>

      <!-- Theme -->
      <section class="pref-section">
        <div class="section-header">
          <Icon name="palette" size={14} />
          <span>Theme</span>
        </div>
        <select class="pref-select" value={prefs.theme} on:change={handleThemeChange}>
          <option value="pixyll">Pixyll</option>
          <option value="default">Default</option>
          <option value="academic">Academic</option>
          <option value="minimal">Minimal</option>
        </select>
        <p class="section-hint">Classic serif for long-form reading</p>
      </section>

      <!-- Reading Mode -->
      <section class="pref-section">
        <div class="section-header">
          <Icon name="sun" size={14} />
          <span>Reading Mode</span>
        </div>
        <div class="mode-buttons">
          <button
            class="mode-btn"
            class:active={prefs.readingMode === 'normal'}
            on:click={() => setReadingMode('normal')}
          >
            <Icon name="sun" size={14} />
            <span>Normal</span>
          </button>
          <button
            class="mode-btn sepia"
            class:active={prefs.readingMode === 'sepia'}
            on:click={() => setReadingMode('sepia')}
          >
            <Icon name="book-open" size={14} />
            <span>Sepia</span>
          </button>
          <button
            class="mode-btn night"
            class:active={prefs.readingMode === 'night'}
            on:click={() => setReadingMode('night')}
          >
            <Icon name="moon" size={14} />
            <span>Night</span>
          </button>
        </div>
      </section>

      <!-- Font Family -->
      <section class="pref-section">
        <div class="section-header">
          <span>Font Family</span>
        </div>
        <select class="pref-select" value={prefs.fontFamily} on:change={handleFontFamilyChange}>
          <option value="serif">Serif</option>
          <option value="system">System</option>
          <option value="mono">Monospace</option>
        </select>
      </section>

      <!-- Font Size -->
      <section class="pref-section">
        <div class="section-header">
          <span>Font Size: {prefs.fontSize}px</span>
        </div>
        <input
          type="range"
          class="pref-slider"
          min="14"
          max="24"
          step="1"
          value={prefs.fontSize}
          on:input={handleFontSizeChange}
        />
      </section>

      <!-- Line Height -->
      <section class="pref-section">
        <div class="section-header">
          <span>Line Height: {prefs.lineHeight.toFixed(1)}</span>
        </div>
        <input
          type="range"
          class="pref-slider"
          min="1.4"
          max="2.2"
          step="0.1"
          value={prefs.lineHeight}
          on:input={handleLineHeightChange}
        />
        <button class="reset-link" on:click={resetToDefault}>
          Reset to theme default ({defaultPreferences.lineHeight})
        </button>
      </section>

      <!-- Page Width -->
      <section class="pref-section">
        <div class="section-header">
          <span>Page Width: {prefs.maxWidth || 680}px</span>
        </div>
        <input
          type="range"
          class="pref-slider"
          min="500"
          max="1200"
          step="20"
          value={prefs.maxWidth || 680}
          on:input={(e) => readingPreferences.setMaxWidth(parseInt(e.currentTarget.value))}
        />
      </section>
    </div>
  </aside>
{/if}

<style>
  .prefs-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.2);
    z-index: 999;
  }

  .reading-preferences {
    position: fixed;
    top: 50%;
    right: 2rem;
    transform: translateY(-50%);
    width: 300px;
    max-height: 80vh;
    background: #f7f3e9;  /* ChapterPal sepia */
    border: 1px solid rgba(212, 197, 169, 0.3);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(91, 70, 54, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1000;
  }

  .prefs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(212, 197, 169, 0.2);
    background: #f7f3e9;  /* ChapterPal sepia */
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #5b4636;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #8b7355;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: rgba(139, 115, 85, 0.1);
    color: #5b4636;
  }

  .prefs-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 1.25rem 1.5rem;
  }

  .pref-section {
    padding: 1rem 0;
    border-bottom: 1px solid rgba(139, 115, 85, 0.08);
  }

  .pref-section:last-child {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #5b4636;
    margin-bottom: 0.75rem;
  }

  .section-hint {
    font-size: 0.75rem;
    color: #8b7355;
    margin: 0.5rem 0 0;
    line-height: 1.4;
  }

  /* Toggle Switch */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 0.8125rem;
    color: #5b4636;
  }

  .toggle-switch {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: rgba(139, 115, 85, 0.2);
    border: none;
    padding: 2px;
    cursor: pointer;
    transition: background 0.2s ease;
    position: relative;
  }

  .toggle-switch.active {
    background: #b45309;
  }

  .toggle-knob {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s ease;
  }

  .toggle-switch.active .toggle-knob {
    transform: translateX(20px);
  }

  /* Select */
  .pref-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(139, 115, 85, 0.2);
    border-radius: 6px;
    background: #fff;
    font-size: 0.8125rem;
    color: #5b4636;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b7355' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2rem;
  }

  .pref-select:focus {
    outline: none;
    border-color: #b45309;
  }

  /* Mode Buttons */
  .mode-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.5rem;
    border: 1px solid rgba(139, 115, 85, 0.2);
    border-radius: 8px;
    background: #fff;
    color: #8b7355;
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    border-color: rgba(139, 115, 85, 0.4);
    color: #5b4636;
  }

  .mode-btn.active {
    border-color: #b45309;
    background: rgba(180, 83, 9, 0.05);
    color: #b45309;
  }

  .mode-btn.sepia {
    background: transparent;
    border: 1px solid rgba(139, 115, 85, 0.2);
  }

  .mode-btn.sepia.active {
    background: #f3eade;  /* Slightly darker when active */
    border-color: #b45309;
  }

  .mode-btn.night {
    background: #2d2d2d;
    color: #e5e5e5;
    border-color: #404040;
  }

  .mode-btn.night.active {
    border-color: #b45309;
    background: #2d2d2d;
    color: #fff;
  }

  /* Slider */
  .pref-slider {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(139, 115, 85, 0.2);
    appearance: none;
    cursor: pointer;
  }

  .pref-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #b45309;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .pref-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #b45309;
    cursor: pointer;
    border: none;
  }

  /* Reset Link */
  .reset-link {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0;
    border: none;
    background: none;
    color: #b45309;
    font-size: 0.75rem;
    cursor: pointer;
    text-decoration: none;
  }

  .reset-link:hover {
    text-decoration: underline;
  }
</style>
