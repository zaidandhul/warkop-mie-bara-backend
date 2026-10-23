export function jsonColumn(value, fallback) {
  if (value == null) return fallback
  if (Buffer.isBuffer(value)) value = value.toString('utf8')
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function jsonArray(value) {
  const parsed = jsonColumn(value, [])
  return Array.isArray(parsed) ? parsed : []
}
