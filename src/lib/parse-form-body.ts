import { ArrangeResult, nullArrangeResult } from './shared/zod-util'

export type TraverseArranger = {
  next: (path: string, node: Record<string, any>, value: any, pathIndex: number) => void
  nextItem: (name: string, node: Record<string, any>, value: any, pathIndex: number) => void
  arrangeIndexedArrayItemOnLast: (
    name: string,
    node: Record<string, any>,
    value: any,
    pathIndex: number
  ) => ArrangeResult
  arrangeUnindexedArrayOnLast: (
    name: string,
    node: Record<string, any>,
    value: any[],
    pathIndex: number
  ) => ArrangeResult
  arrangePropertyOnLast: (path: string, node: Record<string, any>, value: any, pathIndex: number) => ArrangeResult
}

export type TraverseArrangerCreator = {
  (): TraverseArranger
}

export function nullTraverseArranger() {
  return {
    next() {},
    nextItem() {},
    arrangeIndexedArrayItemOnLast() {
      return nullArrangeResult
    },
    arrangeUnindexedArrayOnLast() {
      return nullArrangeResult
    },
    arrangePropertyOnLast() {
      return nullArrangeResult
    },
  }
}

function arrangedResultOrRaw({ arranged, result }: ArrangeResult, value: any) {
  return arranged ? result : value
}

function createTraverser(arranger: TraverseArranger, key: string) {
  function traversePath(paths: string[], node: Record<string, any>, value: any, pathIndex: number = 0) {
    if (paths.length === 0) return

    const path = paths.shift()!

    const arrayFirst = path.indexOf('[')
    const arrayLast = path.indexOf(']')

    if (arrayFirst !== -1) {
      if (arrayFirst === 0) {
        throw new Error(`'[' must not be first character in path: ${path}`)
      }

      if (arrayLast === -1) {
        throw new Error(`'[' and ']' must be provide in pairs : ${path}`)
      }

      if (arrayLast !== path.length - 1) {
        throw new Error(`']' must be last character in path: ${path}`)
      }

      const name = path.substring(0, arrayFirst)
      const indexStr = path.substring(arrayFirst + 1, arrayLast)

      if (indexStr.length !== 0) {
        // format: name[index]

        const index = Number(indexStr)
        if (isNaN(index)) {
          throw new Error(`index must be number : ${path}`)
        }

        if (node[name] === undefined) {
          node[name] = []
        }

        if (paths.length === pathIndex) {
          arranger.next(name, node, value, pathIndex)
          node[name][index] = arrangedResultOrRaw(
            arranger.arrangeIndexedArrayItemOnLast(name, node, value, pathIndex),
            value
          )
        } else {
          if (node[name][index] === undefined) {
            node[name][index] = {}
          }
          arranger.nextItem(name, node, value, pathIndex)
          traversePath(paths, node[name][index], value, pathIndex++)
        }
      } else {
        // format: name[]

        arranger.next(name, node, value, pathIndex)
        if (paths.length === pathIndex) {
          const array = value === undefined ? [] : value instanceof Array ? value : [value]
          node[name] = arrangedResultOrRaw(arranger.arrangeUnindexedArrayOnLast(name, node, array, pathIndex), array)
        } else {
          throw new Error('Unimplemented')
        }
      }

      return
    } else if (arrayLast !== -1) {
      throw new Error(`'[' and ']' must be provide in pairs : ${path}`)
    }

    arranger.next(path, node, value, pathIndex)
    if (node[path] === undefined) {
      node[path] = {}
    }
    if (paths.length === pathIndex) {
      if (value instanceof Array) {
        throw new Error(`Unexpected array input for single property name[${key}]: proposal '${path}[]'?`)
      }

      node[path] = arrangedResultOrRaw(arranger.arrangePropertyOnLast(path, node, value, pathIndex), value)
    } else {
      traversePath(paths, node[path], value, pathIndex++)
    }
  }

  return traversePath
}

export function parseFormBody(
  body: Record<string, any>,
  arrangerCreator: TraverseArrangerCreator = nullTraverseArranger
): any {
  const ret: Record<string, any> = {}
  for (const [key, value] of Object.entries(body)) {
    createTraverser(arrangerCreator(), key)(key.split('.'), ret, value)
  }
  return ret
}
