import { z } from 'zod'
import { fill } from './zod-default-filler'

const itemSchema = z.object({
  type: z.string().default('test'),
  number: z.number(),
  numbersHasDefault: z.array(z.number()).default([]),
})

const userSchema = z.object({
  name: z.string(),
  age: z.number().default(20),
  createdAt: z.date(),
  numbers: z.array(z.number()),
  hobbies: z.array(z.string()),
  item: itemSchema,
  items: z.array(itemSchema),
  numbersHasDefault: z.array(z.number()).default([]),
})

test('simple', () => {
  expect(fill({}, userSchema)).toEqual({ age: 20, numbersHasDefault: [] })
})

test('not overwite', () => {
  expect(fill({ age: 10, numbersHasDefault: [1] }, userSchema)).toEqual({ age: 10, numbersHasDefault: [1] })
})

test('nested object', () => {
  expect(fill({ item: {} }, userSchema)).toEqual({
    age: 20,
    numbersHasDefault: [],
    item: { type: 'test', numbersHasDefault: [] },
  })
})

test('nested array', () => {
  expect(fill({ items: [{}] }, userSchema)).toEqual({
    age: 20,
    numbersHasDefault: [],
    items: [{ type: 'test', numbersHasDefault: [] }],
  })
})
