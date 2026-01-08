# Circle to Summarize - Development Progress

> **Session Handoff Document** - Contains everything needed to continue development in a new chat session.

## 🎯 Feature Overview

**Goal**: Build a "Circle to Summarize" feature for the Surf browser that allows users to:

1. Press `Cmd+D` to activate a pen/lasso tool
2. Draw a circle around any content on a webpage
3. Get an intelligent AI-generated explanation/summary of the circled content

**Current Status**: ✅ **Core functionality working**, but response quality needs improvement.

---

## 📁 Key Files Modified

| File                                                          | Purpose                               |
| ------------------------------------------------------------- | ------------------------------------- |
| `app/src/renderer/components/CircleToSummarizeManager.svelte` | Main orchestrator component           |
| `app/src/renderer/components/DrawingToolbar.svelte`           | Floating toolbar with pen activation  |
| `app/src/renderer/components/LassoCanvas.svelte`              | Canvas for drawing circles            |
| `app/src/renderer/components/SummaryPopup.svelte`             | Popup displaying AI summary           |
| `app/src/renderer/utils/lassoUtils.ts`                        | Utilities for lasso geometry          |
| `app/src/renderer/utils/contentExtractor.ts`                  | DOM text extraction (deprecated)      |
| `app/src/main/claudeAgent.ts`                                 | Claude Agent SDK IPC handlers         |
| `app/src/main/mainWindow.ts`                                  | Added `getViewManager()` export       |
| `app/src/preload/core.ts`                                     | Exposed `summarizeWithScreenshot` API |
| `packages/services/src/lib/views/overlayManager.ts`           | Added `persistent` flag for overlays  |
| `app/src/renderer/Core/components/Overlays/Overlay.svelte`    | Persistent overlay prop               |

---

## ✅ What's Working

1. **Toolbar Visibility**: Two-overlay architecture with `persistent` flag
2. **Lasso Drawing**: Users can draw circles on the page
3. **Screenshot Capture**: Full-page screenshot from active WebContentsView
4. **Claude SDK Vision**: Streaming Input Mode with base64 image → working
5. **Popup Display**: Shows AI response after analysis

---

## 🔧 Architecture Decisions

### 1. Two-Overlay Architecture

**Problem**: Single overlay for both toolbar and lasso caused the toolbar to vanish on navigation.

**Solution**:

- **Toolbar Overlay**: Small, always-visible, positioned at bottom center, `persistent={true}`
- **Lasso/Popup Overlay**: Full-screen, appears only when pen tool is active

### 2. Persistent Overlay Flag

Added `persistent?: boolean` to overlay system:

- **Non-persistent** (default): Destroyed on click-outside
- **Persistent**: Survives click-outside, not pooled

**Files changed**:

- `overlayManager.ts`: Added `persistent` property and skip click-outside listener
- `Overlay.svelte`: Added `persistent` prop
- `types.ts`: Added `persistent` to `OverlayProps`

### 3. Screenshot-Based Content Extraction

**Problem**: `extractDOMText()` was querying the **overlay's document**, not the webview's document. Overlays and WebContentsViews are separate native windows - they can't share DOM.

**Result**: AI was summarizing overlay elements (breadcrumbs, UI) instead of webpage content.

**Solution**: Screenshot + Vision approach:

1. Get active tab's view ID from `tabsService`
2. Send bounds + viewId to main process via IPC
3. Main process captures screenshot from WebContentsView
4. Send screenshot (base64) to Claude SDK with Streaming Input Mode
5. Return AI analysis to renderer

### 4. Claude Agent SDK vs External APIs

**Decision**: Use Claude Agent SDK exclusively (no Gemini/OpenAI)

- **Reason**: User wants to avoid API costs; Claude Pro subscription provides authentication via CLI
- **Implementation**: Streaming Input Mode with image content blocks

```typescript
yield {
  type: 'user',
  message: {
    role: 'user',
    content: [
      { type: 'text', text: 'prompt...' },
      { type: 'image', source: { type: 'base64', media_type, data } }
    ]
  }
}
```

---

## 🐛 Gotchas & Learnings

### 1. Package Changes Require Full Restart

Changes to files in `packages/` folder don't hot-reload properly. Must fully restart `npx electron-vite dev`.

### 2. View ID Mismatch

The view ID from `activeTab.view.id` may not match the IDs in `viewManager.views`. Added fallback to use `viewManager.activeViewId`.

### 3. Region Screenshot Returns Null

Capturing a specific region with `capturePage(rect)` can return null. **Solution**: Capture full page without region bounds - more reliable.

### 4. Coordinate System Mismatch

Lasso bounds are relative to overlay window, not the WebContentsView. This makes region-based cropping unreliable.

### 5. Overlay Pooling Conflict

The overlay manager pools overlays for reuse. Persistent overlays shouldn't be pooled since they have different lifecycle. Created fresh for each persistent overlay.

### 6. Click-Outside Listener

The overlay's `handleClickOutside` method destroys the overlay on any click. For persistent overlays, this listener must be skipped.

---

## 🚧 Current Issue

**Problem**: AI response is too literal - just describes what it sees instead of explaining intelligently.

**Current output**:

> "This screenshot displays a presentation slide or documentation page titled 'How to build production AI agents...'"

**Desired output**:

- For **diagrams**: Explain what the diagram represents, the flow, the relationships
- For **words/terms**: Define and explain with examples
- For **paragraphs**: Summarize key points and explain in simple language
- For **code**: Explain what it does, the pattern used

**Fix needed**: Improve the prompt sent to Claude to be context-aware and educational.

---

## 📋 Remaining Work

1. **Intelligent Prompting**: Craft better prompts that produce educational explanations
2. **Content Type Detection**: Detect if circled content is diagram/text/code and adjust prompt
3. **"Go Deeper" Feature**: Already has button, needs to provide more detailed explanation
4. **Region Cropping**: Optionally crop screenshot to circled region before sending
5. **Error Handling**: Better UX for various failure modes
6. **Performance**: Optimize screenshot capture and API latency

---

## 🔌 IPC API Reference

### `claude-agent:summarize-with-screenshot`

```typescript
// Renderer → Main
window.api.claudeAgent.summarizeWithScreenshot(
  bounds: { x: number; y: number; width: number; height: number },
  activeViewId: string
) => Promise<{ content: string; screenshotUrl?: string; error?: string }>
```

### `claude-agent:summarize`

```typescript
// For text-based summarization (deprecated for circle feature)
window.api.claudeAgent.summarize(text: string) => Promise<{ content: string; error?: string }>
```

### `claude-agent:explain-deep`

```typescript
// For deeper explanations (used by "Go Deeper" button)
window.api.claudeAgent.explainDeep(text: string, context?: string) => Promise<{ content: string; error?: string }>
```

---

## 🧪 Testing Steps

1. Run `npx electron-vite dev` from `app/` folder
2. Navigate to a webpage with content
3. Press `Cmd+D` to activate pen tool (toolbar should have glowing indicator)
4. Draw a circle around content
5. Popup should appear with AI analysis
6. Check console for `[ClaudeAgent]` debug logs

---

## 📊 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core.svelte                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              CircleToSummarizeManager.svelte                ││
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ ││
│  │  │  Overlay 1       │  │  Overlay 2 (when pen active)     │ ││
│  │  │  (persistent)    │  │  ┌──────────────┐ ┌────────────┐ │ ││
│  │  │  DrawingToolbar  │  │  │ LassoCanvas  │ │SummaryPopup│ │ ││
│  │  └──────────────────┘  │  └──────────────┘ └────────────┘ │ ││
│  │                        └──────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC: summarizeWithScreenshot
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Main Process                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │    claudeAgent.ts   │  │      viewManager.ts              │  │
│  │  - Screenshot IPC   │──│  - capturePage()                 │  │
│  │  - Claude SDK call  │  │  - getViewManager()              │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Code Snippets

### Streaming Input Mode for Vision

```typescript
async function* generateMessages() {
  yield {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: 'Analyze this screenshot...' },
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png',
            data: base64Data
          }
        }
      ]
    }
  }
}

const generator = query({
  prompt: generateMessages(),
  options: { maxTurns: 1, permissionMode: 'dontAsk', allowedTools: [] }
})
```

### Persistent Overlay Usage

```svelte
<Overlay bounds={toolbarBounds} autofocus={false} persistent={true}>
  <DrawingToolbar ... />
</Overlay>
```

---

## 📅 Session History

| Session | Focus                                             | Outcome                                       |
| ------- | ------------------------------------------------- | --------------------------------------------- |
| 1       | Initial implementation, toolbar visibility issues | Two-overlay architecture                      |
| 2       | Content extraction fix                            | Discovered DOM isolation issue                |
| 3       | Screenshot + OCR implementation                   | Full page capture + Claude SDK vision working |

---

_Last updated: 2025-12-14_
