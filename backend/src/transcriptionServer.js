import express from 'express'
import { pipeline } from '@xenova/transformers'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

let transcriber = null
const rooms = new Map()

// Initialize Whisper model
async function initWhisper() {
  try {
    console.log('🔄 Loading Whisper model on server...')
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')
    console.log('✅ Whisper model loaded successfully!')
  } catch (error) {
    console.error('❌ Failed to load Whisper model:', error)
  }
}

// REST API for status
app.get('/api/transcription/status', (req, res) => {
  res.json({ 
    status: transcriber ? 'ready' : 'loading',
    model: 'whisper-base'
  })
})

// WebSocket handling
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id)

  // Join room for transcription
  socket.on('join_transcription', (data) => {
    const { roomId, userId } = data
    socket.join(`transcription:${roomId}`)
    console.log(`👤 User ${userId} joined transcription room ${roomId}`)
  })

  // Leave room
  socket.on('leave_transcription', (data) => {
    const { roomId } = data
    socket.leave(`transcription:${roomId}`)
  })

  // Audio data received from client
  socket.on('audio_data', async (data) => {
    if (!transcriber) {
      socket.emit('transcription_error', { error: 'Model not loaded' })
      return
    }

    try {
      const { roomId, audioData, sequenceNumber } = data
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64')
      
      // Transcribe using Whisper
      const result = await transcriber(audioBuffer, {
        task: 'transcribe',
        language: 'en',
        chunk_length_s: 30,
        stride_length_s: 5,
      })

      // Send transcription back to client
      socket.emit('transcription_result', {
        roomId,
        text: result.text || '',
        sequence: sequenceNumber
      })

      // Broadcast to others in the room
      socket.to(`transcription:${roomId}`).emit('transcription_broadcast', {
        text: result.text || '',
        sequence: sequenceNumber
      })

    } catch (error) {
      console.error('Transcription error:', error)
      socket.emit('transcription_error', { error: error.message })
    }
  })

  // Simple audio chunk for real-time transcription
  socket.on('audio_chunk', async (data) => {
    if (!transcriber) {
      socket.emit('transcription_error', { error: 'Model not loaded' })
      return
    }

    try {
      const { audio, roomId, chunkId } = data
      
      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audio, 'base64')
      
      // Quick transcription for real-time
      const result = await transcriber(audioBuffer, {
        task: 'transcribe',
        language: 'en',
        chunk_length_s: 5,
        stride_length_s: 1,
      })

      if (result.text && result.text.trim()) {
        socket.emit('transcription_partial', {
          roomId,
          text: result.text.trim(),
          chunkId
        })
      }
    } catch (error) {
      // Silently ignore errors for real-time chunks
    }
  })

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id)
  })
})

// Start server
const PORT = process.env.TRANSCRIPTION_PORT || 3002

initWhisper().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🎤 Transcription service running on port ${PORT}`)
    console.log(`   WebSocket endpoint: ws://localhost:${PORT}`)
    console.log(`   REST API: http://localhost:${PORT}/api/transcription/status`)
  })
})

export default app