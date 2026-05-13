import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function StudentRoomPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOption, setSelectedOption] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  const [passedQuestions, setPassedQuestions] = useState(() => {
    // Load from sessionStorage on init to survive page refresh
    try {
      const saved = sessionStorage.getItem(`passedQuestions_${roomCode}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      joinSession()
    }
    return () => {
      if (room?.code) {
        leaveRoom(room.code)
      }
    }
  }, [])

  // Persist passedQuestions to sessionStorage on change
  useEffect(() => {
    if (passedQuestions.length > 0) {
      sessionStorage.setItem(`passedQuestions_${roomCode}`, JSON.stringify(passedQuestions))
    }
  }, [passedQuestions, roomCode])

  useEffect(() => {
    if (!socket) return

    const handleQuestionStarted = (data) => {
      setCurrentQuestion(data)
      setSelectedOption(null)
      setSubmitted(false)
      setTimeLeft(data.timer || 30)
      
      if (data.question && data.question.timeToAnswer) {
        setTimeLeft(data.question.timeToAnswer)
      }
      
      // Store the timer interval ID to clear it later
      if (window.questionTimerInterval) {
        clearInterval(window.questionTimerInterval)
      }
      
      window.questionTimerInterval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(window.questionTimerInterval)
            window.questionTimerInterval = null
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    const handleQuestionEnded = (data) => {
      // Clear timer if running
      if (window.questionTimerInterval) {
        clearInterval(window.questionTimerInterval)
        window.questionTimerInterval = null
      }
      
      // Store the answered question in passed questions
      if (currentQuestion) {
        setPassedQuestions(prev => [{
          ...currentQuestion,
          answered: submitted,
          selectedOption: submitted ? selectedOption : null,
          results: data?.results || null
        }, ...prev].slice(0, 10)) // Keep last 10
      }
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (question) => {
      // Handle manually created questions from teacher
      // Clear any existing timer
      if (window.questionTimerInterval) {
        clearInterval(window.questionTimerInterval)
        window.questionTimerInterval = null
      }
      
      setCurrentQuestion(question)
      setSelectedOption(null)
      setSubmitted(false)
      setTimeLeft(question.timeToAnswer || 30)
      
      window.questionTimerInterval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(window.questionTimerInterval)
            window.questionTimerInterval = null
            // Time expired - move to passed questions if not answered
            setPassedQuestions(passPrev => [{
              ...question,
              answered: false,
              selectedOption: null,
              timedOut: true,
              results: null
            }, ...passPrev].slice(0, 10))
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
    }
  }, [socket])

  const joinSession = async () => {
    setIsLoading(true)
    try {
      const roomData = await joinRoomByCode(roomCode)
      setRoom(roomData)
      if (user?._id) {
        joinRoom(roomData.code, user._id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitAnswer = async () => {
    if (selectedOption === null || submitted || !currentQuestion) return

    const questionId = currentQuestion._id || currentQuestion.question?._id
    const roomId = room._id
    const responseTime = (currentQuestion.timeToAnswer || 30) - timeLeft

    // Save to MongoDB
    try {
      await fetch('/api/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId,
          studentId: user._id,
          selectedOption,
          responseTime
        })
      })
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    // Emit via socket
    socket.emit('response:submit', {
      roomCode: room.code,
      questionId,
      studentId: user._id,
      selectedOption,
      responseTime
    })

    // Add to passed questions immediately so student can see it
    setPassedQuestions(passPrev => [{
      ...currentQuestion,
      answered: true,
      selectedOption: selectedOption,
      timedOut: false,
      results: null
    }, ...passPrev].slice(0, 10))
    
    setSubmitted(true)
  }

  const leaveSession = () => {
    if (room?.code) {
      leaveRoom(room.code)
    }
    navigate('/student')
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
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
            <p style={{ color: 'var(--text-secondary)' }}>Joining classroom session...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Failed to join session'}</h2>
            <button
              onClick={() => navigate('/student')}
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      minWidth: '1200px'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0 }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room: {room.name}</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Code: {room.code}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px' }}>
          {/* Connection Status */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '16px 24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isConnected ? '#10b981' : '#ef4444'
              }} />
              <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                {isConnected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>
            <button
              onClick={leaveSession}
              style={{
                padding: '8px 16px',
                background: 'var(--nav-hover)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Leave
            </button>
          </div>

          {/* Live Question */}
          {currentQuestion ? (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              borderRadius: '16px',
              padding: '32px',
              color: 'white',
              boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
            }}>
              {/* Timer */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  border: '4px solid rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <span style={{ fontSize: '36px', fontWeight: '700' }}>{timeLeft}</span>
                </div>
                <p style={{ fontSize: '14px', opacity: 0.9 }}>seconds remaining</p>
              </div>

              {/* Question */}
              <h2 style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '32px' }}>
                {currentQuestion.question}
              </h2>

              {/* Options */}
              <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                {currentQuestion.options && currentQuestion.options.map((option, index) => {
                  const isSelected = selectedOption === index
                  const optionText = typeof option === 'string' ? option : option.text
                  const optionLabel = String.fromCharCode(65 + index) // Always show A, B, C, D
                  
                  return (
                    <button
                      key={index}
                      onClick={() => !submitted && setSelectedOption(index)}
                      disabled={submitted}
                      style={{
                        padding: '20px 24px',
                        background: submitted 
                          ? 'rgba(255,255,255,0.1)'
                          : (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
                        border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '18px',
                        textAlign: 'left',
                        cursor: submitted ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      <span style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        color: isSelected ? '#1f2937' : 'white',
                        fontSize: '16px'
                      }}>
                        {optionLabel}
                      </span>
                      <span>{optionText}</span>
                    </button>
                  )
                })}
              </div>

              {/* Submit Button */}
              {submitted ? (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px'
                }}>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Answer Submitted</p>
                  <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px' }}>
                    Waiting for next question...
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={selectedOption === null}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: selectedOption !== null ? '#ffd700' : 'rgba(255,255,255,0.2)',
                    color: selectedOption !== null ? '#1f2937' : 'rgba(255,255,255,0.5)',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: selectedOption !== null ? 'pointer' : 'not-allowed'
                  }}
                >
                  Submit Answer
                </button>
              )}
            </div>
          ) : (
            /* Waiting State - Show Passed Questions */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder */}
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: '16px',
                padding: '48px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#eff6ff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: '40px'
                }}>
                  ⏳
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                  Waiting for Next Question
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>
                  The teacher will start a poll soon. Stay tuned!
                </p>
              </div>

              {/* Passed Questions */}
              {passedQuestions.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: 'var(--card-shadow)',
                  border: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    📝 Passed Questions
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {passedQuestions.map((q, index) => (
                      <div key={index} style={{
                        padding: '16px',
                        background: 'var(--bg-primary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              padding: '2px 8px',
                              background: q.answered ? '#d1fae5' : '#fee2e2',
                              color: q.answered ? '#059669' : '#dc2626',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? 'Answered' : 'Missed'}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              background: '#eff6ff',
                              color: '#3b82f6',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              background: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              {q.points || 100} pts
                            </span>
                          </div>
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                          {typeof q.question === 'string' ? q.question : q.question?.text || 'Question'}
                        </p>
                        {q.answered && q.selectedOption !== null && (
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                            Your answer: {q.options?.[q.selectedOption]?.text || String.fromCharCode(65 + q.selectedOption)}
                          </p>
                        )}
                        {!q.answered && (
                          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
                            You did not answer this question
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentRoomPage