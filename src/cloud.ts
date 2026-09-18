import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const cloud = url && key ? createClient(url, key) : null;

export type CloudSnapshot<T> = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: T;
};

type Row<T> = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  state: T;
};

export async function listCloudSnapshots<T>(): Promise<CloudSnapshot<T>[]> {
  if (!cloud) return [];
  const { data, error } = await cloud.from('nebulas').select('id,name,created_at,updated_at,state').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Row<T>[]).map((row) => ({
    id: row.id, name: row.name, createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at), state: row.state,
  }));
}

export async function putCloudSnapshot<T>(ownerId: string, snapshot: CloudSnapshot<T>) {
  if (!cloud) return;
  const { error } = await cloud.from('nebulas').upsert({
    id: snapshot.id, owner_id: ownerId, name: snapshot.name,
    created_at: new Date(snapshot.createdAt).toISOString(),
    updated_at: new Date(snapshot.updatedAt).toISOString(), state: snapshot.state,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function removeCloudSnapshot(id: string) {
  if (!cloud) return;
  const { error } = await cloud.from('nebulas').delete().eq('id', id);
  if (error) throw error;
}
