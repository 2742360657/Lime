import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { database, type DocumentRow } from '../assistant/database';
import { DocumentQuote } from '../assistant/DocumentQuotes';
import { ProposalCard } from '../assistant/ProposalCard';
import type { ChatMessage } from '../assistant/chatTypes';
import { useHabits } from '../state/HabitStore';

type History = { id: string; title: string; messages: ChatMessage[] };

// Preserve local history; sending is unavailable until the direct runtime is delivered.
export function ChatScreen({ route }: { route?: { params?: { documentId?: string; documentRevision?: number; quoteNonce?: string } } }) {
  const { theme } = useHabits(), c = theme.colors;
  const [histories, setHistories] = useState<History[]>([]), [session, setSession] = useState('');
  const [message, setMessage] = useState(''), [quoted, setQuoted] = useState<DocumentRow | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const rows = await database.getAll<{ id: string; value: string }>("SELECT id,value FROM local_meta WHERE id LIKE 'chat-cache-%' ORDER BY id");
      const list: History[] = [];
      let damaged = false;
      for (const row of rows) {
        try {
          const parsed: unknown = JSON.parse(row.value);
          if (!Array.isArray(parsed) || parsed.some(m => !m || typeof m.id !== 'string' || typeof m.text !== 'string' || !['user', 'assistant'].includes(m.role))) throw new Error('INVALID_HISTORY');
          const messages = parsed as ChatMessage[];
          list.push({ id: row.id.slice('chat-cache-'.length), title: (messages.find(m => m.role === 'user')?.text || '历史对话').slice(0, 22), messages });
        } catch { damaged = true; }
      }
      const saved = await database.getOptional<{ value: string }>('SELECT value FROM local_meta WHERE id=?', ['chat-active']);
      if (active) {
        setHistories(list);
        setSession(list.find(h => h.id === saved?.value)?.id ?? list[0]?.id ?? '');
        if (damaged) setMessage('部分历史对话暂时无法显示，原始缓存仍保留。');
      }
    })().catch(() => { if (active) setMessage('暂时无法读取本机历史，原有内容仍保留。'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setQuoted(null);
    if (route?.params?.documentId) {
      database.getOptional<DocumentRow>('SELECT * FROM documents WHERE id=? AND revision=? AND deleted=0', [route.params.documentId, route.params.documentRevision ?? -1])
        .then(doc => { if (active) { setQuoted(doc ?? null); if (!doc) setMessage('这份引用已变化，请返回记录查看最新内容。'); } })
        .catch(() => { if (active) setMessage('引用暂时无法读取，原记录仍保留。'); });
    }
    return () => { active = false; };
  }, [route?.params?.documentId, route?.params?.documentRevision, route?.params?.quoteNonce]);
  const history = histories.find(h => h.id === session);
  return <ScreenScaffold panelTitle="助手" panelItems={histories.map(h => ({ id: h.id, label: h.title, selected: h.id === session, onPress: () => setSession(h.id) }))}>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>助手</Text>
      <Text style={{ fontSize: 13, lineHeight: 21, color: c.textSecondary }}>助手暂未启用。日记、备忘录、待办和习惯可继续在本机使用。</Text>
      {quoted ? <View style={{ padding: 12, gap: 6, backgroundColor: c.surface, borderRadius: 8 }}>
        <Text style={{ fontSize: 12, color: c.textMuted }}>已选择的记录 · {quoted.date} · 暂不能发送</Text>
        {quoted.title ? <Text style={{ fontSize: 14, color: c.textPrimary }}>{quoted.title}</Text> : null}
        <Text selectable style={{ fontSize: 14, lineHeight: 22, color: c.textSecondary }}>{quoted.body}</Text>
      </View> : null}
      {history ? <Text style={{ fontSize: 12, color: c.textMuted }}>本机历史对话 · 仅查看</Text> : null}
      {message ? <Text style={{ fontSize: 12, color: c.textMuted }}>{message}</Text> : null}
      {history?.messages.map(m => <View key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: m.role === 'user' ? c.primarySoft : c.surface }}>
        <Text selectable style={{ fontSize: 14, lineHeight: 22, color: c.textPrimary }}>{m.text}</Text>
        {m.attachments?.map(a => <Text key={a.id} style={{ fontSize: 12, marginTop: 5, color: c.textSecondary }}>附件：{a.filename} · 本机原件需另行核对</Text>)}
        {m.documents?.map(doc => <DocumentQuote key={doc.id} doc={doc} conversation={history.id} />)}
        {m.proposals?.map(proposal => <ProposalCard key={proposal.id} proposal={proposal} />)}
      </View>)}
    </ScrollView>
  </ScreenScaffold>;
}
