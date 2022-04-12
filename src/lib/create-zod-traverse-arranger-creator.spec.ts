import { parse } from './request-body-parser'
import { createZodTraverseArrangerCreator } from './create-zod-traverse-arranger-creator'
import { z } from 'zod'

const itemSchema = z.object({
  type: z.string(),
  number: z.number(),
})

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  createdAt: z.date(),
  numbers: z.array(z.number()),
  hobbies: z.array(z.string()),
  items: z.array(itemSchema),
})

export type User = z.infer<typeof userSchema>

const arrangerCreator = createZodTraverseArrangerCreator(userSchema)

describe('zod', () => {
  test('value number', () => {
    expect(parse({ name: 'MyName', age: '20' }, arrangerCreator)).toEqual({ name: 'MyName', age: 20 })
  })
  test('value date', () => {
    expect(parse({ name: 'MyName', createdAt: '2022/4/13 10:10:10' }, arrangerCreator)).toEqual({
      name: 'MyName',
      createdAt: new Date(2022, 3, 13, 10, 10, 10),
    })
  })
  test('value string[]', () => {
    expect(parse({ name: 'MyName', hobbies: ['guitar', 'piano'] }, arrangerCreator)).toEqual({
      name: 'MyName',
      hobbies: ['guitar', 'piano'],
    })
  })
  test('value number[]', () => {
    expect(parse({ name: 'MyName', numbers: ['12', '23'] }, arrangerCreator)).toEqual({
      name: 'MyName',
      numbers: [12, 23],
    })
  })
  test('value number[index]', () => {
    expect(parse({ name: 'MyName', 'numbers[0]': '12', 'numbers[1]': '23' }, arrangerCreator)).toEqual({
      name: 'MyName',
      numbers: [12, 23],
    })
  })
  test('value items[index].number', () => {
    expect(parse({ name: 'MyName', 'items[0].number': '12', 'items[1].number': '23' }, arrangerCreator)).toEqual({
      name: 'MyName',
      items: [
        {
          number: 12,
        },
        {
          number: 23,
        },
      ],
    })
  })
})
