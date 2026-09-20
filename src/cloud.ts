import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || "https://qsehetrwveilpibjkbta.supabase.co";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_0j9R1FouJSW3u8r5m-vNkA_JNkYI360";
export const cloud = createClient(url, key);
export type CloudAccess = 'owner' | 'edit' | 'view';
export type CloudSnapshot<T> = { id: string; name: string; createdAt: number; updatedAt: number; state: T; ownerId?: string; ownerEmail?: string; access?: CloudAccess };
export type NebulaShare = { id: string; nebulaId: string; email: string; permission: 'view' | 'edit' };
type Row<T> = { id: string; name: string; created_at: string; updated_at: string; state: T; owner_id: string; owner_email: string | null };
export async function listCloudSnapshots<T>(userId: string, email: string): Promise<CloudSnapshot<T>[]> {
  const [{ data, error }, { data: shareData, error: shareError }] = await Promise.all([
    cloud.from('nebulas').select('id,name,created_at,updated_at,state,owner_id,owner_email').order('updated_at', { ascending: false }),
    cloud.from('nebula_shares').select('nebula_id,permission').eq('shared_with_email', email.toLowerCase()),
  ]);
  if (error) throw error; if (shareError) throw shareError;
  const permissions = new Map((shareData ?? []).map((s) => [s.nebula_id, s.permission as 'view' | 'edit']));
  return (data as Row<T>[]).map((r) => ({ id: r.id, name: r.name, createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at), state: r.state, ownerId: r.owner_id, ownerEmail: r.owner_email ?? undefined, access: r.owner_id === userId ? 'owner' : (permissions.get(r.id) ?? 'view') }));
}
export async function putCloudSnapshot<T>(ownerId: string, ownerEmail: string, snapshot: CloudSnapshot<T>) {
  const values = { name: snapshot.name, updated_at: new Date(snapshot.updatedAt).toISOString(), state: snapshot.state };
  const { data: updated, error: updateError } = await cloud.from('nebulas').update(values).eq('id', snapshot.id).select('id');
  if (updateError) throw updateError;
  if (updated?.length) return;
  const { error } = await cloud.from('nebulas').insert({ id: snapshot.id, owner_id: ownerId, owner_email: ownerEmail.toLowerCase(), ...values, created_at: new Date(snapshot.createdAt).toISOString() });
  if (error) throw error;
}
export async function removeCloudSnapshot(id: string) { const { error } = await cloud.from('nebulas').delete().eq('id', id); if (error) throw error; }
export async function listNebulaShares(nebulaId: string): Promise<NebulaShare[]> { const { data, error } = await cloud.from('nebula_shares').select('id,nebula_id,shared_with_email,permission').eq('nebula_id', nebulaId).order('created_at'); if (error) throw error; return (data ?? []).map((r) => ({ id: r.id, nebulaId: r.nebula_id, email: r.shared_with_email, permission: r.permission })); }
export async function shareNebula(nebulaId: string, ownerId: string, email: string, permission: 'view' | 'edit') { const { error } = await cloud.from('nebula_shares').upsert({ nebula_id: nebulaId, owner_id: ownerId, shared_with_email: email.trim().toLowerCase(), permission }, { onConflict: 'nebula_id,shared_with_email' }); if (error) throw error; }
export async function unshareNebula(id: string) { const { error } = await cloud.from('nebula_shares').delete().eq('id', id); if (error) throw error; }
