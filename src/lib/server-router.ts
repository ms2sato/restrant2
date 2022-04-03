import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'
import {
  ActionContext,
  ActionDescriptor,
  Actions,
  ActionSupport,
  ConstructConfig,
  ConstructDescriptor,
  CreateOptionsFunction,
  Handler,
  MultiOptionAdapter,
  InputArranger,
  MultiOptionResponder,
  ResourceSupport,
  RouteConfig,
  Router,
  RouterError,
  ServerRouterConfig,
  ConstructSource,
  RequestCallback,
} from './router'

const log = debug('restrant2')
const routeLog = log.extend('route')
const handlerLog = log.extend('handler')

export const blankSchema = z.object({})
export type BlankParams = z.infer<typeof blankSchema>

export const idNumberSchema = z.object({
  id: z.number(),
})
export type IdNumberParams = z.infer<typeof idNumberSchema>

// for express-fileupload
export const uploadedFileSchema = z.object({
  name: z.string(),
  mv: z.function().args(z.string()).returns(z.promise(z.void())),
  mimetype: z.string(),
  data: z.any(),
  tempFilePath: z.string(),
  truncated: z.boolean(),
  size: z.number(),
  md5: z.string(),
})

export type UploadedFile = z.infer<typeof uploadedFileSchema>

function defaultConstructConfig(idSchema: z.AnyZodObject = idNumberSchema): ConstructConfig {
  return {
    build: { schema: blankSchema, sources: ['params'] },
    edit: { schema: idSchema, sources: ['params'] },
    show: { schema: idSchema, sources: ['params'] },
    index: { schema: blankSchema, sources: ['params'] },
    create: { sources: ['body', 'files', 'params'] },
    update: { sources: ['body', 'files', 'params'] },
    destroy: { schema: idSchema, sources: ['params'] },
  }
}

const mergeSources = (ctx: ActionContext, sources: readonly string[]): Record<string, any> => {
  let merged = {}
  const record = ctx.req as Record<string, any>
  for (const source of sources) {
    merged = { ...merged, ...record[source] }
  }
  return merged
}

export const smartInputArranger: InputArranger = (
  ctx: ActionContext,
  input: Record<string, any>,
  schema: z.ZodObject<any>
) => {
  for (const [key, val] of Object.entries(input)) {
    // TODO: for other type
    if (schema.shape[key] instanceof z.ZodNumber) {
      input[key] = Number(val)
    }
  }
  return input
}

type ResourceMethodHandlerParams = {
  resourceMethod: Function
  resource: any
  sources: readonly ConstructSource[]
  serverRouterConfig: ServerRouterConfig
  httpPath: string
  schema: z.AnyZodObject
  adapterPath: string
  actionDescriptor: ActionDescriptor
  responder: MultiOptionResponder | RequestCallback
  adapter: MultiOptionAdapter
}

const createResourceMethodHandler = ({
  resourceMethod,
  resource,
  sources,
  serverRouterConfig,
  httpPath,
  schema,
  adapterPath,
  actionDescriptor,
  responder,
  adapter,
}: ResourceMethodHandlerParams): express.Handler => {
  const actionName = actionDescriptor.action

  return async (req, res, next) => {
    const ctx = new ActionContext(req, res)
    const options = await serverRouterConfig.createOptions(ctx, httpPath, actionDescriptor)

    let mergedBody = mergeSources(ctx, sources)
    if ('beforeArrange' in responder) {
      mergedBody = await responder.beforeArrange!(ctx, mergedBody, schema)
    }
    let source = serverRouterConfig.inputArranger(ctx, mergedBody, schema)

    try {
      if ('beforeValidation' in responder) {
        source = await responder.beforeValidation!(ctx, source, schema, mergedBody)
      }

      let input = schema.parse(source)
      if ('afterValidation' in responder) {
        input = await responder.afterValidation!(ctx, input, schema, mergedBody)
      }

      routeLog('input', input)
      const args = input ? [input, ...options] : options
      handlerLog('resourceMethod args: %o', args)
      const output = await resourceMethod.apply(resource, args)

      if ('success' in responder) {
        handlerLog('%s#%s.success', adapterPath, actionName)
        await responder.success.apply(adapter, [ctx, output, ...options])
      } else {
        handlerLog('%s#%s success as json', adapterPath, actionName)
        res.json({ status: 'success', data: output })
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        const validationError = err
        handlerLog.extend('debug')('%s#%s validationError %s', adapterPath, actionName, validationError.message)
        if (responder) {
          if ('invalid' in responder) {
            handlerLog('%s#%s.invalid', adapterPath, actionName)
            res.status(422)
            await responder.invalid!.apply(adapter, [ctx, validationError, source, ...options])
          } else {
            next(validationError)
          }
        } else {
          handlerLog('%s#%s invalid as json', adapterPath, actionName)
          res.status(422)
          res.json({
            status: 'error',
            errors: validationError.errors,
            message: validationError.message,
          })
        }
      } else {
        if ('fatal' in responder) {
          try {
            handlerLog('%s#%s.fatal', adapterPath, actionName)
            await responder.fatal!.apply(adapter, [ctx, err as Error, ...options])
          } catch (er) {
            next(er)
          }
        } else {
          return next(err)
        }
      }
    }
  }
}

const createNullOptions: CreateOptionsFunction = async (ctx, httpPath, ad) => {
  return []
}

export const importAndSetup = async (
  fileRoot: string,
  modulePath: string,
  support: ResourceSupport | ActionSupport,
  config: RouteConfig
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
    return await ret.default(support, config)
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

export function defaultServerRouterConfig(): ServerRouterConfig {
  return {
    actions: Actions.standard(),
    inputArranger: smartInputArranger,
    createOptions: createNullOptions,
    constructConfig: defaultConstructConfig(),
    adapterRoot: './endpoint',
    adapterFileName: 'adapter',
    resourceRoot: './endpoint',
    resourceFileName: 'resource',
  }
}

type HandlerBuildRunner = {
  (): Promise<void>
}

export abstract class BasicRouter implements Router {
  protected readonly serverRouterConfig: ServerRouterConfig

  constructor(
    readonly fileRoot: string,
    serverRouterConfig: Partial<ServerRouterConfig> = {},
    readonly httpPath: string = '/',
    protected readonly handlerBuildRunners: HandlerBuildRunner[] = []
  ) {
    this.serverRouterConfig = Object.assign(defaultServerRouterConfig(), serverRouterConfig)
  }

  abstract sub(...args: any[]): Router
  protected abstract createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner

  resources(rpath: string, config: RouteConfig): void {
    this.handlerBuildRunners.push(this.createHandlerBuildRunner(rpath, config))
  }

  async build() {
    console.log('build', this.handlerBuildRunners)
    for (const requestHandlerSources of this.handlerBuildRunners) {
      console.log('build rooping')
      await requestHandlerSources()
    }
  }

  protected getHttpPath(rpath: string) {
    return path.join(this.httpPath, rpath)
  }

  protected getResourcePath(rpath: string) {
    return path.join(
      this.serverRouterConfig.resourceRoot,
      this.getHttpPath(rpath),
      this.serverRouterConfig.resourceFileName
    )
  }

  protected getAdapterPath(rpath: string) {
    return path.join(
      this.serverRouterConfig.adapterRoot,
      this.getHttpPath(rpath),
      this.serverRouterConfig.adapterFileName
    )
  }
}

export class ServerRouter extends BasicRouter {
  readonly router: express.Router

  constructor(
    fileRoot: string,
    serverRouterConfig: Partial<ServerRouterConfig> = {},
    httpPath: string = '/',
    handlerBuildRunners: HandlerBuildRunner[] = []
  ) {
    super(fileRoot, serverRouterConfig, httpPath, handlerBuildRunners)
    this.router = express.Router({ mergeParams: true })
  }

  sub(...args: any[]) {
    const subRouter = new ServerRouter(
      this.fileRoot,
      this.serverRouterConfig,
      path.join(this.httpPath, args[0]),
      this.handlerBuildRunners
    )
    ;(this.router as any).use.apply(this.router, [...args, subRouter.router])
    return subRouter
  }

  protected createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner {
    return async () => {
      console.log('buildHandler', rpath, config)

      const resourcePath = this.getResourcePath(rpath)
      const resource = await importAndSetup(
        this.fileRoot,
        resourcePath,
        new ResourceSupport(this.fileRoot, this.serverRouterConfig),
        config
      )

      const adapterPath = this.getAdapterPath(rpath)
      const adapter: MultiOptionAdapter = await importAndSetup(
        this.fileRoot,
        adapterPath,
        new ActionSupport(this.fileRoot, this.serverRouterConfig),
        config
      )

      const actionDescriptors: readonly ActionDescriptor[] = config.actions || this.serverRouterConfig.actions

      for (const actionDescriptor of actionDescriptors) {
        const actionName = actionDescriptor.action

        const resourceMethod: Function | undefined = resource[actionName]
        const actionFunc: Handler | MultiOptionResponder | RequestCallback | undefined = adapter[actionName]
        const constructDescriptor: ConstructDescriptor | undefined = config.construct?.[actionName]

        const actionOverride = actionFunc instanceof Function
        if (!actionOverride) {
          if (resourceMethod === undefined) {
            throw new RouterError(
              `Logic not found! define ${resourcePath}#${actionName} or/and ${adapterPath}#${actionName}`
            )
          }
        }

        if (actionOverride && resourceMethod) {
          routeLog.extend('warn')(
            `${resourcePath}#${actionName} is defined but will not be called auto. Responder support auto call; proposal: 'Remove ${resourcePath}#${actionName}' or 'Change to Responder(not Function) ${adapterPath}/#${actionName}' or 'Remove ${adapterPath}/#${actionName}'`
          )
        }

        const defaultConstructDescriptor: ConstructDescriptor | undefined =
          this.serverRouterConfig.constructConfig[actionName]
        let schema: z.AnyZodObject | undefined
        if (resourceMethod) {
          if (constructDescriptor?.schema === undefined) {
            if (!defaultConstructDescriptor?.schema) {
              throw new Error(`construct.${actionName}.schema not found in routes for ${resourcePath}#${actionName}`)
            }
            schema = defaultConstructDescriptor.schema
          } else if (constructDescriptor.schema === null) {
            schema = blankSchema
          } else {
            schema = constructDescriptor.schema
          }
        }

        const defaultSources = defaultConstructDescriptor?.sources || ['params']

        let params
        const urlPath = path.join(rpath, actionDescriptor.path)
        handlerLog(
          '%s#%s ConstructActionDescriptor: %s',
          adapterPath,
          actionName,
          constructDescriptor?.schema?.constructor.name
        )
        if (actionOverride) {
          handlerLog('%s#%s without construct middleware', adapterPath, actionName)
          const handler: express.Handler = async (req, res, next) => {
            const ctx = new ActionContext(req, res)
            try {
              handlerLog('%s#%s as Handler', adapterPath, actionName)
              await actionFunc(ctx)
            } catch (err) {
              next(err)
            }
          }

          params = [handler]
        } else {
          handlerLog('%s#%s with construct middleware', adapterPath, actionName)
          if (!resourceMethod) {
            throw new Error('Unreachable: resourceMethod is undefined')
          }

          if (!schema) {
            throw new Error('Unreachable: schema is undefined')
          }

          const handler: express.Handler = createResourceMethodHandler({
            resourceMethod,
            resource,
            sources: constructDescriptor?.sources || defaultSources,
            serverRouterConfig: this.serverRouterConfig,
            httpPath: this.getHttpPath(rpath),
            schema,
            adapterPath,
            actionDescriptor,
            responder: actionFunc,
            adapter,
          })
          params = [handler]
        }

        routeLog(
          '%s %s\t%s\t{validate:%s, actionOverride:%s, resourceMethod:%s}',
          actionDescriptor.method,
          path.join(this.httpPath, urlPath),
          actionName,
          params.length !== 1,
          actionOverride,
          !!resourceMethod
        )
        ;(this.router as any)[actionDescriptor.method].apply(this.router, [urlPath, ...params])
      }
    }
  }
}

export class ResourceHolderCreateRouter extends BasicRouter {
  constructor(
    private resourcesHolder: any,
    fileRoot: string,
    routerOption: Partial<ServerRouterConfig> = {},
    httpPath: string = '/'
  ) {
    super(fileRoot, routerOption, httpPath)
  }

  sub(...args: any[]) {
    return new ResourceHolderCreateRouter(
      this.resourcesHolder,
      this.fileRoot,
      this.serverRouterConfig,
      path.join(this.httpPath, args[0])
    )
  }

  protected createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner {
    return async () => {
      const resourcePath = this.getResourcePath(rpath)
      const resourceSupport = new ResourceSupport(this.fileRoot, this.serverRouterConfig)
      const resource = await importAndSetup(this.fileRoot, resourcePath, resourceSupport, config)

      const resourceProxy: Record<string, Function> = {}
      for (let actionName in resource) {
        const resourceMethod = resource[actionName]
        const cad: ConstructDescriptor | undefined = config.construct?.[actionName]
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
}
