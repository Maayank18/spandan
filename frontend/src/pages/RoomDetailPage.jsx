import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import QuestionApprovalPopup from '../components/QuestionApprovalPopup'
import CreateQuestionOverlay from '../components/CreateQuestionOverlay'

function RoomDetailPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { getRoom, updateRoom, setAuthToken } = useRoomStore()
  
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRoomJoined, setIsRoomJoined] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(null)
  const transcriptRef = useRef(null)

  // Real-time transcription state
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [modelStatus, setModelStatus] = useState('Ready')
  
  // Web Speech API refs
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  // Segment tracking
  const [currentSegment, setCurrentSegment] = useState(0)
  const [segmentTranscript, setSegmentTranscript] = useState('')
  const [segmentTimeLeft, setSegmentTimeLeft] = useState(0)
  const segmentTimerRef = useRef(null)

  // Question generation
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [showQuestionPopup, setShowQuestionPopup] = useState(false)
  const [showCreateQuestion, setShowCreateQuestion] = useState(false)
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [ollamaModels, setOllamaModels] = useState([])
  const [roomSettings, setRoomSettings] = useState({
    segmentTime: 2,
    questionsPerSegment: 2,
    difficulty: 'medium',
    ollamaModel: 'tinyllama:latest',
    timeToAnswer: 30,
    points: 100
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      loadRoom()
      initSpeechRecognition()
      checkOllamaStatus()
    }
    
    return () => {
      if (room?.code) {
        leaveRoom(room.code)
      }
      stopRecording()
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
      }
    }
  }, [roomId])

  useEffect(() => {
    if (room?.code && user?._id) {
      joinRoom(room.code, user._id)
    }
  }, [room?.code, user?._id])

  // Listen for room:joined event
  useEffect(() => {
    if (!socket) return
    
    const handleRoomJoined = () => {
      console.log('Teacher joined room successfully')
      setIsRoomJoined(true)
    }
    
    socket.on('room:joined', handleRoomJoined)
    
    return () => {
      socket.off('room:joined', handleRoomJoined)
    }
  }, [socket])

  // Auto-scroll transcription
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // Start segment timer when recording
  useEffect(() => {
    if (isRecording && roomSettings.segmentTime > 0) {
      startSegmentTimer()
    } else {
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
      }
    }
  }, [isRecording, roomSettings.segmentTime])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const checkOllamaStatus = async () => {
    try {
      const response = await fetch('/api/questions/ollama-status')
      const data = await response.json()
      if (data.available) {
        setOllamaModels(data.models)
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error)
    }
  }

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      setModelStatus('Not supported')
      return
    }

    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = 'en-US'

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started')
      setIsTranscribing(true)
    }

    recognitionRef.current.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPiece + ' '
        } else {
          interimTranscript += transcriptPiece
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript + ' '
        const newText = finalTranscriptRef.current + interimTranscript
        setTranscript(newText)
        setSegmentTranscript(prev => prev + ' ' + finalTranscript)
      } else {
        setTranscript(finalTranscriptRef.current + interimTranscript)
      }
    }

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      if (event.error === 'not-allowed') {
        setModelStatus('Microphone access denied')
      }
    }

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended')
      if (isRecording) {
        try {
          recognitionRef.current?.start()
        } catch (e) {
          setIsRecording(false)
          setIsTranscribing(false)
        }
      }
    }
  }

  const startSegmentTimer = () => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
    }

    const totalSeconds = roomSettings.segmentTime * 60
    let secondsLeft = totalSeconds

    setSegmentTimeLeft(secondsLeft)

    segmentTimerRef.current = setInterval(() => {
      secondsLeft--
      setSegmentTimeLeft(secondsLeft)

      if (secondsLeft <= 0) {
        generateQuestionsForSegment()
      }
    }, 1000)
  }

  const generateQuestionsForSegment = async () => {
    const textToUse = segmentTranscript.trim() || transcript
    if (!textToUse) {
      console.log('No transcript text to generate questions from')
      return
    }

    setCurrentSegment(prev => prev + 1)
    setSegmentTranscript('')

    await generateQuestionsFromText(textToUse)
  }

  const generateQuestionsFromText = async (text) => {
    setIsGeneratingQuestions(true)
    try {
      const response = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transcript: text,
          config: {
            numQuestions: roomSettings.questionsPerSegment,
            difficulty: roomSettings.difficulty,
            ollamaModel: roomSettings.ollamaModel || 'llama3.2'
          }
        })
      })

      const data = await response.json()

      if (data.success && data.questions && data.questions.length > 0) {
        const markedQuestions = data.questions.map(q => ({
          ...q,
          segmentIndex: currentSegment
        }))
        setPendingQuestions(markedQuestions)
        setShowQuestionPopup(true)
      } else {
        console.error('No questions generated:', data.error)
        alert('Failed to generate questions: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to generate questions:', error)
      alert('Failed to generate questions. Please check if Ollama is running.')
    }
    setIsGeneratingQuestions(false)
  }

  const loadRoom = async () => {
    setIsLoading(true)
    try {
      const roomData = await getRoom(roomId)
      setRoom(roomData)
      // Load questions for this room from database
      loadQuestions(roomId)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadQuestions = async (rid) => {
    try {
      const response = await fetch(`/api/questions?roomId=${rid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.questions) {
          setGeneratedQuestions(data.questions)
        }
      }
    } catch (err) {
      console.error('Failed to load questions:', err)
    }
  }

  const handleEndRoom = async () => {
    if (room.endedAt) return
    
    try {
      const updated = await updateRoom(room._id, { 
        isActive: false,
        endedAt: new Date()
      })
      setRoom(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.')
      return
    }

    try {
      finalTranscriptRef.current = transcript
      setCurrentSegment(1)
      setSegmentTranscript('')
      recognitionRef.current.start()
      setIsRecording(true)
      setModelStatus('Listening...')
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      setIsRecording(true)
      setIsTranscribing(true)
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {}
    }
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
    }
    setIsRecording(false)
    setIsTranscribing(false)
    setModelStatus('Ready')
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const clearTranscript = () => {
    setTranscript('')
    finalTranscriptRef.current = ''
    setSegmentTranscript('')
  }

  const handleManualGenerateQuestions = async () => {
    const textToUse = segmentTranscript.trim() || transcript
    if (!textToUse) {
      alert('No transcript available to generate questions from.')
      return
    }
    await generateQuestionsFromText(textToUse)
  }

  const handleApproveQuestion = async (question) => {
    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
      }
    } catch (error) {
      console.error('Failed to save question:', error)
    }
  }

  const handleRejectQuestion = (question) => {
    console.log('Question rejected:', question.question)
  }

  const handleCreateQuestion = async (questionData) => {
    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: questionData.type,
          question: questionData.question,
          options: questionData.options,
          timeToAnswer: questionData.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: questionData.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        
        // Emit to socket for students to receive (include roomCode)
        console.log('Emitting new_question event:', { roomCode: room.code, question: data.question })
        console.log('Socket connected:', !!socket, 'isConnected:', isConnected, 'isRoomJoined:', isRoomJoined)
        if (socket && isConnected && isRoomJoined) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
          console.log('new_question event emitted successfully')
        } else {
          console.error('Socket not available, not connected, or room not joined:', { socket: !!socket, isConnected, isRoomJoined })
          // Retry after a short delay if room not yet joined
          setTimeout(() => {
            if (socket && isConnected) {
              socket.emit('new_question', {
                roomCode: room.code,
                question: data.question
              })
              console.log('new_question event emitted after retry')
            }
          }, 1000)
        }
      } else {
        const errorData = await response.json()
        console.error('Failed to save question:', errorData)
        alert('Failed to save question: ' + (errorData.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to create question:', error)
      alert('Failed to create question')
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading room...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Room not found'}</h2>
            <button onClick={() => navigate('/teacher')} style={{
              marginTop: '16px',
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isEnded = !!room.endedAt

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', minWidth: '1200px' }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0 }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '16px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>{room.name}</h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 32px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Room Code Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <button onClick={() => navigate('/teacher')} style={{
              padding: '8px 12px',
              background: 'var(--nav-hover)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px'
            }}>
              ←
            </button>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 20px',
              border: '2px solid var(--border-color)',
              borderRadius: '10px'
            }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: '#1e40af', letterSpacing: '4px' }}>
                {room.code}
              </span>
              <button onClick={copyRoomCode} disabled={isEnded} style={{
                padding: '4px 12px',
                background: isEnded ? '#9ca3af' : (copied ? '#10b981' : '#3b82f6'),
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: isEnded ? 'not-allowed' : 'pointer'
              }}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div style={{ flex: 1 }} />

            {/* Segment Timer Display */}
            {isRecording && (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                  Segment {currentSegment}
                </span>
                <span style={{ fontSize: '20px', color: '#ef4444', fontWeight: '700' }}>
                  {formatTime(segmentTimeLeft)}
                </span>
              </div>
            )}

            {/* Create Question Button */}
            {!isEnded && (
              <button 
                onClick={() => setShowCreateQuestion(true)} 
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ✍️ Create Q
              </button>
            )}

            {/* Settings Dropdown */}
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                style={{
                  padding: '8px 16px',
                  background: showSettings ? '#3b82f6' : 'var(--nav-hover)',
                  color: showSettings ? 'white' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ⚙️ Settings
              </button>

              {showSettings && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'var(--bg-card)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                  border: '1px solid var(--border-color)',
                  minWidth: '220px',
                  zIndex: 100,
                  padding: '16px'
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    ⚙️ Room Settings
                  </h4>
                  
                  {/* Segment Time Setting */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Segment Time (t)
                    </label>
                    <select
                      value={roomSettings.segmentTime}
                      onChange={(e) => setRoomSettings(prev => ({ ...prev, segmentTime: parseInt(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    >
                      {[1, 2, 3, 5, 10, 15, 20, 30].map(t => (
                        <option key={t} value={t}>{t} min</option>
                      ))}
                    </select>
                  </div>

                  {/* Questions per Segment */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Questions / Segment
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, questionsPerSegment: Math.max(1, prev.questionsPerSegment - 1) }))}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '24px', textAlign: 'center' }}>
                        {roomSettings.questionsPerSegment}
                      </span>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, questionsPerSegment: Math.min(10, prev.questionsPerSegment + 1) }))}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Difficulty */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Difficulty
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['easy', 'medium', 'hard'].map(level => (
                        <button
                          key={level}
                          onClick={() => setRoomSettings(prev => ({ ...prev, difficulty: level }))}
                          style={{
                            flex: 1,
                            padding: '4px',
                            borderRadius: '4px',
                            border: roomSettings.difficulty === level ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                            background: roomSettings.difficulty === level ? '#dbeafe' : 'transparent',
                            color: roomSettings.difficulty === level ? '#1e40af' : 'var(--text-primary)',
                            fontSize: '10px',
                            fontWeight: roomSettings.difficulty === level ? '600' : '400',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ollama Model */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Ollama Model
                    </label>
                    <select
                      value={roomSettings.ollamaModel}
                      onChange={(e) => setRoomSettings(prev => ({ ...prev, ollamaModel: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '12px'
                      }}
                    >
                      <option value="tinyllama:latest">tinyllama (Lightweight)</option>
                      <option value="llama3.2">llama3.2 (2GB RAM needed)</option>
                      <option value="qwen2.5:7b">qwen2.5:7b (4GB RAM needed)</option>
                      <option value="mistral">mistral (4GB RAM needed)</option>
                    </select>
                    <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      Server has 4GB RAM total
                    </p>
                  </div>

                  {/* Time to Answer (TTA) */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Time to Answer (TTA)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, timeToAnswer: Math.max(5, (prev.timeToAnswer || 30) - 5) }))}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
                        {roomSettings.timeToAnswer || 30}s
                      </span>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, timeToAnswer: Math.min(300, (prev.timeToAnswer || 30) + 5) }))}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Points */}
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Points
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, points: Math.max(1, (prev.points || 10) - 5) }))}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
                        {roomSettings.points || 10}
                      </span>
                      <button
                        onClick={() => setRoomSettings(prev => ({ ...prev, points: Math.min(100, (prev.points || 10) + 5) }))}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* End Room Button */}
            {!isEnded && (
              <button onClick={handleEndRoom} style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
                End Room
              </button>
            )}
          </div>

          {/* Microphone and Transcription Row - 30/70 Split */}
          <div style={{ display: 'flex', gap: '20px', height: '280px', marginBottom: '20px' }}>
            {/* Microphone Card - 30% */}
            <div style={{
              width: '30%',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              {/* Mic Button */}
              <button
                onClick={toggleRecording}
                disabled={isEnded}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: isEnded 
                    ? 'linear-gradient(135deg, #6b7280, #9ca3af)' 
                    : (isRecording 
                        ? 'linear-gradient(135deg, #dc2626, #ef4444)' 
                        : 'linear-gradient(135deg, #10b981, #059669)'),
                  color: 'white',
                  border: 'none',
                  cursor: isEnded ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: isRecording 
                    ? '0 0 30px rgba(239, 68, 68, 0.5)' 
                    : '0 8px 25px rgba(16, 185, 129, 0.4)',
                  transform: isRecording ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.3s ease'
                }}
              >
                {isRecording ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                )}
              </button>

              {/* Status Text */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: isRecording ? '#ef4444' : 'var(--text-primary)' }}>
                  {isTranscribing ? 'Listening...' : (isRecording ? 'Recording...' : 'Start Recording')}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {modelStatus}
                </p>
              </div>

              {/* Live indicator */}
              {isRecording && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '20px'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>LIVE</span>
                </div>
              )}

              {/* Settings Labels Below Mic */}
              <div style={{
                width: '100%',
                background: 'var(--bg-primary)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '11px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Segment Time:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.segmentTime} min</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Questions/Segment:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.questionsPerSegment}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Difficulty:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>{roomSettings.difficulty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Model:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.ollamaModel}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcription Card - 70% */}
            <div style={{
              flex: 1,
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🎙️</span>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Real-time Transcription
                  </span>
                  {isTranscribing && (
                    <div style={{ padding: '2px 8px', background: '#fef2f2', borderRadius: '10px', fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
                      LIVE
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {transcript && (
                    <button onClick={clearTranscript} style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}>
                      ✕ Clear
                    </button>
                  )}
                  <button
                    onClick={handleManualGenerateQuestions}
                    disabled={isGeneratingQuestions || !transcript}
                    style={{
                      padding: '4px 12px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isGeneratingQuestions || !transcript ? 'not-allowed' : 'pointer',
                      opacity: isGeneratingQuestions || !transcript ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isGeneratingQuestions ? '⏳ Generating...' : '🔄 Generate Q'}
                  </button>
                </div>
              </div>

              <div ref={transcriptRef} style={{
                flex: 1,
                fontSize: '15px',
                lineHeight: '1.8',
                color: transcript ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowY: 'auto'
              }}>
                {transcript ? transcript : (
                  <span style={{ fontStyle: 'italic' }}>
                    Click the microphone to start real-time transcription.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Third Row - Generated Questions */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>📝</span>
              <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Session Questions
              </span>
              {generatedQuestions.length > 0 && (
                <span style={{
                  padding: '2px 10px',
                  background: '#d1fae5',
                  color: '#059669',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {generatedQuestions.length}
                </span>
              )}
            </div>

            {generatedQuestions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {generatedQuestions.map((q, index) => (
                  <div key={q._id || index} style={{
                    padding: '14px 16px',
                    background: 'var(--bg-primary)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <span style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      flexShrink: 0
                    }}>
                      {index + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: q.type === 'MCQ' ? '#3b82f620' : q.type === 'TF' ? '#10b9820' : '#8b5cf620',
                          color: q.type === 'MCQ' ? '#3b82f6' : q.type === 'TF' ? '#10b982' : '#8b5cf6'
                        }}>
                          {q.type}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          Segment {q.segmentIndex || 0}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                        {q.question}
                      </p>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {q.options?.filter(o => o.isCorrect).map((opt, i) => (
                          <span key={i} style={{
                            padding: '2px 8px',
                            background: '#d1fae5',
                            color: '#059669',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}>
                            ✓ {opt.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '32px',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                No questions generated yet. Start recording to auto-generate questions.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Question Approval Popup */}
      {showQuestionPopup && pendingQuestions.length > 0 && (
        <QuestionApprovalPopup
          questions={pendingQuestions}
          onApprove={handleApproveQuestion}
          onReject={handleRejectQuestion}
          onClose={() => setShowQuestionPopup(false)}
        />
      )}

      {/* Create Question Overlay */}
      {showCreateQuestion && (
        <CreateQuestionOverlay
          isOpen={showCreateQuestion}
          onClose={() => setShowCreateQuestion(false)}
          onLaunch={handleCreateQuestion}
        />
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default RoomDetailPage