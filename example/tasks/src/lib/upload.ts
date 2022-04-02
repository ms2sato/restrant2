import path from 'path'
import { randomString } from './util'
import { UploadedFile } from 'restrant2'
import fs from 'fs'
import os from 'os'

// [Caution!] This is sample implements, not for production [Caution!]
// Not supported: server scalling, Persistence file metadata

export async function save(
  uploadedFile: UploadedFile,
  rootPath: string,
  fileName: string = randomString()
): Promise<string> {
  const filePath = path.join(rootPath, fileName)
  await uploadedFile.mv(filePath)
  return fileName
}

export class UploadedFileCache {
  private key2Metadata = new Map<string, UploadedFile>()

  constructor(readonly cacheDir: string = os.tmpdir()) {}

  async store(uploadedFile: UploadedFile): Promise<string> {
    const key = await save(uploadedFile, this.cacheDir)
    this.key2Metadata.set(key, uploadedFile)
    return key
  }

  load(key: string) {
    const uploadedFile = this.key2Metadata.get(key)
    if (!uploadedFile) {
      throw new Error(`Cache metadata not found: ${key}`)
    }
    return new CachedUploadedFile(this, key, uploadedFile)
  }

  fullPath(key: string) {
    return path.join(this.cacheDir, key)
  }
}

export class CachedUploadedFile implements UploadedFile {
  constructor(public uploadedFileCache: UploadedFileCache, private key: string, private metadata: UploadedFile) {}

  get data() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.metadata.data
  }
  get name() {
    return this.metadata.name
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async mv(to: string) {
    fs.renameSync(this.tempFilePath, to)
  }
  get mimetype() {
    return this.metadata.mimetype
  }
  get tempFilePath() {
    return this.uploadedFileCache.fullPath(this.key)
  }
  get truncated() {
    return this.metadata.truncated
  }
  get size() {
    return this.metadata.size
  }
  get md5() {
    return this.metadata.md5
  }
}

const globalUploadedFileCache = new UploadedFileCache()

export { globalUploadedFileCache }
