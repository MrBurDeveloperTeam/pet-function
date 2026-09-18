/**
 * Structural boundary for the existing authenticated Supabase client.
 * No URL, key or login state is stored by the package.
 * PostgREST's fluent builder is intentionally opaque: each preserved
 * repository validates/maps rows using its own original schema types.
 */
export interface PetDatabaseClient {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error?: any }> };
}
