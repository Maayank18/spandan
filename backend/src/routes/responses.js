import express from 'express'
const router = express.Router()

// POST /api/responses - Save a student's answer
router.post('/', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    
    const { roomId, questionId, studentId, selectedOption, responseTime } = req.body

    if (!roomId || !questionId || !studentId || selectedOption === undefined) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Get the question to check correct answer and points
    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    // Check if answer is correct
    const selectedOptionData = question.options[selectedOption]
    const isCorrect = selectedOptionData?.isCorrect || false
    
    // Calculate points based on correctness
    const points = isCorrect ? (question.points || 100) : 0

    const response = new Response({
      roomId,
      questionId,
      studentId,
      selectedOption,
      isCorrect,
      responseTime: responseTime || 0,
      points
    })

    await response.save()

    res.status(201).json({
      success: true,
      response: {
        ...response.toObject(),
        isCorrect,
        points
      }
    })
  } catch (error) {
    console.error('Error saving response:', error)
    res.status(500).json({ success: false, error: 'Failed to save response' })
  }
})

// GET /api/responses?roomId=xxx&studentId=yyy - Get responses for a room/student
router.get('/', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const { roomId, studentId } = req.query

    const filter = {}
    if (roomId) filter.roomId = roomId
    if (studentId) filter.studentId = studentId

    const responses = await Response.find(filter).populate('questionId').lean()

    res.json({
      success: true,
      responses
    })
  } catch (error) {
    console.error('Error fetching responses:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch responses' })
  }
})

// GET /api/responses/stats/student/:studentId - Get student stats
router.get('/stats/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default
    
    const { studentId } = req.params

    // Total rooms student has participated in
    const uniqueRooms = await Response.distinct('roomId', { studentId })
    const totalRooms = uniqueRooms.length

    // Total responses (polls taken)
    const pollsTaken = await Response.countDocuments({ studentId })

    // Get all responses for average calculation
    const responses = await Response.find({ studentId })
    const totalPoints = responses.reduce((sum, r) => sum + r.points, 0)
    const average = pollsTaken > 0 ? Math.round((totalPoints / (pollsTaken * 100)) * 100) : 0

    // Count missed polls (questions they didn't answer)
    // This would need question count per room to calculate properly

    res.json({
      success: true,
      stats: {
        totalRooms,
        pollsTaken,
        average
      }
    })
  } catch (error) {
    console.error('Error fetching student stats:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch stats' })
  }
})

// GET /api/responses/stats/room/:roomId - Get room stats for teacher
router.get('/stats/room/:roomId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    
    const { roomId } = req.params

    // Total responses for this room
    const totalResponses = await Response.countDocuments({ roomId })
    
    // Get unique students who responded
    const uniqueStudents = await Response.distinct('studentId', { roomId })
    
    // Get total questions in this room
    const totalQuestions = await Question.countDocuments({ roomId })

    // Get question-level breakdown
    const questionStats = await Question.find({ roomId }).lean()
    const stats = await Promise.all(questionStats.map(async (q) => {
      const responses = await Response.find({ roomId, questionId: q._id })
      const answerCounts = {}
      q.options.forEach((opt, idx) => {
        answerCounts[idx] = responses.filter(r => r.selectedOption === idx).length
      })
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        totalResponses: responses.length,
        answerCounts
      }
    }))

    res.json({
      success: true,
      stats: {
        totalResponses,
        totalStudents: uniqueStudents.length,
        totalQuestions,
        questionStats: stats
      }
    })
  } catch (error) {
    console.error('Error fetching room stats:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch stats' })
  }
})

export default router
