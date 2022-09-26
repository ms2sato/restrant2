import { CreateActionOptionsFunction } from 'restrant2'
import createDebug from 'debug'

const debug = createDebug('tasks:entrypont:options')

export type AcceptLanguageOption = {
  languages: string[]
}

// eslint-disable-next-line @typescript-eslint/require-await
export const createActionOptions: CreateActionOptionsFunction = async (ctx, _httpPath, _ad) => {
  debug('createActionOptions')
  const acceptLanguage = ctx.req.headers['accept-language']
  const option: AcceptLanguageOption = {
    languages: acceptLanguage?.split(',') || [],
  }
  return option
}
