import type { SyncAdapter } from 'zod-config'

export function isMergeableObject(item: unknown): item is Partial<Record<string, unknown>> {
  if (!item) return false
  if (typeof item !== 'object') return false
  // ES6 class instances, Maps, Sets, Arrays, etc. are not considered records
  if (Object.getPrototypeOf(item) === Object.prototype) return true
  // Some library/Node.js functions return records with null prototype
  if (Object.getPrototypeOf(item) === null) return true
  return false
}

export function deepMerge(
  target: Partial<Record<string, unknown>>,
  ...sources: unknown[]
): Partial<Record<string, unknown>> {
  if (!sources.length) {
    return target
  }

  const source = sources.shift()

  if (source === undefined) {
    return target
  }

  if (isMergeableObject(target) && isMergeableObject(source)) {
    for (const key of Object.keys(source)) {
      if (source[key] === undefined) continue

      if (!isMergeableObject(source[key])) {
        target[key] = source[key]
        continue
      }

      const subTarget = target[key]
      if (!isMergeableObject(subTarget)) {
        target[key] = deepMerge({}, source[key])
        continue
      }

      deepMerge(subTarget, source[key])
    }
  }

  return deepMerge(target, ...sources)
}

const nestDelimiter = (data: Record<string, unknown>, delimiter: string) => {
  if (data == null) return {}
  if (!isMergeableObject(data))
    throw new TypeError(`Cannot nest ${data} by delimiter as it is not a record-like object`)

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const nested: Record<string, any> = {}

  for (const [key, value] of Object.entries(data)) {
    const parts = key.split(delimiter)
    let current = nested

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      if (i === parts.length - 1) {
        // Last part - assign the value
        if (part in current) {
          if (typeof current[part] === 'object' && current[part] !== null) {
            if (typeof value === 'object' && value !== null) {
              current[part] = deepMerge(current[part], value)
            } else {
              throw new Error(
                `Environment variable conflict: "${key}" cannot be assigned because "${parts.slice(0, i + 1).join(delimiter)}" already exists as an object (created by another env var)`
              )
            }
          }
        }

        current[part] = value
      } else {
        // Intermediate part - ensure object exists
        if (part in current) {
          if (typeof current[part] !== 'object' || current[part] === null) {
            // Find which env var created this primitive value
            const conflictingPath = parts.slice(0, i + 1).join(delimiter)
            throw new Error(
              `Environment variable conflict: Cannot create nested object at "${conflictingPath}" because it already exists as a primitive value. Conflicting variables: "${key}" and "${conflictingPath}"`
            )
          }
        } else {
          current[part] = {}
        }
        current = current[part]
      }
    }
  }

  return nested
}

export type CustomEnvAdapterProps = {
  /**
   * A delimiter that indicates the parts of the env variable
   * should be parsed as a nested structure.
   *
   * @example __
   */
  nestingDelimiter?: string

  customEnv?: Record<string, unknown>
}

export const customEnvAdapter = ({ nestingDelimiter, customEnv }: CustomEnvAdapterProps = {}): SyncAdapter => {
  return {
    name: 'custom env adapter',
    read: () => {
      const data = customEnv ?? { ...process.env }

      const result = nestingDelimiter ? nestDelimiter(data, nestingDelimiter) : data
      return result
    },
    silent: false,
  }
}
