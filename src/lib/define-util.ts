import {
  ActionSupport,
  MultiOptionAdapter,
  RequestCallback,
  Resource,
  ResourceFunc,
  ResourceSupport,
  Responder,
  RouteConfig,
} from '..'

export function defineResource<R extends Resource>(callback: (support: ResourceSupport, config: RouteConfig) => R) {
  return callback
}

export function defineMultiOptionAdapter(
  callback: (support: ActionSupport, config: RouteConfig) => MultiOptionAdapter
) {
  return callback
}

export function defineAdapter<AR>(callback: (support: ActionSupport, config: RouteConfig) => AR) {
  return callback
}

export type AdapterOf<R extends ResourceFunc, Opt = undefined> = {
  [key in keyof ReturnType<R>]:
    | Responder<Opt, Awaited<ReturnType<ReturnType<R>[key]>>, Partial<Parameters<ReturnType<R>[key]>[0]>>
    | RequestCallback<Parameters<ReturnType<R>[key]>[0]>
}
