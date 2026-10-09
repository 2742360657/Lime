import { Text, View } from 'react-native';
import { useHabits } from '../state/HabitStore';
import type { TaskProposal } from './chatTypes';

export function ProposalCard({ proposal }: { proposal: TaskProposal }) {
  const { theme } = useHabits(), c = theme.colors;
  return <View style={{ gap: 5, marginTop: 8 }}>
    <Text style={{ fontSize: 13, color: c.textPrimary }}>{proposal.summary}</Text>
    {proposal.items.map((item, index) => <Text key={index} style={{ fontSize: 12, color: c.textSecondary }}>{item.title}{item.due_date ? ` · ${item.due_date}` : ''}</Text>)}
    <Text style={{ fontSize: 11, color: c.textMuted }}>历史建议仅展示，不会自动执行。</Text>
  </View>;
}
