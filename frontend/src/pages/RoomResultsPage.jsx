import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function RoomResultsPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { setAuthToken } = useRoomStore()
  
  const [room, setRoom] = useState(null)
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalResponses: 0,
    totalCorrect: 0,
    averageScore: 0,
    participationRate: 0
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRoomData()
    }
  }, [token, roomId])

  const fetchRoomData = async () => {
    setIsLoading(true)
    try {
      // Fetch room details
      const roomRes = await fetch(`/api/rooms/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const roomData = await roomRes.json()
      setRoom(roomData.room || roomData)

      // Fetch questions for this room
      const qRes = await fetch(`/api/questions?roomId=${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const qData = await qRes.json()
      const roomQuestions = qData.questions || []
      setQuestions(roomQuestions)

      // Fetch responses for each question
      const responsesData = {}
      let totalResponses = 0
      let totalCorrect = 0

      for (const q of roomQuestions) {
        const rRes = await fetch(`/api/responses/stats/room/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const rData = await rRes.json()
        responsesData[q._id] = rData.stats || {}
        totalResponses += rData.stats?.totalResponses || 0
        totalCorrect += rData.stats?.correctCount || 0
      }
      
      setResponses(responsesData)
      
      // Calculate overall stats
      const averageScore = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0
      const participationRate = roomQuestions.length > 0 
        ? Math.round((totalResponses / (roomQuestions.length * 10)) * 100) // Assuming ~10 students per question
        : 0

      setStats({
        totalResponses,
        totalCorrect,
        averageScore,
        participationRate: Math.min(participationRate, 100)
      })
    } catch (err) {
      console.error('Failed to fetch room results:', err)
    } finally {
      setIsLoading(false)
    }
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
            <p style={{ color: 'var(--text-secondary)' }}>Loading results...</p>
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
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                📊 {room?.name || 'Room'} Results
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Code: {room?.code} • Completed
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px' }}>
          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{questions.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Questions</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.totalResponses}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Responses</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#059669' }}>{stats.averageScore}%</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Average Score</div>
            </div>
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{stats.totalCorrect}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Correct Answers</div>
            </div>
          </div>

          {/* Questions Analysis */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Question-wise Analysis
            </h2>
            
            {questions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p>No questions were asked in this room.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {questions.map((q, index) => {
                  const qStats = responses[q._id] || {}
                  const correctRate = qStats.totalResponses > 0 
                    ? Math.round((qStats.correctCount / qStats.totalResponses) * 100) 
                    : 0
                  
                  return (
                    <div key={q._id} style={{
                      padding: '20px',
                      background: 'var(--bg-primary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
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
                              fontWeight: '700'
                            }}>
                              {index + 1}
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
                              {q.points} pts
                            </span>
                          </div>
                          <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 12px' }}>
                            {q.question}
                          </p>
                          
                          {/* Options with correct answer highlighted */}
                          <div style={{ display: 'grid', gap: '8px' }}>
                            {q.options && q.options.map((opt, optIdx) => {
                              const isCorrect = opt.isCorrect
                              return (
                                <div key={optIdx} style={{
                                  padding: '10px 14px',
                                  background: isCorrect ? '#d1fae5' : 'var(--bg-card)',
                                  borderRadius: '8px',
                                  border: isCorrect ? '2px solid #059669' : '1px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px'
                                }}>
                                  <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isCorrect ? '#059669' : 'var(--border-color)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                  }}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span style={{ 
                                    fontSize: '14px', 
                                    color: 'var(--text-primary)',
                                    fontWeight: isCorrect ? '600' : '400'
                                  }}>
                                    {opt.text}
                                  </span>
                                  {isCorrect && (
                                    <span style={{ marginLeft: 'auto', color: '#059669', fontSize: '14px' }}>✓ Correct</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        
                        {/* Question Stats */}
                        <div style={{
                          minWidth: '120px',
                          textAlign: 'center',
                          padding: '16px',
                          background: correctRate >= 70 ? '#d1fae5' : correctRate >= 40 ? '#fef3c7' : '#fee2e2',
                          borderRadius: '12px'
                        }}>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: correctRate >= 70 ? '#059669' : correctRate >= 40 ? '#d97706' : '#dc2626' }}>
                            {correctRate}%
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {qStats.totalResponses || 0} responses
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate('/teacher/room-history')}
            style={{
              marginTop: '24px',
              padding: '12px 24px',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            ← Back to Room History
          </button>
        </div>
      </div>
    </div>
  )
}

export default RoomResultsPage