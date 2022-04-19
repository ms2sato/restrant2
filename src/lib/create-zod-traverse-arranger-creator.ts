import { z } from 'zod'
import { stripDefault, cast, ArrangeResult, nullArrangeResult } from './zod-util'
import { TraverseArranger, TraverseArrangerCreator } from './parse-form-body'

export function createZodTraverseArrangerCreator(schema: z.AnyZodObject): TraverseArrangerCreator {
  return () => new ZodArranger(schema)
}

export class ZodArranger implements TraverseArranger {
  constructor(private schema: z.AnyZodObject) {}

  next(path: string, node: Record<string, any>, value: any, pathIndex: number): void {
    this.schema = stripDefault(this.schema.shape[path])
  }

  nextItem(name: string, node: Record<string, any>, value: any, pathIndex: number): void {
    let parentSchema = stripDefault(this.schema.shape[name])
    this.schema = stripDefault(parentSchema.element)
  }

  arrangeIndexedArrayItemOnLast(name: string, node: Record<string, any>, value: any, pathIndex: number): ArrangeResult {
    if (this.isArraySchema()) {
      return cast(this.elementSchema(), value)
    }
    return nullArrangeResult
  }

  arrangeUnindexedArrayOnLast(name: string, node: Record<string, any>, value: any[], pathIndex: number): ArrangeResult {
    if (this.isArraySchema()) {
      return this.castArray(this.elementSchema(), value)
    } else {
      console.error(this.schema, name, value)
      throw new Error(`Unexpected Type: ${this.schema}`)
    }
  }

  arrangePropertyOnLast(path: string, node: Record<string, any>, value: any, pathIndex: number): ArrangeResult {
    const result = cast(this.schema, value)
    if (result.arranged) {
      return result
    }
    return nullArrangeResult
  }

  private isArraySchema() {
    return this.schema instanceof z.ZodArray
  }

  private elementSchema() {
    if (!(this.schema instanceof z.ZodArray)) {
      throw new Error('Must be array schema')
    }
    return this.schema.element
  }

  private castArray(elementSchema: z.AnyZodObject, value: any) {
    return {
      arranged: true,
      result: value.map((item: any) => {
        const { result } = cast(elementSchema, item)
        return result
      }),
    }
  }
}
