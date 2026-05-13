import express from 'express'

const router = express.Router()

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// Get question type mix based on number of questions
function getQuestionTypeMix(numQuestions) {
  const types = []
  
  if (numQuestions === 1) {
    types.push('MCQ')
  } else if (numQuestions === 2) {
    types.push('MCQ', 'TF')
  } else if (numQuestions === 3) {
    types.push('MCQ', 'TF', 'MSQ')
  } else {
    const mcqCount = Math.round(numQuestions * 0.5)
    const tfCount = Math.round(numQuestions * 0.3)
    const msqCount = numQuestions - mcqCount - tfCount
    
    for (let i = 0; i < mcqCount; i++) types.push('MCQ')
    for (let i = 0; i < tfCount; i++) types.push('TF')
    for (let i = 0; i < msqCount; i++) types.push('MSQ')
  }
  
  return types.slice(0, numQuestions)
}

// Build the prompt for question generation
function buildQuestionPrompt(transcript, questionTypes, difficulty) {
  const typeInstructions = questionTypes.map((type, index) => {
    switch (type) {
      case 'MCQ':
        return `${index + 1}. MCQ: Create a multiple choice question with ONE correct answer and 3 wrong options (A, B, C, D). Mark the correct answer.`
      case 'TF':
        return `${index + 1}. T/F: Create a True or False question. Mark the correct answer.`
      case 'MSQ':
        return `${index + 1}. MSQ: Create a multiple select question with multiple correct answers (2-4 correct options). Mark ALL correct options.`
      default:
        return ''
    }
  }).join('\n')

  return `You are an expert quiz question generator. Based on the following transcription, generate ${questionTypes.length} quiz questions.

TRANSCRIPTION:
${transcript}

DIFFICULTY: ${difficulty.toUpperCase()}

QUESTION TYPES (follow exactly):
${typeInstructions}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "questions": [
    {
      "type": "MCQ",
      "question": "The question text here?",
      "options": [
        { "text": "Option A", "isCorrect": true },
        { "text": "Option B", "isCorrect": false },
        { "text": "Option C", "isCorrect": false },
        { "text": "Option D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of the answer"
    },
    {
      "type": "TF",
      "question": "The statement here?",
      "options": [
        { "text": "True", "isCorrect": true },
        { "text": "False", "isCorrect": false }
      ],
      "explanation": "Brief explanation"
    },
    {
      "type": "MSQ",
      "question": "The question here?",
      "options": [
        { "text": "Option A", "isCorrect": true },
        { "text": "Option B", "isCorrect": false },
        { "text": "Option C", "isCorrect": true },
        { "text": "Option D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of which options are correct"
    }
  ]
}

IMPORTANT:
- Respond ONLY with valid JSON, no markdown or additional text
- Make questions clear and unambiguous
- Ensure wrong options for MCQ are plausible but clearly wrong
- For MSQ, ensure at least 2 options are correct
- Questions should be based ONLY on the transcription content`
}

// Generate using Ollama
async function generateWithOllama(prompt, model) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 2000
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`)
  }

  const data = await response.json()
  return data.response
}

// Parse questions from response
function parseQuestions(responseText, expectedTypes) {
  try {
    let jsonStr = responseText
    
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      throw new Error('No JSON found in response')
    }
    
    const parsed = JSON.parse(objMatch[0])
    const questions = parsed.questions || []
    
    return questions.map((q, index) => ({
      id: `q_${Date.now()}_${index}`,
      type: q.type || expectedTypes[index] || 'MCQ',
      question: q.question || 'Question text missing',
      options: parseOptions(q.options || [], q.type),
      explanation: q.explanation || '',
      segmentIndex: 0,
      createdAt: new Date().toISOString()
    }))
  } catch (error) {
    console.error('Failed to parse questions:', error)
    return []
  }
}

// Parse options ensuring correct structure
function parseOptions(options, type) {
  if (type === 'TF') {
    return [
      { text: 'True', isCorrect: false },
      { text: 'False', isCorrect: false }
    ]
  }

  if (!Array.isArray(options) || options.length < 2) {
    return [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: false },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ]
  }

  return options.map(opt => ({
    text: opt.text || opt.option || 'Unknown',
    isCorrect: opt.isCorrect || opt.correct || false
  }))
}

// POST /api/questions/generate - Generate questions from transcript
router.post('/generate', async (req, res) => {
  try {
    const { transcript, config } = req.body
    const { 
      numQuestions = 2, 
      difficulty = 'medium',
      ollamaModel = 'llama3.2'
    } = config || {}

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      })
    }

    console.log(`Generating ${numQuestions} questions with ${ollamaModel}...`)

    const questionTypes = getQuestionTypeMix(numQuestions)
    const prompt = buildQuestionPrompt(transcript, questionTypes, difficulty)
    const responseText = await generateWithOllama(prompt, ollamaModel)
    const questions = parseQuestions(responseText, questionTypes)

    console.log(`Generated ${questions.length} questions successfully`)

    res.json({
      success: true,
      questions
    })
  } catch (error) {
    console.error('Question generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate questions'
    })
  }
})

// GET /api/questions/ollama-status - Check Ollama status
router.get('/ollama-status', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    
    if (response.ok) {
      const data = await response.json()
      res.json({
        success: true,
        available: true,
        models: data.models?.map(m => m.name) || []
      })
    } else {
      res.json({
        success: false,
        available: false,
        models: []
      })
    }
  } catch (error) {
    res.json({
      success: false,
      available: false,
      models: [],
      error: error.message
    })
  }
})

export default router
// Create a question (for manual creation)
router.post('/', async (req, res) => {
  try {
    const { authenticate } = await import('../middleware/auth.js')
    // Simple auth check
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    const Question = (await import('../models/Question.js')).default
    const { 
      roomId, 
      type, 
      question, 
      options, 
      timeToAnswer = 30, 
      points = 100,
      status = 'approved',
      segmentIndex = 0
    } = req.body

    if (!roomId || !type || !question || !options) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const newQuestion = new Question({
      roomId,
      type,
      question,
      options,
      timeToAnswer,
      points,
      status,
      segmentIndex
    })

    await newQuestion.save()

    res.status(201).json({
      success: true,
      question: newQuestion
    })
  } catch (error) {
    console.error('Error creating question:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create question'
    })
  }
})

// GET /api/questions?roomId=xxx - Get all questions for a room
router.get('/', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const Question = (await import('../models/Question.js')).default
    const questions = await Question.find({ roomId }).sort({ createdAt: -1 }).lean()
    
    res.json({
      success: true,
      questions
    })
  } catch (error) {
    console.error('Error fetching questions:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions'
    })
  }
})
