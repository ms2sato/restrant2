import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'

const log = debug('restrant2')
const routeLog = log.extend('route')
const handlerLog = log.extend('handler')

export type ConstructSource = 'body' | 'query' | 'params'
export type ActionName = 'build' | 'edit' | 'show' | 'index' | 'create' | 'update' | 'destroy'

export type ActionDescriptor = {
  action: string
  path: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
}

export type ConstructActionDescriptor = {
  schema?: z.AnyZodObject
  sources?: readonly ConstructSource[]
}

export type ConstructOption = {
  [key: string]: ConstructActionDescriptor
}

export type RouteOption = {
  name: string
  construct?: ConstructOption
  actions?: readonly ActionDescriptor[]
}

export interface Router {
  readonly router: express.Router
  sub(...args: any[]): Router
  resources(path: string, options: RouteOption): Promise<void>
}

const defaultConstructSources: Record<string, readonly ConstructSource[]> = {
  build: ['params'],
  edit: ['params'],
  show: ['params'],
  index: ['params'],
  create: ['body', 'params'],
  update: ['body', 'params'],
  destroy: ['params'],
}

export namespace Actions {
  const build: ActionDescriptor = {
    action: 'build',
    path: '/build',
    method: 'get',
  } as const
  const edit: ActionDescriptor = {
    action: 'edit',
    path: '/:id/edit',
    method: 'get',
  } as const
  const show: ActionDescriptor = {
    action: 'show',
    path: '/:id',
    method: 'get',
  } as const
  const index: ActionDescriptor = {
    action: 'index',
    path: '/',
    method: 'get',
  } as const
  const create: ActionDescriptor = {
    action: 'create',
    path: '/',
    method: 'post',
  } as const
  const update: ActionDescriptor = {
    action: 'update',
    path: '/:id',
    method: 'patch',
  } as const
  const destroy: ActionDescriptor = {
    action: 'destroy',
    path: '/:id',
    method: 'delete',
  } as const

  const all: readonly ActionDescriptor[] = [build, edit, show, index, create, update, destroy]

  export type Option =
    | {
        only: readonly ActionName[]
        except?: undefined
      }
    | {
        except: readonly ActionName[]
        only?: undefined
      }

  export function standard(option?: Option): readonly ActionDescriptor[] {
    return applyOption(all, option)
  }

  export function api(option?: Option): readonly ActionDescriptor[] {
    const actions = [show, index, create, update, destroy]
    return applyOption(actions, option)
  }

  function applyOption(actions: readonly ActionDescriptor[], option?: Option) {
    if (!option) {
      return actions
    }

    if (option.only) {
      return only(option.only, actions)
    }

    if (option.except) {
      return except(option.except, actions)
    }

    throw new RouterError('Unreachable!')
  }

  export function only(actions: readonly ActionName[], sources: readonly ActionDescriptor[] = all): ActionDescriptor[] {
    return sources.filter((ad) => actions.includes(ad.action as ActionName))
  }

  export function except(
    actions: readonly ActionName[],
    sources: readonly ActionDescriptor[] = all
  ): ActionDescriptor[] {
    return sources.filter((ad) => !actions.includes(ad.action as ActionName))
  }
}

export type ValidationError = z.ZodError

export type Handler = (req: express.Request, res: express.Response) => void

export type PostHandler = {
  success: (output: any, req: express.Request, res: express.Response) => Promise<void>
  invalid?: (err: ValidationError, req: express.Request, res: express.Response) => Promise<void>
  fatal?: (err: Error, req: express.Request, res: express.Response) => Promise<void>
}

export type Handlers = {
  [key: string]: Handler | PostHandler
}

type InputArranger = (
  input: Record<string, any>,
  schema: z.ZodObject<any>,
  req: express.Request,
  res: express.Response
) => Record<string, any>

type ServerRouterOption = {
  inputKey: string
  errorKey: string
  actions: readonly ActionDescriptor[]
  inputArranger: InputArranger
  actionRoot: string
  actionFileName: string
  resourceRoot: string
  resourceFileName: string
}

export const blankSchema = z.object({})
export type BlankParams = z.infer<typeof blankSchema>

const mergeSource = (req: express.Request, sources: readonly string[]): Record<string, any> => {
  let merged = {}
  const record = req as Record<string, any>
  for (const source of sources) {
    merged = { ...merged, ...record[source] }
  }
  return merged
}

const smartInputArranger: InputArranger = (
  input: Record<string, any>,
  schema: z.ZodObject<any>,
  req: express.Request,
  res: express.Response
) => {
  for (const [key, val] of Object.entries(input)) {
    // TODO: for other type
    if (schema.shape[key] instanceof z.ZodNumber) {
      input[key] = Number(val)
    }
  }
  return input
}

const constructMiddleware = (
  schema: z.ZodObject<any>,
  sources: readonly string[],
  routerOption: ServerRouterOption
) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const body = routerOption.inputArranger(mergeSource(req, sources), schema, req, res)
    try {
      const input = schema.parse(body)
      ;(req as any)[routerOption.inputKey] = input
      next()
    } catch (err) {
      if (err instanceof z.ZodError) {
        ;(req as any)[routerOption.errorKey] = err
        next()
      } else {
        next(err)
      }
    }
  }
}

class RouterError extends Error {}

export class ServerRouter implements Router {
  readonly router: express.Router

  constructor(
    readonly fileRoot: string,
    readonly httpPath: string = '/',
    readonly routerOption: ServerRouterOption = {
      inputKey: 'input',
      errorKey: 'validationError',
      actions: Actions.standard(),
      inputArranger: smartInputArranger,
      actionRoot: './endpoint',
      actionFileName: 'handlers',
      resourceRoot: './endpoint',
      resourceFileName: 'resource',
    }
  ) {
    this.router = express.Router({ mergeParams: true })
  }

  sub(...args: any[]) {
    const subRouter = new ServerRouter(this.fileRoot, path.join(this.httpPath, args[0]), this.routerOption)
    ;(this.router as any).use.apply(this.router, [...args, subRouter.router])
    return subRouter
  }

  async resources(rpath: string, option: RouteOption) {
    const setupDynamic = async (modulePath: string, support: any, option: RouteOption) => {
      let ret
      try {
        ret = await import(path.join(this.fileRoot, modulePath))
      } catch (err) {
        const error = err as any
        if (error.code === 'MODULE_NOT_FOUND') {
          routeLog.extend('debug')('%s not found', modulePath)
          return {}
        } else {
          throw err
        }
      }

      try {
        return await ret.default(support, option)
      } catch (err) {
        if (err instanceof Error) {
          // for Error 2nd argument type
          // @ts-ignore
          throw new RouterError(`Error occured "${err.message}" on calling default function in "${modulePath}"`, {
            cause: err,
          })
        } else {
          throw new TypeError(`Unexpected Error Object: ${err}`)
        }
      }
    }

    const resourcePath = path.join(
      this.routerOption.resourceRoot,
      this.httpPath,
      rpath,
      this.routerOption.resourceFileName
    )
    const resource = await setupDynamic(resourcePath, new ResourceSupport(this.fileRoot, this.routerOption), option)

    const actionPath = path.join(this.routerOption.actionRoot, this.httpPath, rpath, this.routerOption.actionFileName)
    const handlers: Handlers = await setupDynamic(
      actionPath,
      new ActionSupport(this.fileRoot, this.routerOption),
      option
    )

    const actionDescriptors: readonly ActionDescriptor[] = option.actions || this.routerOption.actions

    for (const ad of actionDescriptors) {
      const actionName = ad.action

      const resourceMethod: Function | undefined = resource[actionName]
      const actionFunc: Handler | PostHandler | undefined = handlers[actionName]
      const cad: ConstructActionDescriptor | undefined = option.construct?.[actionName]

      const actionOverride = actionFunc instanceof Function
      if (!actionOverride) {
        if (resourceMethod === undefined) {
          throw new RouterError(
            `Handler not found! define ${resourcePath}#${actionName} or/and ${actionPath}#${actionName}`
          )
        }
      }

      if (actionOverride && resourceMethod) {
        routeLog.extend('warn')(
          `${resourcePath}#${actionName} is defined but will not be called auto. PostHandler support auto call`
        )
      }

      const defaultSources = defaultConstructSources[actionName] || ['params']

      const handler: express.Handler = async (req, res, next) => {
        if (actionFunc instanceof Function) {
          try {
            handlerLog('%s#%s as Handler', actionPath, actionName)
            await actionFunc(req, res)
          } catch (err) {
            next(err)
          }
          return
        }

        try {
          const validationError = (req as any).validationError
          if (validationError) {
            handlerLog('%s#%s validationError %s', actionPath, actionName, validationError.message)
            if (actionFunc) {
              if (actionFunc.invalid) {
                handlerLog('%s#%s.invalid', actionPath, actionName)
                res.status(422)
                await actionFunc.invalid(validationError, req, res)
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid as json', actionPath, actionName)
              res.status(422)
              res.json({
                status: 'error',
                errors: validationError.errors,
                message: validationError.message,
              })
            }
            return
          }

          const input = (req as any).input
          const output = await resourceMethod!.call(resource, input)
          if (actionFunc) {
            handlerLog('%s#%s.success', actionPath, actionName)
            await actionFunc.success(output, req, res)
          } else {
            handlerLog('%s#%s success as json', actionPath, actionName)
            res.json({ status: 'success', data: output })
          }
        } catch (err) {
          if (!actionFunc?.fatal) {
            return next(err)
          }

          try {
            handlerLog('%s#%s.fatal', actionPath, actionName)
            await actionFunc.fatal(err as Error, req, res)
          } catch (er) {
            next(er)
          }
        }
      }

      let params
      const urlPath = path.join(rpath, ad.path)
      if (resourceMethod) {
        const schema = cad?.schema || blankSchema
        params = [constructMiddleware(schema, cad?.sources || defaultSources, this.routerOption), handler]
      } else {
        params = [handler]
      }

      routeLog(
        '%s %s\t%s\t{validate:%s, actionOverride:%s, resourceMethod:%s}',
        ad.method,
        path.join(this.httpPath, urlPath),
        actionName,
        params.length !== 1,
        actionOverride,
        !!resourceMethod
      )
      ;(this.router as any)[ad.method].apply(this.router, [urlPath, ...params])
    }
  }
}

export class ActionSupport {
  constructor(readonly rootPath: string, readonly routerOption: ServerRouterOption) {}

  input(req: express.Request): any {
    return (req as any)[this.routerOption.inputKey]
  }

  error(req: express.Request): ValidationError {
    return (req as any)[this.routerOption.errorKey]
  }
}

export class ResourceSupport {
  constructor(readonly rootPath: string, readonly routerOption: ServerRouterOption) {}
}

export function defineResource(callback: (support: ResourceSupport, options: RouteOption) => Record<string, Function>) {
  return callback
}

export function defineActions(callback: (support: ActionSupport, options: RouteOption) => Handlers) {
  return callback
}
