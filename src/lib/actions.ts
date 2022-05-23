import { ActionDescriptor, RouterError } from '../client'

export type ActionName = 'build' | 'edit' | 'show' | 'index' | 'create' | 'update' | 'destroy'

const build: ActionDescriptor = {
  action: 'build',
  path: '/build',
  method: 'get',
  page: true,
} as const
const edit: ActionDescriptor = {
  action: 'edit',
  path: '/:id/edit',
  method: 'get',
  page: true,
} as const
const show: ActionDescriptor = {
  action: 'show',
  path: '/:id',
  method: 'get',
  page: true,
} as const
const index: ActionDescriptor = {
  action: 'index',
  path: '/',
  method: 'get',
  page: true,
} as const
const create: ActionDescriptor = {
  action: 'create',
  path: '/',
  method: 'post',
} as const
const update: ActionDescriptor = {
  action: 'update',
  path: '/:id',
  method: ['put', 'patch'],
} as const
const destroy: ActionDescriptor = {
  action: 'destroy',
  path: '/:id',
  method: 'delete',
} as const

const apiShow: ActionDescriptor = {
  action: 'show',
  path: '/:id',
  method: 'get',
} as const
const apiIndex: ActionDescriptor = {
  action: 'index',
  path: '/',
  method: 'get',
} as const

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
  const actions = [build, edit, show, index, create, update, destroy]
  return applyOption(actions, option)
}

export function api(option?: Option): readonly ActionDescriptor[] {
  const actions = [apiShow, apiIndex, create, update, destroy]
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

export function only(actions: readonly ActionName[], sources: readonly ActionDescriptor[]): ActionDescriptor[] {
  return sources.filter((ad) => actions.includes(ad.action as ActionName))
}

export function except(actions: readonly ActionName[], sources: readonly ActionDescriptor[]): ActionDescriptor[] {
  return sources.filter((ad) => !actions.includes(ad.action as ActionName))
}
