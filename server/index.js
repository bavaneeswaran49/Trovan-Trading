import { existsSync } from 'node:fs'
import path from 'node:path'
import { getConfig, projectRoot } from './config.js'
import { createApp } from './app.js'
const envPath = path.join(projectRoot, '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)
const config = getConfig()
const { app, store } = createApp(config)
const server = app.listen(config.port, () => console.log(`Trovan API ready at http://localhost:${config.port}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { store.close(); process.exit(0) }))
