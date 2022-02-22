import express from 'express'
import { z } from 'zod'

export type Handler = (req: express.Request, res: express.Response) => void

export type Handlers = {
  [key:string]: Handler
}

export function error(req: express.Request): z.ZodError {
  return (req as any).validationError
}

export const handle = <P>(
  success: (params: P, req: express.Request, res: express.Response) => void, 
  failure: (err: z.ZodError, req: express.Request, res: express.Response) => void
) => { 
  return async (req: express.Request, res: express.Response) => {
    const err = error(req)
    if(err) { 
      return failure(err, req, res)
    }
    else {
      return success((req as any).input as P, req, res)
    }
  } 
}

