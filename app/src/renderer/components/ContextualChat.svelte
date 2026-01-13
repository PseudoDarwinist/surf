<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { get, type Writable } from 'svelte/store'
  import { Icon, PlaneLoader } from '@deta/icons'
  import { useAI, AIChat, useClaudeAgent, type ClaudeAgentService } from '@deta/services/ai'
  import { useLogScope, generateID, markdownToHtml } from '@deta/utils'
  import type { AIChatMessageParsed } from '@deta/types'

  const log = useLogScope('ContextualChat')

  // Convert markdown to HTML for rendering
  const renderMarkdown = async (text: string): Promise<string> => {
    try {
      let cleaned = text.replace(/<sources>[\s\S]*?<\/sources>/gi, '').trim()
      return await markdownToHtml(cleaned)
    } catch (e) {
      return text
    }
  }

  // Get AI services
  let ai: ReturnType<typeof useAI> | null = null
  let claudeAgent: ClaudeAgentService | null = null

  try {
    ai = useAI()
  } catch (e) {
    log.error('Failed to get AI service', e)
  }

  // Initialize Claude Agent SDK (uses local CLI authentication)
  try {
    claudeAgent = useClaudeAgent()
  } catch (e) {
    log.error('Failed to get Claude Agent service', e)
  }

  // Toggle between regular AI and Claude Agent SDK
  let useClaudeAgentSDK: boolean = $state(false)

  // Props
  let {
    selectedText,
    pageContext,
    pageTitle,
    pageUrl,
    visible
  }: {
    selectedText: Writable<string>
    pageContext: Writable<string>
    pageTitle: Writable<string>
    pageUrl: Writable<string>
    visible: Writable<boolean>
  } = $props()

  let chat: AIChat | null = null
  let messages: AIChatMessageParsed[] = $state([])
  let renderedMessages: Map<string, string> = $state(new Map())
  let isStreaming: boolean = $state(false)
  let inputValue: string = $state('')
  let inputElement: HTMLInputElement
  let chatContainer: HTMLDivElement

  const updateRenderedMessage = async (id: string, content: string) => {
    const html = await renderMarkdown(content)
    renderedMessages = new Map(renderedMessages.set(id, html))
  }

  onMount(() => {
    tick().then(() => inputElement?.focus())
  })

  // Create chat on mount
  $effect(() => {
    if (!chat && ai) {
      ai.createChat({
        title: 'Contextual Chat',
        automaticTitleGeneration: false
      })
        .then((newChat) => {
          chat = newChat
        })
        .catch((e) => {
          log.error('Failed to create chat', e)
        })
    }
  })

  // Current abort controller for Claude Agent
  let currentAbortController: AbortController | null = null

  const handleSubmit = async () => {
    // Check if we can proceed based on which service we're using
    if (!inputValue.trim() || isStreaming) return
    if (!useClaudeAgentSDK && (!chat || !ai)) return
    if (useClaudeAgentSDK && !claudeAgent) return

    const query = inputValue.trim()
    inputValue = ''
    isStreaming = true

    // Add user message
    const userMessage: AIChatMessageParsed = {
      id: generateID(),
      role: 'user',
      query,
      content: query,
      status: 'success',
      usedPageScreenshot: false,
      usedInlineScreenshot: false,
      citations: {}
    }
    messages = [...messages, userMessage]

    // Create AI response placeholder
    const aiMessageId = generateID()
    const aiMessage: AIChatMessageParsed = {
      id: aiMessageId,
      role: 'assistant',
      query: '',
      content: '',
      status: 'pending',
      usedPageScreenshot: false,
      usedInlineScreenshot: false,
      citations: {}
    }
    messages = [...messages, aiMessage]

    await tick()
    scrollToBottom()

    try {
      const pageContextVal = get(pageContext)
      const pageTitleVal = get(pageTitle)
      const pageUrlVal = get(pageUrl)
      const selectedTextVal = get(selectedText)

      const contextPrompt = pageContextVal
        ? `Context from the page:\nTitle: ${pageTitleVal}\nURL: ${pageUrlVal}\n\nPage content:\n${pageContextVal}\n\nSelected text: "${selectedTextVal}"\n\nUser question: ${query}\n\nAnswer the user's question about the selected text, using the page context to provide a comprehensive answer.`
        : `Selected text: "${selectedTextVal}"\n\nUser question: ${query}\n\nAnswer the user's question about the selected text.`

      let currentResponse = ''

      // Use Claude Agent SDK or regular AI based on toggle
      if (useClaudeAgentSDK && claudeAgent) {
        // Using Claude Agent SDK with local CLI authentication
        currentAbortController = new AbortController()

        for await (const chunk of claudeAgent.streamPrompt(contextPrompt, {
          abortController: currentAbortController,
          maxTurns: 5,
          includePartialMessages: true
        })) {
          if (chunk.type === 'text') {
            currentResponse += chunk.content
            const index = messages.findIndex((m) => m.id === aiMessageId)
            if (index !== -1) {
              messages[index] = {
                ...messages[index],
                content: currentResponse,
                status: 'pending'
              }
              messages = [...messages]
            }
            scrollToBottom()
          } else if (chunk.type === 'error') {
            throw new Error(chunk.content)
          }
        }

        currentAbortController = null
      } else if (chat) {
        // Using regular AI service
        await chat.sendMessage(
          (chunk: string) => {
            currentResponse += chunk
            const index = messages.findIndex((m) => m.id === aiMessageId)
            if (index !== -1) {
              messages[index] = {
                ...messages[index],
                content: currentResponse.replace('<answer>', '').replace('</answer>', ''),
                status: 'pending'
              }
              messages = [...messages]
            }
            scrollToBottom()
          },
          contextPrompt,
          { general: true, limit: 30 }
        )

        currentResponse = currentResponse.replace('<answer>', '').replace('</answer>', '')
      }

      // Mark complete
      const index = messages.findIndex((m) => m.id === aiMessageId)
      if (index !== -1) {
        messages[index] = {
          ...messages[index],
          content: currentResponse,
          status: 'success'
        }
        messages = [...messages]
        updateRenderedMessage(aiMessageId, currentResponse)
      }
    } catch (error: any) {
      log.error('Error sending message', error)
      const errorMessage = error?.message || 'Sorry, I encountered an error. Please try again.'
      const index = messages.findIndex((m) => m.id === aiMessageId)
      if (index !== -1) {
        messages[index] = {
          ...messages[index],
          content: useClaudeAgentSDK
            ? `Error: ${errorMessage}. Make sure you've run 'claude login' in your terminal.`
            : errorMessage,
          status: 'error'
        }
        messages = [...messages]
      }
    } finally {
      isStreaming = false
      currentAbortController = null
      await tick()
      inputElement?.focus()
      scrollToBottom()
    }
  }

  // Stop generation
  const handleStop = () => {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    if (chat) {
      chat.stopGeneration()
    }
    isStreaming = false
  }

  const scrollToBottom = () => {
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleClose = () => {
    visible.set(false)
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }
</script>

<div class="contextual-chat-window" on:click|stopPropagation>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="sparkle-icon">✦</div>
      <span class="title">Ask Surf</span>
      <!-- Claude Agent SDK Toggle -->
      <button
        class="provider-toggle"
        class:active={useClaudeAgentSDK}
        on:click={() => (useClaudeAgentSDK = !useClaudeAgentSDK)}
        title={useClaudeAgentSDK ? 'Using Claude Agent (Local CLI Auth)' : 'Using Surf AI'}
      >
        <Icon name="claude" size="14px" />
        <span class="toggle-label">{useClaudeAgentSDK ? 'Pro' : 'Surf'}</span>
      </button>
    </div>
    <button class="close-btn" on:click={handleClose} aria-label="Close">
      <Icon name="close" size="14px" />
    </button>
  </div>

  <!-- Chat Messages -->
  <div class="chat-container" bind:this={chatContainer}>
    {#each messages as message (message.id)}
      {#if message.role === 'user'}
        <div class="message user-message">
          <div class="user-bubble">{message.content}</div>
        </div>
      {:else}
        <div class="message ai-message">
          <div class="ai-content">
            {#if message.status === 'success' && renderedMessages.get(message.id)}
              <div class="markdown-content">
                {@html renderedMessages.get(message.id)}
              </div>
            {:else if message.content}
              <div class="streaming-content">
                {message.content}
                {#if message.status === 'pending' && isStreaming}
                  <span class="cursor"></span>
                {/if}
              </div>
            {:else if message.status === 'pending'}
              <div class="thinking">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            {/if}
          </div>
          {#if message.status === 'success'}
            <button class="copy-btn" on:click={() => handleCopy(message.content)}>
              <Icon name="copy" size="12px" />
            </button>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Input -->
  <div class="input-area">
    <input
      bind:this={inputElement}
      bind:value={inputValue}
      on:keydown={handleKeyDown}
      placeholder="Ask anything about the selection..."
      disabled={isStreaming}
      class="chat-input"
    />
    <button
      class="send-btn"
      on:click={handleSubmit}
      disabled={!inputValue.trim() || isStreaming}
      class:sending={isStreaming}
    >
      <div class="plane-wrapper">
        <PlaneLoader size={28} />
      </div>
    </button>
  </div>
</div>

<style lang="scss">
  .contextual-chat-window {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    /* Adjust opacity here: lower values = more transparent (0.0 to 1.0) */
    background: linear-gradient(180deg, rgba(28, 28, 35, 0.85) 0%, rgba(22, 22, 28, 0.9) 100%);
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2);
    /* Concentrated edge glow - tight and bright at borders */
    box-shadow:
      /* Inner highlight line */
      inset 0 0 0 1px rgba(255, 255, 255, 0.1),
      /* Primary edge glow - bright and tight */ 0 0 0 1px rgba(255, 255, 255, 0.15),
      0 0 8px 2px rgba(255, 255, 255, 0.4),
      0 0 16px 4px rgba(255, 255, 255, 0.25),
      0 0 24px 6px rgba(255, 255, 255, 0.15),
      /* Subtle outer fade */ 0 0 36px 8px rgba(255, 255, 255, 0.08),
      /* Depth shadow */ 0 20px 40px -10px rgba(0, 0, 0, 0.4);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .sparkle-icon {
      font-size: 18px;
      color: #60a5fa;
      text-shadow: 0 0 15px rgba(96, 165, 250, 0.8);
      animation: sparkle 2s ease-in-out infinite;
    }

    @keyframes sparkle {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.1);
      }
    }

    .title {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      letter-spacing: 0.3px;
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.15s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f1f5f9;
      }
    }

    .provider-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      cursor: pointer;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s ease;
      margin-left: 8px;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
      }

      &.active {
        background: linear-gradient(
          135deg,
          rgba(217, 119, 87, 0.2) 0%,
          rgba(217, 119, 87, 0.1) 100%
        );
        border-color: rgba(217, 119, 87, 0.4);
        color: #d97757;
        box-shadow: 0 0 12px rgba(217, 119, 87, 0.2);
      }

      .toggle-label {
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
  }

  .chat-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }
  }

  .message {
    display: flex;
    animation: fadeSlide 0.3s ease-out;

    &.user-message {
      justify-content: flex-end;
    }

    &.ai-message {
      justify-content: flex-start;
      position: relative;
      padding-right: 36px;
    }
  }

  @keyframes fadeSlide {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .user-bubble {
    max-width: 80%;
    padding: 12px 16px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border-radius: 16px 16px 4px 16px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  }

  .ai-content {
    max-width: 100%;
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.7;
  }

  .streaming-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cursor {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    background: #60a5fa;
    margin-left: 2px;
    animation: blink 0.8s infinite;
    vertical-align: text-bottom;
  }

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  .thinking {
    display: flex;
    gap: 5px;
    padding: 8px 0;

    .dot {
      width: 8px;
      height: 8px;
      background: #60a5fa;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;

      &:nth-child(1) {
        animation-delay: -0.32s;
      }
      &:nth-child(2) {
        animation-delay: -0.16s;
      }
    }
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0.6);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .markdown-content {
    :global(p) {
      margin: 0.6em 0;
      &:first-child {
        margin-top: 0;
      }
      &:last-child {
        margin-bottom: 0;
      }
    }

    :global(strong) {
      color: #f8fafc;
      font-weight: 600;
    }

    :global(code) {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.2em 0.5em;
      border-radius: 5px;
      font-size: 0.9em;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    :global(pre) {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 14px;
      border-radius: 12px;
      margin: 1em 0;
      overflow-x: auto;

      :global(code) {
        background: none;
        padding: 0;
      }
    }

    :global(ul),
    :global(ol) {
      margin: 0.6em 0;
      padding-left: 1.5em;
    }

    :global(li) {
      margin: 0.3em 0;
    }

    :global(h1),
    :global(h2),
    :global(h3),
    :global(h4) {
      color: #f8fafc;
      margin: 1em 0 0.5em;
      font-weight: 600;
      &:first-child {
        margin-top: 0;
      }
    }

    :global(h1) {
      font-size: 1.3em;
    }
    :global(h2) {
      font-size: 1.2em;
    }
    :global(h3) {
      font-size: 1.1em;
    }
  }

  .copy-btn {
    position: absolute;
    top: 0;
    right: 0;
    opacity: 0;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    color: #64748b;
    transition: all 0.15s ease;

    .ai-message:hover & {
      opacity: 1;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #94a3b8;
    }
  }

  .input-area {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.2);
  }

  .chat-input {
    flex: 1;
    padding: 14px 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: all 0.2s ease;

    &::placeholder {
      color: #64748b;
    }

    &:focus {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(96, 165, 250, 0.5);
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: transparent;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    padding: 0;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;

    .plane-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    &:hover:not(:disabled) {
      transform: scale(1.08);

      .plane-wrapper {
        transform: translateX(2px) translateY(-1px);
      }
    }

    &:active:not(:disabled) {
      transform: scale(0.95);
    }

    &.sending {
      .plane-wrapper {
        animation: flyPulse 1.5s ease-in-out infinite;
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(0.3);
    }
  }

  @keyframes flyPulse {
    0%,
    100% {
      transform: translateX(0) translateY(0);
    }
    25% {
      transform: translateX(2px) translateY(-2px);
    }
    50% {
      transform: translateX(0) translateY(1px);
    }
    75% {
      transform: translateX(-1px) translateY(-1px);
    }
  }
</style>
