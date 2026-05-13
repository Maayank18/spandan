import express from 'express'
import { createRoom, getRoomById, getRoomByCode, getRoomsByTeacher, updateRoom, deleteRoom } from '../services/roomService.js'
import { authenticate } from '../middleware/auth.js'
import { authorize } from '../middleware/auth.js'
import { validate, createRoomSchema } from '../middleware/validation.js'

const router = express.Router()

// Create new room
router.post('/', authenticate, authorize('teacher'), validate(createRoomSchema), async (req, res) => {
  try {
    const { name, settings } = req.validatedBody
    const room = await createRoom(name, req.user._id, settings)

    res.status(201).json({
      message: 'Room created successfully',
      room
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get rooms for current teacher
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const rooms = await getRoomsByTeacher(req.user._id)
      res.json({ rooms })
    } else {
      res.status(403).json({ error: 'Only teachers can view room list' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get room by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    // Check if user is the room teacher or has access
    if (room.teacher._id.toString() !== req.user._id.toString() && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    res.json({ room })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Join room by code (for students)
router.get('/join/:code', authenticate, authorize('student'), async (req, res) => {
  try {
    const room = await getRoomByCode(req.params.code)
    
    // Check if room has ended
    if (room.endedAt) {
      return res.status(400).json({ error: 'This room has ended and can no longer be joined' })
    }
    
    res.json({ room })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Update room
router.put('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can update the room' })
    }

    // Prevent reactivating an ended room
    if (room.endedAt && req.body.isActive === true) {
      return res.status(400).json({ error: 'Cannot reactivate an ended room' })
    }

    const updatedRoom = await updateRoom(req.params.id, req.body)
    res.json({ message: 'Room updated successfully', room: updatedRoom })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Delete room
router.delete('/:id', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can delete the room' })
    }

    await deleteRoom(req.params.id)
    res.json({ message: 'Room deleted successfully' })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

export default router