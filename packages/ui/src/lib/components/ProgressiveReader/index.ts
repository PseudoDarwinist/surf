// Progressive Reader Components
export { default as ProgressiveReader } from './ProgressiveReader.svelte'
export { default as ProgressiveReaderToolbar } from './ProgressiveReaderToolbar.svelte'
export { default as ReadingPreferences } from './ReadingPreferences.svelte'
export { default as FocusToolbar } from './FocusToolbar.svelte'

// Selection & Q&A Components
export { default as SelectionToolbar } from './SelectionToolbar.svelte'
export { default as InlineQuestionCard } from './InlineQuestionCard.svelte'
export { default as InlineAnswerCard } from './InlineAnswerCard.svelte'

// Store and types
export {
    readingPreferences,
    readingPreferencesOpen,
    readingCssVars,
    defaultPreferences,
    fontFamilyMap,
    themeModeColors,
    type ReadingPreferences as ReadingPreferencesType
} from './readingPreferences.store'

// Types for inline Q&A
export type QuestionType = 'tldr' | 'visual' | 'explain' | 'realworld' | 'bigpicture'
export interface InlineCard {
    id: string
    chunkIndex: number
    type: 'question' | 'answer'
    selectedText: string
    questionType: QuestionType
    content: string
    isStreaming?: boolean
    imageUrl?: string
}

// Legacy interface
export interface ProgressiveReadingState {
    enabled: boolean
    revealedChunkCount: number
    totalChunks: number
    revealedContent: string
}
