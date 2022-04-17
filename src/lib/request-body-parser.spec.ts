import { parse } from './request-body-parser'

describe('simple', () => {
  test('value', () => {
    expect(parse({ name: 'MyName', age: 20 })).toEqual({ name: 'MyName', age: 20 })
  })

  test('array', () => {
    expect(parse({ 'hobbies[]': ['guitar', 'piano'] })).toEqual({ hobbies: ['guitar', 'piano'] })
  })
})

describe('nested', () => {
  test('value', () => {
    expect(parse({ 'user.name': 'MyName', 'user.age': 20 })).toEqual({ user: { name: 'MyName', age: 20 } })
  })

  test('array', () => {
    expect(parse({ 'user.hobbies[]': ['guitar', 'piano'] })).toEqual({ user: { hobbies: ['guitar', 'piano'] } })
  })

  test('deep', () => {
    expect(parse({ 'group.user.name': 'MyName', 'group.user.hobbies[]': ['guitar', 'piano'] })).toEqual({
      group: { user: { name: 'MyName', hobbies: ['guitar', 'piano'] } },
    })
  })

  test('multiple root', () => {
    expect(parse({ 'member.user.name': 'MyName', 'group.user.hobbies[]': ['guitar', 'piano'] })).toEqual({
      member: { user: { name: 'MyName' } },
      group: { user: { hobbies: ['guitar', 'piano'] } },
    })
  })
})

describe('array node', () => {
  test('array straight', () => {
    expect(parse({ 'user.hobbies[0]': 'guitar', 'user.hobbies[1]': 'piano' })).toEqual({
      user: { hobbies: ['guitar', 'piano'] },
    })
  })

  test('array missing teeth', () => {
    expect(parse({ 'user.hobbies[1]': 'guitar', 'user.hobbies[5]': 'piano' })).toEqual({
      user: { hobbies: [undefined, 'guitar', undefined, undefined, undefined, 'piano'] },
    })
  })

  test('array blanks', () => {
    expect(parse({ 'user.hobbies[]': ['guitar', 'piano'] })).toEqual({
      user: { hobbies: ['guitar', 'piano'] },
    })
  })

  test('array blanks to empty array', () => {
    expect(parse({ 'user.hobbies[]': [] })).toEqual({
      user: { hobbies: [] },
    })
  })

  test('array blanks to undefined', () => {
    expect(parse({ 'user.hobbies[]': undefined })).toEqual({
      user: { hobbies: [] },
    })
  })

  test('array blanks to empty string', () => {
    expect(parse({ 'user.hobbies[]': '' })).toEqual({
      user: { hobbies: [''] },
    })
  })

  test('array blank but one value', () => {
    expect(parse({ 'user.hobbies[]': 'guitar' })).toEqual({
      user: { hobbies: ['guitar'] },
    })
  })

  test('array must have "[]"', () => {
    expect(() => parse({ 'user.hobbies': ['guitar', 'piano'] })).toThrow(Error) // TODO: ParseError
  })

  test('array blanks deep path', () => {
    // TODO: Unimplemented
    expect(() => parse({ 'user.hobbies[].name': ['guitar', 'piano'] })).toThrow(Error)
  })

  test('array deep path', () => {
    expect(
      parse({
        'user.hobbies[0].name': 'guitar',
        'user.hobbies[0].type': 'stringed',
        'user.hobbies[1].name': 'piano',
        'user.hobbies[1].type': 'keyboard',
      })
    ).toEqual({
      user: {
        hobbies: [
          { name: 'guitar', type: 'stringed' },
          { name: 'piano', type: 'keyboard' },
        ],
      },
    })
  })

  // half of node has index
  // error cases
})
