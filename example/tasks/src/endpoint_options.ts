import { CreateOptionsFunction } from 'restrant2'
import createDebug from 'debug'

const debug = createDebug('tasks:entrypont:options')

export type AcceptLanguageOption = {
  languages: string[]
}

// eslint-disable-next-line @typescript-eslint/require-await
export const createOptions: CreateOptionsFunction = async (ctx, _httpPath, _ad) => {
  debug('createOptions')
  const acceptLanguage = ctx.req.headers['accept-language']
  const option: AcceptLanguageOption = {
    languages: acceptLanguage?.split(',') || [],
  }
  return [option]
}
