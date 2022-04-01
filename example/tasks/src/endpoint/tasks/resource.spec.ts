import { ResourceSupport, RouteConfig, defaultServerRouterConfig, ServerRouterConfig } from 'restrant2'
import * as re from './resource'
import { TaskCreateParams, TaskUpdateParams } from '../../params'

type CallSetupParams = {
  rootPath: string
  serverRouterConfig: ServerRouterConfig
  name: string
}

function callSetup(
  { rootPath, serverRouterConfig, name }: CallSetupParams = {
    rootPath: './',
    serverRouterConfig: defaultServerRouterConfig(),
    name: `${Math.random()}`,
  }
): Record<string, Function> {
  const setup = re.default
  const support: ResourceSupport = {
    rootPath,
    serverRouterConfig,
  }
  const routeConfig: RouteConfig = { name }
  return setup(support, routeConfig)
}

test('index', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.index).toBeInstanceOf(Function)

  const output = resourceMethods.index()

  expect(output).toEqual([
    { id: 1, title: 'test1', description: 'test', done: false },
    { id: 2, title: 'test2', description: 'test', done: false },
  ])
})

test('create', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.create).toBeInstanceOf(Function)

  const params: TaskCreateParams = {
    title: 'title1',
    description: 'description1',
  }
  const output = resourceMethods.create(params)

  expect(output).toEqual({
    title: 'title1',
    description: 'description1',
    done: false,
    id: 3,
  })
})

test('update', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.update).toBeInstanceOf(Function)

  const params: TaskUpdateParams = {
    title: 'test2-edit',
    description: 'test-edit',
    id: 2,
  }
  const output = resourceMethods.update(params)

  expect(output).toEqual({
    title: 'test2-edit',
    description: 'test-edit',
    done: false,
    id: 2,
  })
})

test('destroy', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.destroy).toBeInstanceOf(Function)

  const output = resourceMethods.destroy({
    id: 2,
  })

  expect(output).toEqual({
    title: 'test2',
    description: 'test',
    done: false,
    id: 2,
  })

  expect(resourceMethods.index()).toEqual([{ id: 1, title: 'test1', description: 'test', done: false }])
})

test('done', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.done).toBeInstanceOf(Function)

  const output = resourceMethods.done({
    id: 2,
  })

  expect(output).toEqual({
    title: 'test2',
    description: 'test',
    done: true,
    id: 2,
  })

  expect(resourceMethods.index()).toEqual([
    { id: 1, title: 'test1', description: 'test', done: false },
    { id: 2, title: 'test2', description: 'test', done: true },
  ])
})
