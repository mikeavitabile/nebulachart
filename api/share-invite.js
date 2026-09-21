import { createClient } from '@supabase/supabase-js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[character]));

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return response.status(401).json({ error: 'Sign in required' });

  const { nebulaId, recipientEmail } = request.body || {};
  const normalizedEmail = typeof recipientEmail === 'string' ? recipientEmail.trim().toLowerCase() : '';
  if (typeof nebulaId !== 'string' || !normalizedEmail) {
    return response.status(400).json({ error: 'Nebula and recipient are required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !supabaseKey || !resendKey) {
    return response.status(500).json({ error: 'Email service is not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return response.status(401).json({ error: 'Session is no longer valid' });

  const { data: nebula, error: nebulaError } = await supabase
    .from('nebulas')
    .select('id,name,owner_id')
    .eq('id', nebulaId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (nebulaError || !nebula) return response.status(403).json({ error: 'Only the owner can send invitations' });

  const { data: share, error: shareError } = await supabase
    .from('nebula_shares')
    .select('permission')
    .eq('nebula_id', nebulaId)
    .eq('shared_with_email', normalizedEmail)
    .maybeSingle();
  if (shareError || !share) return response.status(400).json({ error: 'Share access was not found' });

  const nebulaName = escapeHtml(nebula.name || 'Untitled Nebula');
  const senderEmail = escapeHtml(user.email || 'A Nebula user');
  const accessLabel = share.permission === 'edit' ? 'edit' : 'view';
  const destination = `https://www.nebulachart.com/?strategy=${encodeURIComponent(nebulaId)}`;
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Nebula <no-reply@auth.nebulachart.com>',
      to: [normalizedEmail],
      subject: `A Nebula has been shared with you`,
      html: `<div style="background:#07070d;padding:40px 20px;font-family:Inter,Arial,sans-serif;color:#f5f5f7"><div style="max-width:520px;margin:0 auto;background:#101016;border:1px solid #2b2b36;border-radius:16px;padding:32px"><div style="font-size:26px;font-weight:700;margin-bottom:24px">Nebula</div><h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:#f5f5f7">${nebulaName} was shared with you</h1><p style="font-size:16px;line-height:1.6;color:#b7b7c2;margin:0 0 8px">${senderEmail} gave you permission to <strong style="color:#f5f5f7">${accessLabel}</strong> this Nebula.</p><p style="font-size:16px;line-height:1.6;color:#b7b7c2;margin:0 0 24px">Sign in using ${escapeHtml(normalizedEmail)} to access it.</p><a href="${destination}" style="display:inline-block;background:#f5f5f7;color:#101016;text-decoration:none;font-size:16px;font-weight:700;padding:14px 20px;border-radius:10px">Open this Nebula</a></div></div>`,
    }),
  });
  if (!emailResponse.ok) {
    const failure = await emailResponse.json().catch(() => ({}));
    return response.status(502).json({ error: failure.message || 'Invitation email could not be sent' });
  }
  return response.status(200).json({ sent: true });
}
