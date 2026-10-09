import { Alert } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { pickAndSaveProfileAvatar } from '../storage/habitStorage';
import { useHabits } from '../state/HabitStore';

type ProfileEditorModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileEditorModal({ visible, onClose }: ProfileEditorModalProps) {
  const { settings, theme, updateProfile } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState(settings.profileName);
  const [signature, setSignature] = useState(settings.profileSignature);
  const [avatarUri, setAvatarUri] = useState<string | null>(settings.avatarUri);
  const [isPicking, setIsPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(settings.profileName);
    setSignature(settings.profileSignature);
    setAvatarUri(settings.avatarUri);
  }, [settings.avatarUri, settings.profileName, settings.profileSignature, visible]);

  const handlePickAvatar = async () => {
    try {
      setIsPicking(true);
      const nextUri = await pickAndSaveProfileAvatar();
      if (nextUri) setAvatarUri(nextUri);
    } catch (error) {
      Alert.alert('无法读取图片', error instanceof Error ? error.message : '请换一张图片再试。');
    } finally {
      setIsPicking(false);
    }
  };

  const handleSave = () => {
    if (updateProfile(name, signature, avatarUri)) onClose();
  };

  const initial = name.trim().slice(0, 1).toUpperCase() || '酸';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>个人资料</Text>
          <TouchableOpacity onPress={handleSave} style={[styles.headerButton, styles.saveButton]}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarSection}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.avatarActions}>
              <TouchableOpacity disabled={isPicking} onPress={handlePickAvatar} style={styles.photoButton}>
                <Text style={styles.photoButtonText}>{isPicking ? '正在读取…' : '选择头像'}</Text>
              </TouchableOpacity>
              {avatarUri ? (
                <TouchableOpacity onPress={() => setAvatarUri(null)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>移除</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              autoFocus
              maxLength={32}
              value={name}
              onChangeText={setName}
              placeholder="用户名"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>个性签名</Text>
            <TextInput
              multiline
              maxLength={80}
              value={signature}
              onChangeText={setSignature}
              placeholder="个性签名"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.signatureInput]}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    headerButton: { minWidth: 60, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
    headerButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    saveButton: { borderRadius: 12, backgroundColor: theme.colors.primary },
    saveButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.white },
    content: { padding: 20, paddingBottom: 44, gap: 24 },
    avatarSection: { alignItems: 'center', gap: 12 },
    avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.primarySoft },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 34, fontWeight: '800', color: theme.colors.primary },
    avatarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    photoButton: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10, backgroundColor: theme.colors.primarySoft },
    photoButtonText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
    removeButton: { paddingHorizontal: 10, paddingVertical: 10 },
    removeButtonText: { fontSize: 13, fontWeight: '700', color: theme.colors.danger },
    field: { gap: 9 },
    label: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
    },
    signatureInput: { minHeight: 92, textAlignVertical: 'top' },
  });
}
