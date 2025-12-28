import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { get } from 'node:https'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const GITHUB_API = 'https://api.github.com/repos/Softcatala/catalan-dict-tools/releases/latest'
const DATA_DIR = join(process.cwd(), 'src', 'data')
const OUTPUT_FILE = join(DATA_DIR, 'catalan-words.json')

interface GitHubRelease {
  tag_name: string
  assets: Array<{
    name: string
    browser_download_url: string
  }>
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close()
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`))
        return
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      reject(err)
    })
  })
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
  return new Promise((resolve, reject) => {
    get(GITHUB_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, (response) => {
      let data = ''
      response.on('data', (chunk) => data += chunk)
      response.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

function parseDicFile(content: string): string[] {
  const lines = content.split('\n')
  const words: string[] = []

  // Skip the first line (count line)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Remove affix flags (everything after /)
    const word = line.split('/')[0].trim()

    // Only include words with letters (including Catalan special characters)
    // Filter out very short words, acronyms, and words with numbers
    if (word.length >= 3 && /^[a-záàéèíïóòúüç·]+$/i.test(word) && !word.match(/^[A-Z]{2,}$/)) {
      words.push(word.toLowerCase())
    }
  }

  // Remove duplicates and sort
  return [...new Set(words)].sort()
}

async function main() {
  console.log('📚 Downloading Catalan dictionary...')

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  // Fetch latest release info
  console.log('🔍 Fetching latest release info...')
  const release = await fetchLatestRelease()
  console.log(`📦 Found release: ${release.tag_name}`)

  // Find the ca.X.X.X-all.zip asset
  const asset = release.assets.find(a =>
    a.name.match(/^ca\.\d+\.\d+\.\d+-all\.zip$/)
  )

  if (!asset) {
    throw new Error('Could not find ca.X.X.X-all.zip in latest release')
  }

  console.log(`⬇️  Downloading ${asset.name}...`)
  const zipPath = join(DATA_DIR, asset.name)
  await downloadFile(asset.browser_download_url, zipPath)

  // Extract using unzip command
  console.log('📂 Extracting dictionary file...')
  try {
    execSync(`cd "${DATA_DIR}" && unzip -o "${asset.name}"`, {
      stdio: 'inherit'
    })
  } catch (err) {
    console.error('Failed to extract zip file')
    throw err
  }

  // Find the catalan.dic file
  const files = readdirSync(DATA_DIR)
  const dicFile = files.find(f => f === 'catalan.dic')

  if (!dicFile) {
    console.error('Available files:', files)
    throw new Error('Could not find catalan.dic file after extraction')
  }

  console.log(`📖 Processing ${dicFile}...`)
  const dicPath = join(DATA_DIR, dicFile)

  // Read the dictionary file
  const dicContent = readFileSync(dicPath, 'utf-8')

  // Parse the dictionary file
  console.log('🔤 Parsing words...')
  const words = parseDicFile(dicContent)

  console.log(`✅ Found ${words.length} valid words`)

  // Save to JSON file
  console.log(`💾 Saving to ${OUTPUT_FILE}...`)
  writeFileSync(OUTPUT_FILE, JSON.stringify(words, null, 2))

  // Clean up temporary files
  console.log('🧹 Cleaning up...')
  unlinkSync(zipPath)

  // Remove all extracted files except the JSON
  const filesToRemove = [
    'catalan.dic',
    'catalan.aff',
    'catalan-valencia.dic',
    'catalan-valencia.aff',
    'ca.3.0.9.oxt',
    'ca.3.0.9.xpi',
    'ca-valencia.3.0.9.oxt',
    'ca-valencia.3.0.9.xpi',
    'gpl-2.0.txt',
    'lgpl-2.1.txt',
    'LICENSE',
    'README.txt',
    'release-notes_en.txt'
  ]

  for (const file of filesToRemove) {
    const filePath = join(DATA_DIR, file)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  console.log('✨ Done! Dictionary ready to use.')
}

main().catch(console.error)
