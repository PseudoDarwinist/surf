import { writable, derived, get } from 'svelte/store'

export interface ReadingPreferences {
    // Animation
    wordByWordAnimation: boolean

    // Theme
    theme: 'default' | 'pixyll' | 'academic' | 'minimal'
    readingMode: 'normal' | 'sepia' | 'night'

    // Typography
    fontFamily: 'system' | 'serif' | 'mono'
    fontSize: number // 14-24
    lineHeight: number // 1.4-2.2
    maxWidth: number // 500-1200
}

export const defaultPreferences: ReadingPreferences = {
    wordByWordAnimation: true,
    theme: 'pixyll',
    readingMode: 'normal',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.8,
    maxWidth: 680
}

// Sidebar/Panel state
export const readingPreferencesOpen = writable(false)

// Font family mappings
export const fontFamilyMap: Record<ReadingPreferences['fontFamily'], string> = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"SF Mono", "Fira Code", "JetBrains Mono", monospace'
}

// Theme color mappings - matched to ChapterPal
export const themeModeColors: Record<ReadingPreferences['readingMode'], { bg: string; text: string; muted: string }> = {
    normal: {
        bg: '#ffffff',
        text: '#1a1a1a',
        muted: '#6b7280'
    },
    sepia: {
        bg: '#f7f3e9',  // ChapterPal exact sepia background
        text: '#5c4b3b',
        muted: '#8b7355'
    },
    night: {
        bg: '#2d2d2d',  // ChapterPal night background
        text: '#e8e6e3',
        muted: '#9ca3af'
    }
}

// Create the store
function createReadingPreferencesStore() {
    // Try to load from localStorage
    let initial = defaultPreferences

    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem('surf-reading-preferences')
            if (stored) {
                initial = { ...defaultPreferences, ...JSON.parse(stored) }
                // Ensure new fields are populated if loading old prefs
                if (!initial.maxWidth) initial.maxWidth = defaultPreferences.maxWidth
            }
        } catch (e) {
            console.warn('Failed to load reading preferences:', e)
        }
    }

    const store = writable<ReadingPreferences>(initial)

    // Save to localStorage on changes
    store.subscribe((value) => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('surf-reading-preferences', JSON.stringify(value))
            } catch (e) {
                console.warn('Failed to save reading preferences:', e)
            }
        }
    })

    return {
        subscribe: store.subscribe,
        set: store.set,
        update: store.update,

        reset: () => {
            store.set(defaultPreferences)
        },

        setFontSize: (size: number) => {
            store.update((p) => ({ ...p, fontSize: Math.min(24, Math.max(14, size)) }))
        },

        setLineHeight: (height: number) => {
            store.update((p) => ({ ...p, lineHeight: Math.min(2.2, Math.max(1.4, height)) }))
        },

        setMaxWidth: (width: number) => {
            store.update((p) => ({ ...p, maxWidth: Math.min(1200, Math.max(500, width)) }))
        },

        setReadingMode: (mode: ReadingPreferences['readingMode']) => {
            store.update((p) => ({ ...p, readingMode: mode }))
        },

        setTheme: (theme: ReadingPreferences['theme']) => {
            store.update((p) => ({ ...p, theme }))
        },

        setFontFamily: (family: ReadingPreferences['fontFamily']) => {
            store.update((p) => ({ ...p, fontFamily: family }))
        },

        toggleWordByWord: () => {
            store.update((p) => ({ ...p, wordByWordAnimation: !p.wordByWordAnimation }))
        }
    }
}

export const readingPreferences = createReadingPreferencesStore()

// Derived store for CSS variables
export const readingCssVars = derived(readingPreferences, ($prefs) => {
    const modeColors = themeModeColors[$prefs.readingMode]
    const fontFamily = fontFamilyMap[$prefs.fontFamily]

    return {
        '--reading-bg': modeColors.bg,
        '--reading-text': modeColors.text,
        '--reading-muted': modeColors.muted,
        '--reading-font-family': fontFamily,
        '--reading-font-size': `${$prefs.fontSize}px`,
        '--reading-line-height': $prefs.lineHeight.toString(),
        '--reading-max-width': `${$prefs.maxWidth || 680}px`
    }
})
