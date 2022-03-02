import { defineResource } from 'restrant2'

export type User = {
  id: number
  name: string
}

export default defineResource((support, options) => {
  const users: Map<number, User> = new Map([
    [1, { id: 1, name: 'test1' }],
    [2, { id: 2, name: 'test2' }],
  ])

  let lastId = 2

  return {
    index: () => {
      console.log(users)
      return Array.from(users, ([id, data]) => data)
    },
  }
})
