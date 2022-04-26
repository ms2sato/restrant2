import express from 'express'
import path from 'path'
import { z } from 'zod'
import debug from 'debug'
import {
  ActionContext,
  ActionContextImpl,
  ActionDescriptor,
  Actions,
  ActionSupport,
  ConstructConfig,
  ConstructDescriptor,
  CreateActionOptionsFunction,
  Handler,
  MultiOptionAdapter,
  MultiOptionResponder,
  ResourceSupport,
  RouteConfig,
  Router,
  RouterError,
  ServerRouterConfig,
  RequestCallback,
  parseFormBody,
  createZodTraverseArrangerCreator,
  fillDefault,
  deepCast,
  ValidationError,
  Responder,
  ResourceMethodHandlerParams,
  RouterCore,
  HandlerBuildRunner,
  Renderer,
} from '../index'
import { MutableActionContext } from './router'

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

export function arrangeFormInput(ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) {
  return parseFormBody(ctx.mergeInputs(sources), createZodTraverseArrangerCreator(schema))
}

export function arrangeJsonInput(ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) {
  const pred = (input: any, source: string) => {
    return source === 'body' ? input : deepCast(schema, input)
  }
  return ctx.mergeInputs(sources, pred)
}

export type ContentArranger = {
  (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject): any
}

type ContentType2Arranger = Record<string, ContentArranger>

export const defaultContentType2Arranger: ContentType2Arranger = {
  'application/json': arrangeJsonInput,
  'application/x-www-form-urlencoded': arrangeFormInput,
  'multipart/form-data': arrangeFormInput,
  '': arrangeFormInput,
}

export const createSmartInputArranger = (contentType2Arranger: ContentType2Arranger = defaultContentType2Arranger) => {
  return (ctx: MutableActionContext, sources: readonly string[], schema: z.AnyZodObject) => {
    const requestedContentType = ctx.req.headers['content-type']
    if (requestedContentType) {
      for (const [contentType, contentArranger] of Object.entries<ContentArranger>(contentType2Arranger)) {
        if (contentType === '') continue
        if (requestedContentType.indexOf(contentType) >= 0) {
          return contentArranger(ctx, sources, schema)
        }
      }
    }
    return contentType2Arranger[''](ctx, sources, schema) // TODO: overwritable
  }
}

// FIXME: @see https://google.github.io/styleguide/jsoncstyleguide.xml
class StandardJsonResponder<Opt = undefined, Out = any, Src = any> implements Responder<Opt, Out, Src> {
  success(ctx: ActionContext, output: Out): void | Promise<void> {
    ctx.res.json({ status: 'success', data: output })
  }

  invalid(ctx: ActionContext, validationError: ValidationError, source: Src): void | Promise<void> {
    ctx.res.status(422)
    ctx.res.json({
      status: 'error',
      errors: validationError.errors,
      message: validationError.message,
    })
  }

  fatal(ctx: ActionContext, err: Error): void | Promise<void> {
    // FIXME: dispatch Error class
    ctx.res.status(500)

    if (process.env.NODE_ENV === 'production') {
      ctx.res.json({
        status: 'fatal',
      })
    } else {
      throw err
    }
  }
}

type FatalHandler = (ctx: ActionContext, err: Error) => void

class SmartResponder<Opt = undefined, Out = any, Src = any> implements Responder<Opt, Out, Src> {
  constructor(
    private routerCore: RouterCore,
    private fatalHandler: FatalHandler,
    private jsonResonder = new StandardJsonResponder()
  ) {}

  success(ctx: ActionContext, output: Out): void | Promise<void> {
    const contentType = ctx.req.headers['content-type']
    if (ctx.format === 'json' || (contentType && contentType.indexOf('application/json') >= 0)) {
      return this.jsonResonder.success(ctx, output)
    }

    const renderer: Renderer = this.routerCore.page2Renderer[ctx.httpFilePath]
    if (renderer !== undefined) {
      return renderer(ctx, output)
    }

    return this.jsonResonder.success(ctx, output)
  }

  invalid(ctx: ActionContext, validationError: ValidationError, source: Src): void | Promise<void> {
    return this.jsonResonder.invalid(ctx, validationError, source)
  }

  fatal(ctx: ActionContext, err: Error): void | Promise<void> {
    console.error('fatal', err)
    const contentType = ctx.req.headers['content-type']
    if (ctx.format === 'json' || (contentType && contentType.indexOf('application/json') >= 0)) {
      return this.jsonResonder.fatal(ctx, err)
    }

    this.fatalHandler(ctx, err)
  }
}

const createSmartResponder = ({ routerCore }: ResourceMethodHandlerParams) => {
  return new SmartResponder(
    routerCore,
    () => {
      throw new Error('Unimplemented Fatal Handler')
    },
    new StandardJsonResponder()
  )
}

const createResourceMethodHandler = (params: ResourceMethodHandlerParams): express.Handler => {
  const {
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
  } = params

  const defaultResponder = serverRouterConfig.createDefaultResponder(params)
  const actionName = actionDescriptor.action

  return async (req, res, next) => {
    try {
      const ctx = new ActionContextImpl(req, res, actionDescriptor, httpPath)
      const options = await serverRouterConfig.createActionOptions(ctx, httpPath, actionDescriptor)

      const handleFatal = async (err: Error) => {
        if (responder && 'fatal' in responder) {
          try {
            handlerLog('%s#%s.fatal', adapterPath, actionName)
            await responder.fatal!.apply(adapter, [ctx, err as Error, ...options])
          } catch (er) {
            console.log('Unexpected Error on responder.fatal, dispatch to default responder', er)
            defaultResponder.fatal(ctx, err)
          }
        } else {
          return next(err)
        }
      }

      try {
        let source = serverRouterConfig.inputArranger(ctx, sources, schema)
        handlerLog('source: %o', source)

        try {
          if (responder && 'beforeValidation' in responder) {
            source = await responder.beforeValidation!(ctx, source, schema)
          }

          let input = schema.parse(source)
          if (responder && 'afterValidation' in responder) {
            input = await responder.afterValidation!(ctx, input, schema)
          }

          routeLog('input', input)
          const args = input ? [input, ...options] : options
          handlerLog('resourceMethod args: %o', args)
          const output = await resourceMethod.apply(resource, args)

          if (responder && 'success' in responder) {
            handlerLog('%s#%s.success', adapterPath, actionName)
            const ret = await responder.success!.apply(adapter, [ctx, output, ...options])
            if (ret === false) {
              handlerLog(' dispatch to default responder', adapterPath, actionName)
              defaultResponder.success(ctx, output)
            } else if (ret !== undefined) {
              handlerLog(' dispatch to default responder for ret value', adapterPath, actionName)
              defaultResponder.success(ctx, ret)
            }
          } else {
            handlerLog('%s#%s success by default responder', adapterPath, actionName)
            defaultResponder.success(ctx, output)
          }
        } catch (err) {
          if (err instanceof z.ZodError) {
            const validationError = err
            handlerLog.extend('debug')('%s#%s validationError %s', adapterPath, actionName, validationError.message)
            if (responder) {
              if ('invalid' in responder) {
                const filledSource = fillDefault(schema, source)
                handlerLog('%s#%s.invalid', adapterPath, actionName, filledSource)
                res.status(422)
                await responder.invalid!.apply(adapter, [ctx, validationError, filledSource, ...options])
              } else {
                next(validationError)
              }
            } else {
              handlerLog('%s#%s invalid by default responder', adapterPath, actionName)
              defaultResponder.invalid(ctx, validationError, source)
            }
          } else {
            handleFatal(err as Error)
          }
        }
      } catch (err) {
        return handleFatal(err as Error)
      }
    } catch (err) {
      next(err)
    }
  }
}

const createNullActionOptions: CreateActionOptionsFunction = async (ctx, httpPath, ad) => {
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
    inputArranger: createSmartInputArranger(),
    createActionOptions: createNullActionOptions,
    constructConfig: defaultConstructConfig(),
    createDefaultResponder: createSmartResponder,
    adapterRoot: './endpoint',
    adapterFileName: 'adapter',
    resourceRoot: './endpoint',
    resourceFileName: 'resource',
  }
}

export abstract class BasicRouter implements Router {
  protected readonly serverRouterConfig: ServerRouterConfig

  constructor(
    readonly fileRoot: string,
    serverRouterConfig: Partial<ServerRouterConfig> = {},
    readonly httpPath: string = '/',
    protected readonly routerCore: RouterCore = { handlerBuildRunners: [], page2Renderer: {} }
  ) {
    this.serverRouterConfig = Object.assign(defaultServerRouterConfig(), serverRouterConfig)
  }

  abstract sub(...args: any[]): Router
  protected abstract createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner

  resources(rpath: string, config: RouteConfig): void {
    this.routerCore.handlerBuildRunners.push(this.createHandlerBuildRunner(rpath, config))
  }

  async build() {
    for (const requestHandlerSources of this.routerCore.handlerBuildRunners) {
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
    readonly routerCore: RouterCore = { handlerBuildRunners: [], page2Renderer: {} }
  ) {
    super(fileRoot, serverRouterConfig, httpPath, routerCore)
    this.router = express.Router({ mergeParams: true })
  }

  sub(...args: any[]) {
    // TODO: impl class SubServerRouter without build
    const subRouter = new ServerRouter(
      this.fileRoot,
      this.serverRouterConfig,
      path.join(this.httpPath, args[0]),
      this.routerCore
    )
    ;(this.router as any).use.apply(this.router, [...args, subRouter.router])
    return subRouter
  }

  protected createHandlerBuildRunner(rpath: string, config: RouteConfig): HandlerBuildRunner {
    const choiceSchema = (
      constructDescriptor: ConstructDescriptor | undefined,
      defaultConstructDescriptor: ConstructDescriptor,
      actionName: string,
      resourcePath: string
    ) => {
      if (constructDescriptor?.schema === undefined) {
        if (!defaultConstructDescriptor?.schema) {
          throw new Error(`construct.${actionName}.schema not found in routes for ${resourcePath}#${actionName}`)
        }
        return defaultConstructDescriptor.schema
      } else if (constructDescriptor.schema === null) {
        return blankSchema
      } else {
        return constructDescriptor.schema
      }
    }

    return async () => {
      handlerLog('buildHandler: %s', path.join(this.httpPath, rpath))

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
        const httpPath = this.getHttpPath(rpath)

        // TODO: Pluggable
        if (actionDescriptor.page === true) {
          const pagePath = path.join(httpPath, actionName)
          this.routerCore.page2Renderer[pagePath] = (ctx: ActionContext, options) => {
            // path fix for pug
            ctx.render(pagePath.replace(/^\//, ''), options)
          }
        }

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
        const schema: z.AnyZodObject | undefined = resourceMethod
          ? choiceSchema(constructDescriptor, defaultConstructDescriptor, actionName, resourcePath)
          : undefined

        const defaultSources = defaultConstructDescriptor?.sources || ['params']

        let params
        if (actionOverride) {
          handlerLog('%s#%s without construct middleware', adapterPath, actionName)
          const handler: express.Handler = async (req, res, next) => {
            const ctx = new ActionContextImpl(req, res, actionDescriptor, httpPath)
            try {
              handlerLog('%s#%s as Handler', adapterPath, actionName)
              await actionFunc(ctx)
            } catch (err) {
              next(err)
            }
          }

          params = [handler]
        } else {
          if (!resourceMethod) {
            throw new Error('Unreachable: resourceMethod is undefined')
          }

          if (!schema) {
            throw new Error('Unreachable: schema is undefined')
          }

          const sources = constructDescriptor?.sources || defaultSources
          handlerLog(
            '%s#%s  with construct middleware; schema: %s, sources: %o',
            adapterPath,
            actionName,
            schema.constructor.name,
            sources
          )

          const handler: express.Handler = createResourceMethodHandler({
            resourceMethod,
            resource,
            sources,
            serverRouterConfig: this.serverRouterConfig,
            routerCore: this.routerCore,
            httpPath: this.getHttpPath(rpath),
            schema,
            adapterPath,
            actionDescriptor,
            responder: actionFunc,
            adapter,
          })
          params = [handler]
        }

        const urlPath = path.join(rpath, actionDescriptor.path)
        routeLog(
          '%s %s\t%s\t{actionOverride:%s, resourceMethod:%s}',
          actionDescriptor.method instanceof Array ? actionDescriptor.method.join(',') : actionDescriptor.method,
          path.join(this.httpPath, urlPath),
          actionName,
          actionOverride,
          !!resourceMethod
        )

        const urlPathWithExt = `${urlPath.replace(/\/$/, '')}.:format?`
        if (actionDescriptor.method instanceof Array) {
          for (const method of actionDescriptor.method) {
            ;(this.router as any)[method].apply(this.router, [urlPathWithExt, ...params])
          }
        } else {
          ;(this.router as any)[actionDescriptor.method].apply(this.router, [urlPathWithExt, ...params])
        }
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
