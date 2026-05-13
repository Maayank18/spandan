import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import useSocketStore from './stores/socketStore'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import StudentDashboard from './pages/StudentDashboard'
import RoomDetailPage from './pages/RoomDetailPage'
import StudentRoomPage from './pages/StudentRoomPage'
import CreateRoomPage from './pages/CreateRoomPage'
import ManageRoomPage from './pages/ManageRoomPage'
import JoinRoomPage from './pages/JoinRoomPage'
import RoomHistoryPage from './pages/RoomHistoryPage'
import RoomResultsPage from './pages/RoomResultsPage'
import ProfilePage from './pages/ProfilePage'

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated } = useAuthStore()
  const { connect, disconnect } = useSocketStore()

  // Connect socket when user is authenticated with valid token
  useEffect(() => {
    if (token && isAuthenticated) {
      console.log('App: connecting socket with token')
      connect(token)
    } else {
      console.log('App: disconnecting socket')
      disconnect()
    }
  }, [token, isAuthenticated, connect, disconnect])

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [isDark])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/teacher" element={<DashboardPage />} />
        <Route path="/teacher/create-room" element={<CreateRoomPage />} />
        <Route path="/teacher/manage-room" element={<ManageRoomPage />} />
        <Route path="/teacher/profile" element={<ProfilePage />} />
        <Route path="/teacher/room-history" element={<RoomHistoryPage />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/join-room" element={<JoinRoomPage />} />
        <Route path="/student/room-history" element={<RoomHistoryPage />} />
        <Route path="/student/profile" element={<ProfilePage />} />
        <Route path="/room/:roomId" element={<RoomDetailPage />} />
        <Route path="/room/:roomId/results" element={<RoomResultsPage />} />
        <Route path="/session/:roomCode" element={<StudentRoomPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
