import path from 'node:path'
import { argv } from 'node:process'
import dotenv from 'dotenv'

const sample = argv[3]

if (sample) {
  console.log(`loading sample samples/${sample}.json`)
  process.env.CONFIG = path.join(import.meta.dirname, 'samples', `${sample}.json`)
} else {
  console.log('loading .env.development and .env.local')
  dotenv.config({
    path: ['../../.env.development', '../../.env.local'],
    quiet: true,
  })
}

await import('./src/index.js')
