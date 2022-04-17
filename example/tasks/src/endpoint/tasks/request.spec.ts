import request from 'supertest'
import { Application } from 'express'
import { setup } from '../../web'
import { TaskModel } from '../../models/task-model'

type ResponseHeaders = {
  location: string
}

let app: Application
beforeAll(async () => {
  app = await setup()
  TaskModel.reset()
})

test('GET /', async () => {
  const response = await request(app).get('/tasks')

  expect(response.statusCode).toBe(200)
  expect(response.text).toContain('test1')
  expect(response.text).toContain('test2')
})

test('GET /build', async () => {
  const response = await request(app).get('/tasks/build')

  expect(response.statusCode).toBe(200)
  expect(response.text).toContain('Create Task')
  expect(response.text).toContain('<form')
})

test('GET /:id/edit', async () => {
  const response = await request(app).get('/tasks/1/edit')

  expect(response.statusCode).toBe(200)
  expect(response.text).toContain('Update Task')
  expect(response.text).toContain('<form')
})

test('POST /', async () => {
  {
    const response = await request(app).post('/tasks/').send({
      title: 'title1',
      description: 'description1',
    })
    expect(response.statusCode).toBe(302)
    expect((response.headers as ResponseHeaders).location).toBe('/tasks')
  }

  {
    const response = await request(app).get('/tasks')
    expect(response.text).toContain('title1')
    expect(response.text).toContain('description1')
  }
})

test('PATCH /:id', async () => {
  {
    const response = await request(app)
      .patch('/tasks/1')
      .send({
        title: 'title1-edit',
        description: 'description1-edit',
        'subtasks[]': [],
        'phases[0].title': 'phase1',
        'phases[0].point': '10',
        'phases[0].subtasks[]': ['1'],
        'phases[1].title': 'phase2',
        'phases[1].point': '20',
        'phases[1].subtasks[]': ['2'],
      })
    expect(response.statusCode).toBe(302)
    expect((response.headers as ResponseHeaders).location).toBe('/tasks')
  }

  {
    const response = await request(app).get('/tasks')
    expect(response.text).toContain('title1')
    expect(response.text).toContain('description1')
  }
})

test('DELETE /:id', async () => {
  {
    const response = await request(app).delete('/tasks/1').send()
    expect(response.statusCode).toBe(302)
    expect((response.headers as ResponseHeaders).location).toBe('/tasks')
  }

  {
    const response = await request(app).get('/tasks')
    expect(response.text).not.toContain('test1')
  }
})

test('POST /:id/done', async () => {
  {
    // before: Not have closed tasks
    const response = await request(app).get('/tasks')
    expect(response.text).not.toContain('closed')
  }

  {
    const response = await request(app).post('/tasks/2/done').send()
    expect(response.statusCode).toBe(302)
    expect((response.headers as ResponseHeaders).location).toBe('/tasks')
  }

  {
    // after: have closed task
    const response = await request(app).get('/tasks')
    expect(response.text).toContain('closed')
  }
})
