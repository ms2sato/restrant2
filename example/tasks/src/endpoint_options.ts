import { CreateOptionsFunction } from 'restrant2'
import createDebug from 'debug'

const debug = createDebug('tasks:entrypont:options')

export type AcceptLanguageOption = {
  languages: string[]
}

export const createOptions: CreateOptionsFunction = async (ctx, httpPath, ad) => {
  debug('createOptions')
  const acceptLanguage = ctx.req.headers['accept-language']
  const option: AcceptLanguageOption = {
    languages: acceptLanguage?.split(',') || [],
  }
  return [option]
}
