import { createHashRouter } from 'react-router-dom'
import { Home } from '@/routes/Home'

// Hash routing: robust under Electron's file:// load in production.
export const router = createHashRouter([{ path: '/', element: <Home /> }])
