function parsePath(paths:string[], node: Record<string, any>, value: any, pathIndex: number = 0) {
  const path = paths.shift()
  if(path === undefined) return
  
  const valueLength = value instanceof Array ? value.length : 0

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
        node[name][index] = value
      } else {
        if (node[name][index] === undefined) {
          node[name][index] = {}
        }
        parsePath(paths, node[name][index], value, pathIndex++)
      }
    } else {
      // format: name[]

      if (paths.length === pathIndex) {
        node[name] = valueLength === 0 ? [value] : value
      } else {
        const obj = {}
        if (node[name] === undefined) {
          node[name] = [obj]
        } else {
          node[name].push(obj)
        }
        parsePath(paths, obj, value, pathIndex++)
      }
    }

    return
  } else if (arrayLast !== -1) {
    throw new Error(`'[' and ']' must be provide in pairs : ${path}`)
  }

  if (node[path] === undefined) {
    node[path] = {}
  }
  if (paths.length === pathIndex) {
    node[path] = value
  } else {
    parsePath(paths, node[path], value, pathIndex++)
  }
}


export function parse(body: Record<string, any>): any {
  const ret: Record<string, any> = {}
  for (const [key, value] of Object.entries(body)) {
    parsePath(key.split('.'), ret, value)
  }
  return ret
}
