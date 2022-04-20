import { ResourceSupport, RouteConfig, defaultServerRouterConfig, ServerRouterConfig } from 'restrant2'
import * as re from './resource'
import { TaskCreateParams, TaskUpdateParams } from '../../params'
import { TaskStore } from '../../models/TaskStore'

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
  // eslint-disable-next-line @typescript-eslint/ban-types
): Record<string, Function> {
  const setup = re.default
  const support: ResourceSupport = {
    rootPath,
    serverRouterConfig,
  }
  const routeConfig: RouteConfig = { name }
  return setup(support, routeConfig)
}

beforeEach(() => {
  TaskStore.reset()
})

test('index', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.index).toBeInstanceOf(Function)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const output = resourceMethods.index()

  expect(output).toEqual([
    {
      id: 1,
      title: 'test1',
      description: 'test',
      done: false,
      subtasks: [1],
      phases: [
        { title: 'phase1', point: 10, subtasks: [1] },
        { title: 'phase2', point: 20, subtasks: [2] },
      ],
    },
    {
      id: 2,
      title: 'test2',
      description: 'test',
      done: false,
      subtasks: [],
      phases: [
        { title: 'phase1', point: 10, subtasks: [1] },
        { title: 'phase2', point: 20, subtasks: [2] },
      ],
    },
  ])
})

test('create', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.create).toBeInstanceOf(Function)

  const params: TaskCreateParams = {
    title: 'title1',
    description: 'description1',
    subtasks: [],
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const output = resourceMethods.create(params)

  expect(output).toEqual({
    title: 'title1',
    description: 'description1',
    done: false,
    id: 3,
    subtasks: [],
    phases: [
      { title: 'phase1', point: 10, subtasks: [1] },
      { title: 'phase2', point: 20, subtasks: [2] },
    ],
  })
})

test('update', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.update).toBeInstanceOf(Function)

  const params: TaskUpdateParams = {
    title: 'test2-edit',
    description: 'test-edit',
    id: 2,
    subtasks: [2],
    phases: [
      {
        title: 'test',
        point: 10,
        subtasks: [1],
      },
    ],
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const output = resourceMethods.update(params)

  expect(output).toEqual({
    title: 'test2-edit',
    description: 'test-edit',
    done: false,
    id: 2,
    subtasks: [2],
    phases: [
      {
        title: 'test',
        point: 10,
        subtasks: [1],
      },
    ],
  })
})

test('destroy', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.destroy).toBeInstanceOf(Function)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const output = resourceMethods.destroy({
    id: 2,
  })

  expect(output).toEqual({
    title: 'test2',
    description: 'test',
    done: false,
    id: 2,
    subtasks: [],
    phases: [
      { title: 'phase1', point: 10, subtasks: [1] },
      { title: 'phase2', point: 20, subtasks: [2] },
    ],
  })

  expect(resourceMethods.index()).toEqual([
    {
      id: 1,
      title: 'test1',
      description: 'test',
      done: false,
      subtasks: [1],
      phases: [
        { title: 'phase1', point: 10, subtasks: [1] },
        { title: 'phase2', point: 20, subtasks: [2] },
      ],
    },
  ])
})

test('done', () => {
  const resourceMethods = callSetup()
  expect(resourceMethods.done).toBeInstanceOf(Function)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const output = resourceMethods.done({
    id: 2,
  })

  expect(output).toEqual({
    title: 'test2',
    description: 'test',
    done: true,
    id: 2,
    subtasks: [],
    phases: [
      { title: 'phase1', point: 10, subtasks: [1] },
      { title: 'phase2', point: 20, subtasks: [2] },
    ],
  })

  expect(resourceMethods.index()).toEqual([
    {
      id: 1,
      title: 'test1',
      description: 'test',
      done: false,
      subtasks: [1],
      phases: [
        { title: 'phase1', point: 10, subtasks: [1] },
        { title: 'phase2', point: 20, subtasks: [2] },
      ],
    },
    {
      id: 2,
      title: 'test2',
      description: 'test',
      done: true,
      subtasks: [],
      phases: [
        { title: 'phase1', point: 10, subtasks: [1] },
        { title: 'phase2', point: 20, subtasks: [2] },
      ],
    },
  ])
})
