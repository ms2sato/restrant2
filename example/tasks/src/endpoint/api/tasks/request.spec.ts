import request from 'supertest'
import { Application } from 'express'
import { setup } from '../../../web'
import { TaskModel } from '../../../models/task-model'

let app: Application
beforeAll(async () => {
  app = await setup()
  TaskModel.reset()
})

test('GET /', async () => {
  const response = await request(app).get('/api/tasks')

  expect(response.statusCode).toBe(200)
  expect(response.body).toEqual({
    status: 'success',
    data: [
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
    ],
  })
})

test('POST /', async () => {
  {
    const response = await request(app).post('/api/tasks/').send({
      title: 'title1',
      description: 'description1',
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      status: 'success',
      data: {
        title: 'title1',
        description: 'description1',
        id: 3,
        done: false,
        subtasks: [],
        phases: [
          { title: 'phase1', point: 10, subtasks: [1] },
          { title: 'phase2', point: 20, subtasks: [2] },
        ],
      },
    })
  }
})

test('PATCH /:id', async () => {
  {
    const response = await request(app).patch('/api/tasks/1').send({
      title: 'title1-edit',
      description: 'description1-edit',
      'phases[0].title': 'phase1',
      'phases[0].point': '10',
      'phases[0].subtasks[]': '1',
      'phases[1].title': 'phase2',
      'phases[1].point': '20',
      'phases[1].subtasks[]': '2',
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      status: 'success',
      data: {
        title: 'title1-edit',
        description: 'description1-edit',
        id: 1,
        done: false,
        subtasks: [],
        phases: [
          { title: 'phase1', point: 10, subtasks: [1] },
          { title: 'phase2', point: 20, subtasks: [2] },
        ],
      },
    })
  }
})

test('DELETE /:id', async () => {
  {
    const response = await request(app).delete('/api/tasks/1').send({
      id: 1,
    })
    expect(response.statusCode).toBe(200)
  }
})
