import { createVercelHandler } from '../server/vercel.js'

// Vercel executes this function; the local server/index.js listener is unchanged.
export default createVercelHandler()
