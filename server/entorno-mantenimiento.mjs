import { config } from 'dotenv'
config({ path: process.env.MAINTENANCE_ENV_FILE || '.env.maintenance', quiet: true })
