// Per-session description cache: hashes attachments by (mime + url) so the same
// image dropped across multiple turns is analysed once within the TTL window.
export class DescriptionCache {
  private map = new Map<string, { description: string; expiresAt: number }>()

  constructor(private readonly ttlMs: number) {}

  get(hash: string): string | undefined {
    const entry = this.map.get(hash)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.map.delete(hash)
      return undefined
    }
    return entry.description
  }

  set(hash: string, description: string): void {
    this.map.set(hash, { description, expiresAt: Date.now() + this.ttlMs })
  }

  cleanup(): void {
    const now = Date.now()
    for (const [hash, entry] of this.map) {
      if (now > entry.expiresAt) this.map.delete(hash)
    }
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
