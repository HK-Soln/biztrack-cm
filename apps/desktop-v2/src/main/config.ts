// API base URL for the main-process BFF. The renderer never calls the API directly.
export const API_BASE_URL = process.env.VITE_API_URL?.trim() || 'http://localhost:3001/api/v1'
