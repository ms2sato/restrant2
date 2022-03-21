import { CreateOptionsFunction } from 'restrant2'
import createDebug from 'debug'

const debug = createDebug('tasks:entrypont:options')

export type AcceptLanguageOption = {
  languages: string[]
}

export const createOptions: CreateOptionsFunction = (req, res, httpPath, ad) => {
  debug('createOptions')
  const acceptLanguage = req.headers['accept-language']
  const option: AcceptLanguageOption = {
    languages: acceptLanguage?.split(',') || [],
  }
  return [option]
}
