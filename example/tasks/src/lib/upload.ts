import path from 'path'
import { randomString } from './util'
import { UploadedFileParams } from 'restrant2'
import fs from 'fs'
import os from 'os'

export async function save(
  uploadedFile: UploadedFileParams,
  rootPath: string,
  fileName: string = randomString()
): Promise<string> {
  const filePath = path.join(rootPath, fileName)
  await uploadedFile.mv(filePath)
  return fileName
}

export class UploadedFileCache {
  constructor(readonly cacheDir: string = os.tmpdir()) {}

  async cache(uploadedFile: UploadedFileParams): Promise<string> {
    return await save(uploadedFile, this.cacheDir)
  }

  switchDir(to: string, key: string): string {
    const cachePath = path.join(this.cacheDir, key)
    if (!fs.existsSync(cachePath)) {
      throw new Error(`Cached file lost: ${cachePath}`)
    }
    fs.renameSync(cachePath, path.join(to, key))
    return key
  }

  fullPath(key: string) {
    return path.join(this.cacheDir, key)
  }
}

const globalUploadedFileCache = new UploadedFileCache()

export { globalUploadedFileCache }
