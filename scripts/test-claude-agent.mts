#!/usr/bin/env npx ts-node

/**
 * Claude Agent SDK Test Script
 * 
 * Tests the Claude Agent SDK integration in isolation to identify issues.
 * 
 * Run with: npx ts-node --esm scripts/test-claude-agent.mts
 * Or: node --loader ts-node/esm scripts/test-claude-agent.mts
 */

async function testClaudeAgentSDK() {
  console.log('=== Claude Agent SDK Test ===\n')
  
  // Step 1: Check SDK import
  console.log('1. Testing SDK import...')
  let sdk: any
  try {
    sdk = await import('@anthropic-ai/claude-agent-sdk')
    console.log('   ✓ SDK imported successfully')
    console.log('   Exports:', Object.keys(sdk))
  } catch (error: any) {
    console.error('   ✗ Failed to import SDK:', error.message)
    return
  }

  // Step 2: Check query function exists
  console.log('\n2. Checking query function...')
  if (typeof sdk.query !== 'function') {
    console.error('   ✗ query is not a function:', typeof sdk.query)
    return
  }
  console.log('   ✓ query function exists')

  // Step 3: Test a simple query
  console.log('\n3. Testing simple query...')
  console.log('   Prompt: "What is 2+2? Answer with just the number."')
  
  try {
    const generator = sdk.query({
      prompt: 'What is 2+2? Answer with just the number.',
      options: {
        cwd: process.cwd(),
        maxTurns: 1,
        maxBudgetUsd: 0.01,
        permissionMode: 'dontAsk',
        allowedTools: [] // No tools needed for simple math
      }
    })

    let fullContent = ''
    let messageCount = 0

    console.log('\n   Messages received:')
    for await (const message of generator) {
      messageCount++
      console.log(`   [${messageCount}] type: ${message.type}`)
      
      // Log detailed message info for debugging
      if (message.type === 'system') {
        console.log(`       subtype: ${message.subtype}`)
        console.log(`       apiKeySource: ${message.apiKeySource}`)
        console.log(`       model: ${message.model}`)
      }
      
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            fullContent += block.text
            console.log(`       text: "${block.text.substring(0, 100)}..."`)
          } else {
            console.log(`       block type: ${block.type}`)
          }
        }
      }
      
      if (message.type === 'result') {
        console.log(`       subtype: ${message.subtype}`)
        console.log(`       is_error: ${message.is_error}`)
        console.log(`       result: ${message.result?.substring(0, 100) || '(none)'}`)
        console.log(`       total_cost_usd: ${message.total_cost_usd}`)
        if (message.is_error && message.errors) {
          console.log(`       errors: ${message.errors.join(', ')}`)
        }
      }
    }

    console.log('\n   ✓ Query completed')
    console.log(`   Full response: "${fullContent}"`)
    
  } catch (error: any) {
    console.error('\n   ✗ Query failed:', error.message)
    console.error('   Error details:', error)
    
    // Check for CLI auth
    if (error.message?.includes('auth') || error.message?.includes('API key')) {
      console.log('\n   HINT: Run "claude login" to authenticate with your Claude account')
    }
  }
}

// Run the test
testClaudeAgentSDK().catch(console.error)
