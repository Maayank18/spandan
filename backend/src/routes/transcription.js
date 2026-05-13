import express from 'express'
import { pipeline } from '@xenova/transformers'
import { createServer } from 'http'
import { Server } from 'socket.io'

const router = express.Router()

let transcriber = null
let isInitialized = false

// Initialize Whisper model
async function initWhisper() {
  if (isInitialized) return transcriber
  
  try {
    console.log('Loading Whisper model on server...')
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')
    isInitialized = true
    console.log('Whisper model loaded successfully on server!')
    return transcriber
  } catch (error) {
    console.error('Failed to load Whisper model:', error)
    throw error
  }
}

// Health check
router.get('/status', async (req, res) => {
  res.json({ 
    status: isInitialized ? 'ready' : 'loading',
    model: 'whisper-base'
  })
})

// Initialize on module load
initWhisper().catch(console.error)

export default router