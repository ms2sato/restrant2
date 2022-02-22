import express from 'express'
import { z } from 'zod'
import { RouteOption, Handlers, error, handle } from 'restrant2.ts'

import { TaskCreateParams } from '../../params'
import { Tasks } from '../../app/tasks'

export function setup(options: RouteOption):Handlers {
  const tasks = new Tasks()

  const index = async (req: express.Request, res: express.Response) => {    
    res.json(tasks.index())
  }

  const _time =  () => {}

  const create = async (req: express.Request, res: express.Response) => {
    const err = error(req)
    if(err) {
      return res.render('tasks/index', { body: req.body, err })
    } 

    const params: TaskCreateParams = (req as any).input
    const object = tasks.create(params)
    res.json(object)      
  }

  const update = handle(
    async (params: TaskCreateParams, req: express.Request, res: express.Response) => { 
      res.redirect('/tasks')
    }, 
    (err: z.ZodError, req: express.Request, res: express.Response) => { 
      res.render('tasks/build', { body: req.body, err }) 
    }
  )

  const destroy = () => {}

  return { index, create, update, destroy, _time };
}
