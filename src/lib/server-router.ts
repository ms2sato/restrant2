import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'
import {
  ActionDescriptor,
  Actions,
  ActionSupport,
  ConstructActionDescriptor,
  ConstructSource,
  Handler,
  Handlers,
  InputArranger,
  PostHandler,
  ResourceSupport,
  RouteOption,
  Router,
  RouterError,
  ServerRouterOption,
} from './router'

const log = debug('restrant2')
const routeLog = log.extend('route')
const handlerLog = log.extend('handler')

export const blankSchema = z.object({})
export type BlankParams = z.infer<typeof blankSchema>

const defaultConstructSources: Record<string, readonly ConstructSource[]> = {
  build: ['params'],
  edit: ['params'],
  show: ['params'],
  index: ['params'],
  create: ['body', 'files', 'params'],
  update: ['body', 'files', 'params'],
  destroy: ['params'],
}

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
      routeLog('input', input)
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

const createNullResourceMethodOptions = (
  req: express.Request,
  res: express.Response,
  httpPath: string,
  ad: ActionDescriptor
) => {
  return []
}

export const importAndSetup = async (
  fileRoot: string,
  modulePath: string,
  support: ResourceSupport | ActionSupport,
  option: RouteOption
) => {
  let ret
  const fullPath = path.join(fileRoot, modulePath)
  try {
    ret = await import(fullPath)
  } catch (err) {
    const error = err as any
    if (error.code === 'MODULE_NOT_FOUND') {
      routeLog.extend('debug')('%s not found', fullPath)
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

function defaultServerRouterOption(): ServerRouterOption {
  return {
    inputKey: 'input',
    errorKey: 'validationError',
    actions: Actions.standard(),
    inputArranger: smartInputArranger,
    createResourceMethodOptions: createNullResourceMethodOptions,
    actionRoot: './endpoint',
    handlersFileName: 'handlers',
    resourceRoot: './endpoint',
    resourceFileName: 'resource',
  }
}

export abstract class BasicRouter implements Router {
  protected readonly routerOption: ServerRouterOption

  constructor(
    readonly fileRoot: string,
    readonly httpPath: string = '/',
    routerOption: Partial<ServerRouterOption> = {}
  ) {
    this.routerOption = Object.assign(defaultServerRouterOption(), routerOption)
  }

  abstract sub(...args: any[]): Router
  abstract resources(rpath: string, option: RouteOption): Promise<void>

  protected getHttpPath(rpath: string) {
    return path.join(this.httpPath, rpath)
  }

  protected getResourcePath(rpath: string) {
    return path.join(this.routerOption.resourceRoot, this.getHttpPath(rpath), this.routerOption.resourceFileName)
  }

  protected getHandlersPath(rpath: string) {
    return path.join(this.routerOption.actionRoot, this.getHttpPath(rpath), this.routerOption.handlersFileName)
  }
}

export class ServerRouter extends BasicRouter {
  readonly router: express.Router

  constructor(fileRoot: string, httpPath: string = '/', routerOption: Partial<ServerRouterOption> = {}) {
    super(fileRoot, httpPath, routerOption)
    this.router = express.Router({ mergeParams: true })
  }

  sub(...args: any[]) {
    const subRouter = new ServerRouter(this.fileRoot, path.join(this.httpPath, args[0]), this.routerOption)
    ;(this.router as any).use.apply(this.router, [...args, subRouter.router])
    return subRouter
  }

  async resources(rpath: string, option: RouteOption) {
    const resourcePath = this.getResourcePath(rpath)
    const resource = await importAndSetup(
      this.fileRoot,
      resourcePath,
      new ResourceSupport(this.fileRoot, this.routerOption),
      option
    )

    const handlersPath = this.getHandlersPath(rpath)
    const handlers: Handlers = await importAndSetup(
      this.fileRoot,
      handlersPath,
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
            `Handler not found! define ${resourcePath}#${actionName} or/and ${handlersPath}#${actionName}`
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
            handlerLog('%s#%s as Handler', handlersPath, actionName)
            await actionFunc(req, res)
          } catch (err) {
            next(err)
          }
          return
        }

        try {
          const validationError = (req as any).validationError
          if (validationError) {
            handlerLog.extend('debug')('%s#%s validationError %s', handlersPath, actionName, validationError.message)
            if (actionFunc) {
              if (actionFunc.invalid) {
                handlerLog('%s#%s.invalid', handlersPath, actionName)
                res.status(422)
                await actionFunc.invalid(validationError, req, res)
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid as json', handlersPath, actionName)
              res.status(422)
              res.json({
                status: 'error',
                errors: validationError.errors,
                message: validationError.message,
              })
            }
            return
          }

          const options = this.routerOption.createResourceMethodOptions(req, res, this.getHttpPath(rpath), ad)
          const input = (req as any).input
          const args = input ? [input, ...options] : options
          handlerLog('resourceMethod args: %o', args)
          const output = await resourceMethod!.apply(resource, args)

          if (actionFunc) {
            handlerLog('%s#%s.success', handlersPath, actionName)
            await actionFunc.success(output, req, res)
          } else {
            handlerLog('%s#%s success as json', handlersPath, actionName)
            res.json({ status: 'success', data: output })
          }
        } catch (err) {
          if (!actionFunc?.fatal) {
            return next(err)
          }

          try {
            handlerLog('%s#%s.fatal', handlersPath, actionName)
            await actionFunc.fatal(err as Error, req, res)
          } catch (er) {
            next(er)
          }
        }
      }

      let params
      const urlPath = path.join(rpath, ad.path)
      if (resourceMethod && cad?.schema) {
        params = [constructMiddleware(cad.schema, cad.sources || defaultSources, this.routerOption), handler]
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

export class ResourceHolderCreateRouter extends BasicRouter {
  constructor(
    private resourcesHolder: any,
    fileRoot: string,
    httpPath: string = '/',
    routerOption: Partial<ServerRouterOption> = {}
  ) {
    super(fileRoot, httpPath, routerOption)
  }

  sub(...args: any[]) {
    return new ResourceHolderCreateRouter(
      this.resourcesHolder,
      this.fileRoot,
      path.join(this.httpPath, args[0]),
      this.routerOption
    )
  }

  async resources(rpath: string, option: RouteOption) {
    const resourcePath = this.getResourcePath(rpath)
    const resourceSupport = new ResourceSupport(this.fileRoot, this.routerOption)
    const resource = await importAndSetup(this.fileRoot, resourcePath, resourceSupport, option)

    const resourceProxy: Record<string, Function> = {}
    for (let actionName in resource) {
      const resourceMethod = resource[actionName]
      const cad: ConstructActionDescriptor | undefined = option.construct?.[actionName]
      if (cad?.schema) {
        resourceProxy[actionName] = function () {
          const [input, ...options] = Array.from(arguments)
          return resourceMethod.apply(resource, cad.schema?.parse(input), options)
        }
      } else {
        resourceProxy[actionName] = function () {
          return resourceMethod.apply(resource, arguments)
        }
      }

      this.resourcesHolder[path.join(this.httpPath, rpath)] = resourceProxy
    }
  }
}
